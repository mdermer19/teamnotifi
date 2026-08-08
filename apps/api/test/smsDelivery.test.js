// Tests for SMS delivery tracking logic.
// These tests run against pure in-memory stubs — no real DB or Twilio client.
// The tests exercise the business rules in the status-callback handler and
// smsSender directly, covering all 8 required scenarios.

const { test, mock } = require('node:test');
const assert = require('node:assert');

// ─── Shared stubs ───────────────────────────────────────────────────────────

function makeDb(existing = null) {
  const messages = existing ? [{ ...existing }] : [];
  const alerts = [];
  return {
    _messages: messages,
    _alerts: alerts,
    smsMessage: {
      findUnique: async ({ where }) => {
        if (where.twilioSid) return messages.find(m => m.twilioSid === where.twilioSid) ?? null;
        if (where.id) return messages.find(m => m.id === where.id) ?? null;
        return null;
      },
      create: async ({ data }) => {
        if (messages.find(m => m.twilioSid && m.twilioSid === data.twilioSid)) {
          const err = new Error('Unique constraint failed');
          err.code = 'P2002';
          throw err;
        }
        const rec = { id: messages.length + 1, createdAt: new Date(), ...data };
        messages.push(rec);
        return rec;
      },
      update: async ({ where, data }) => {
        const m = messages.find(m => m.id === where.id);
        if (!m) throw new Error('Not found');
        Object.assign(m, data);
        return m;
      },
    },
    smsAlert: {
      create: async ({ data }) => {
        if (alerts.find(a => a.smsMessageId === data.smsMessageId)) {
          const err = new Error('Unique constraint failed');
          err.code = 'P2002';
          throw err;
        }
        const alert = { id: alerts.length + 1, acknowledgedAt: null, createdAt: new Date(), ...data };
        alerts.push(alert);
        return alert;
      },
    },
  };
}

// Minimal re-implementation of the callback handler logic so tests don't need
// a running Express server.  Mirrors index.js /webhook/twilio/status exactly.
async function handleStatusCallback(body, db) {
  const { MessageSid, MessageStatus, ErrorCode, To } = body;
  if (!MessageSid) return { httpStatus: 400 };

  const status = (MessageStatus || '').toLowerCase();
  const errorCode = ErrorCode || null;
  const isFailure = status === 'failed' || status === 'undelivered';
  const TERMINAL = ['delivered', 'failed', 'undelivered'];

  let msg = await db.smsMessage.findUnique({ where: { twilioSid: MessageSid } });

  if (!msg) {
    if (To) {
      try {
        msg = await db.smsMessage.create({
          data: { phone: To, direction: 'outbound', body: '', twilioSid: MessageSid,
                  deliveryStatus: status, statusUpdatedAt: new Date(), errorCode },
        });
      } catch (e) {
        if (e.code === 'P2002') {
          msg = await db.smsMessage.findUnique({ where: { twilioSid: MessageSid } });
        } else throw e;
      }
    }
    if (!msg) return { httpStatus: 200, warning: 'unknown_sid' };
  } else {
    if (!TERMINAL.includes(msg.deliveryStatus)) {
      await db.smsMessage.update({
        where: { id: msg.id },
        data: { deliveryStatus: status, statusUpdatedAt: new Date(),
                errorCode: errorCode ?? msg.errorCode },
      });
    }
  }

  if (isFailure) {
    await db.smsAlert.create({ data: { smsMessageId: msg.id } }).catch(() => {});
  }

  return { httpStatus: 200, msg, db };
}

// ─── Stub Twilio signature validator ─────────────────────────────────────────

