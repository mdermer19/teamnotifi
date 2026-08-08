const twilio = require('twilio');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

let client = null;
function getClient() {
  if (!client) client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return client;
}

// Server-initiated outbound SMS (not a TwiML reply to an inbound webhook).
// Records every send attempt — including immediate failures — so the admin
// delivery view has a complete picture regardless of whether Twilio's webhook
// fires later.
//
// Options:
//   absenceId    — links the message to an absence record
//   messageType  — 'link' | 'confirmation' | 'manager_notification'
//   employeeId   — employee the message is addressed to (for admin UI identity)
async function sendSms(to, body, { absenceId = null, messageType = null, employeeId = null } = {}) {
  if (!to) return { sent: false, reason: 'no destination number' };

  let msg;
  try {
    msg = await getClient().messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
  } catch (err) {
    // Twilio rejected the request immediately (bad number, suspended account,
    // etc.).  Record a failed SmsMessage and raise an admin alert so this
    // doesn't disappear silently into a log file.
    console.error(`[smsSender] Twilio API error sending to ${to}:`, err.message);
    const record = await prisma.smsMessage
      .create({
        data: {
          phone: to,
          direction: 'outbound',
          body,
          absenceId,
          messageType,
          employeeId,
          deliveryStatus: 'failed',
          statusUpdatedAt: new Date(),
          errorCode: String(err.code ?? err.status ?? ''),
        },
      })
      .catch((e) => { console.error('[smsSender] failed to log API error:', e.message); return null; });

    if (record) {
      await prisma.smsAlert
        .create({ data: { smsMessageId: record.id } })
        .catch(() => {}); // unique constraint violation = alert already exists, fine
    }

    return { sent: false, reason: err.message };
  }

  // Twilio accepted — log with the SID so the status callback can find and
  // update this row when delivery is confirmed or fails.
  await prisma.smsMessage
    .create({
      data: {
        phone: to,
        direction: 'outbound',
        body,
        absenceId,
        messageType,
        employeeId,
        twilioSid: msg.sid,
        deliveryStatus: 'queued',
        statusUpdatedAt: new Date(),
      },
    })
    .catch((e) => console.error('[smsSender] failed to log message:', e.message));

  return { sent: true, sid: msg.sid };
}

module.exports = { sendSms };