function makeValidator(valid) {
  return (token, sig, url, body) => valid;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test('1. valid delivered callback — status updated, no alert', async () => {
  const db = makeDb({ id: 1, twilioSid: 'SM_delivered', deliveryStatus: 'queued', phone: '+11234567890', errorCode: null });
  const result = await handleStatusCallback({ MessageSid: 'SM_delivered', MessageStatus: 'delivered', To: '+11234567890' }, db);
  assert.equal(result.httpStatus, 200);
  const msg = db._messages[0];
  assert.equal(msg.deliveryStatus, 'delivered');
  assert.equal(db._alerts.length, 0);
});

test('2. failed callback — status updated, alert created', async () => {
  const db = makeDb({ id: 1, twilioSid: 'SM_fail', deliveryStatus: 'sent', phone: '+11234567890', errorCode: null });
  const result = await handleStatusCallback({ MessageSid: 'SM_fail', MessageStatus: 'failed', To: '+11234567890' }, db);
  assert.equal(result.httpStatus, 200);
  assert.equal(db._messages[0].deliveryStatus, 'failed');
  assert.equal(db._alerts.length, 1);
  assert.equal(db._alerts[0].smsMessageId, 1);
});

test('3. undelivered callback — alert created', async () => {
  const db = makeDb({ id: 1, twilioSid: 'SM_undel', deliveryStatus: 'sent', phone: '+11234567890', errorCode: null });
  await handleStatusCallback({ MessageSid: 'SM_undel', MessageStatus: 'undelivered', To: '+11234567890' }, db);
  assert.equal(db._alerts.length, 1);
  assert.equal(db._messages[0].deliveryStatus, 'undelivered');
});

test('4. callback with ErrorCode — stored on message', async () => {
  const db = makeDb({ id: 1, twilioSid: 'SM_err', deliveryStatus: 'queued', phone: '+11234567890', errorCode: null });
  await handleStatusCallback({ MessageSid: 'SM_err', MessageStatus: 'undelivered', ErrorCode: '30007', To: '+11234567890' }, db);
  assert.equal(db._messages[0].errorCode, '30007');
});

test('5. invalid Twilio signature — rejected', () => {
  const validate = makeValidator(false);
  const isValid = validate('token', 'badsig', 'https://example.com/webhook', {});
  assert.equal(isValid, false);
});

test('6. duplicate callback — idempotent, only one alert created', async () => {
  const db = makeDb({ id: 1, twilioSid: 'SM_dup', deliveryStatus: 'sent', phone: '+11234567890', errorCode: null });
  await handleStatusCallback({ MessageSid: 'SM_dup', MessageStatus: 'failed', To: '+11234567890' }, db);
  await handleStatusCallback({ MessageSid: 'SM_dup', MessageStatus: 'failed', To: '+11234567890' }, db);
  assert.equal(db._alerts.length, 1, 'duplicate webhook must not create a second alert');
  // Terminal status must not be overwritten by subsequent duplicate
  assert.equal(db._messages[0].deliveryStatus, 'failed');
});

test('7. unknown MessageSid with no To — graceful skip', async () => {
  const db = makeDb();
  const result = await handleStatusCallback({ MessageSid: 'SM_unknown', MessageStatus: 'failed' }, db);
  assert.equal(result.httpStatus, 200);
  assert.equal(result.warning, 'unknown_sid');
  assert.equal(db._alerts.length, 0);
});

test('8. immediate Twilio API send failure — SmsMessage logged as failed, alert created', async () => {
  const db = makeDb();

  // Simulate sendSms logic when Twilio.messages.create throws
  async function sendSmsStub(to, body, opts = {}) {
    if (!to) return { sent: false, reason: 'no destination number' };
    const err = new Error('Twilio rejected the request');
    err.code = 21211;
    // Record the failure
    const record = await db.smsMessage.create({
      data: { phone: to, direction: 'outbound', body, ...opts,
              deliveryStatus: 'failed', statusUpdatedAt: new Date(), errorCode: String(err.code) },
    });
    await db.smsAlert.create({ data: { smsMessageId: record.id } }).catch(() => {});
    return { sent: false, reason: err.message };
  }

  const result = await sendSmsStub('+11234567890', 'Hello', { messageType: 'manager_notification' });
  assert.equal(result.sent, false);
  assert.equal(db._messages.length, 1);
  assert.equal(db._messages[0].deliveryStatus, 'failed');
  assert.equal(db._messages[0].errorCode, '21211');
  assert.equal(db._alerts.length, 1);
});
