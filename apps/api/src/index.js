require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const twilio = require('twilio');
const { twiml: { MessagingResponse } } = require('twilio');
const { PrismaClient } = require('@prisma/client');
const { clerkMiddleware, requireAuth } = require('@clerk/express');
const { handleInbound, normalizeInbound } = require('./sms/handler');
const { sendSms } = require('./services/smsSender');
const { withAppUser } = require('./middleware/appUser');

const prisma = new PrismaClient();

// Append-only timing log for SMS latency diagnostics.
const TIMING_LOG = path.join(__dirname, '../logs/sms-timing.jsonl');
try { fs.mkdirSync(path.dirname(TIMING_LOG), { recursive: true }); } catch {}
function logTiming(record) {
  try {
    fs.appendFileSync(TIMING_LOG, JSON.stringify({ loggedAt: new Date().toISOString(), ...record }) + '\n');
  } catch (e) {
    console.error('[timing] log write failed:', e.message);
  }
}

const app = express();

app.use(cors({
  origin: ['http://localhost:3001', 'http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
}));
// Clerk is only needed for the authenticated dashboard API. Scoping it there
// keeps the Twilio webhook, the public report flow and the static assets
// working even if Clerk is unreachable or a key is mid-rotation — an employee
// reporting an absence must never depend on our admin auth provider.
const clerk = clerkMiddleware();
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/') || req.path.startsWith('/api/report')) return next();
  return clerk(req, res, next);
});

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// SMS webhook — validate Twilio signature in production
app.post('/webhook/sms', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    const signature = req.headers['x-twilio-signature'] || '';
    const url = `${process.env.API_BASE_URL}/webhook/sms`;
    const isValid = twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN,
      signature,
      url,
      req.body
    );
    if (!isValid) {
      console.warn('Invalid Twilio signature rejected');
      return res.status(403).send('Forbidden');
    }
  }

  const t0 = Date.now();
  const inboundSid = req.body.MessageSid || '';
  const from = normalizeInbound(req.body.From || '');
  const body = req.body.Body || '';
  console.log(`SMS from ${from}: ${body}`);
  logTiming({ event: 'webhook_received', inboundSid, from, body, t0 });

  try {
    const { reply, absenceId, employeeId } = await handleInbound(from, body);
    const t1 = Date.now();
    logTiming({ event: 'app_finished', inboundSid, from, t0, t1, appMs: t1 - t0, hasReply: !!reply });

    // Return empty TwiML immediately, then send the reply through the
    // Messaging Service so it's covered by the A2P campaign. TwiML replies
    // bypass the Messaging Service and get blocked by carriers (error 30007).
    const response = new MessagingResponse();
    res.type('text/xml');
    res.send(response.toString());

    if (reply) {
      sendSms(from, reply, { absenceId, employeeId }).catch(err =>
        console.error(`[webhook/sms] sendSms failed for ${from}:`, err.message)
      );
    }
  } catch (err) {
    console.error('Webhook error:', err);
    logTiming({ event: 'webhook_error', inboundSid, from, t0, error: err.message });
    const response = new MessagingResponse();
    res.type('text/xml');
    res.send(response.toString());

    sendSms(from, 'Sorry, something went wrong. Please try again.').catch(() => {});
  }
});

// Messaging Service delivery status callback — fires for ALL outbound messages
// sent through the Messaging Service (both REST API and TwiML replies).
// Configure this URL in Twilio Console → Messaging → Services → [service] →
// Integration → Delivery Status Callback.
app.post('/webhook/twilio/status', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    const signature = req.headers['x-twilio-signature'] || '';
    const url = `${process.env.API_BASE_URL}/webhook/twilio/status`;
    const isValid = twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, signature, url, req.body);
    if (!isValid) {
      console.warn('[sms-delivery] Invalid Twilio signature — request rejected');
      return res.status(403).send('Forbidden');
    }
  }

  const { MessageSid, MessageStatus, ErrorCode, To } = req.body;
  if (!MessageSid) return res.sendStatus(400);

  const status = (MessageStatus || '').toLowerCase();
  const errorCode = ErrorCode || null;
  const isFailure = status === 'failed' || status === 'undelivered';

  console.log(`[sms-delivery] ${MessageSid} → ${status}${errorCode ? ` (error ${errorCode})` : ''}`);

  try {
    const TERMINAL = ['delivered', 'failed', 'undelivered'];

    let msg = await prisma.smsMessage.findUnique({ where: { twilioSid: MessageSid } });

    if (!msg) {
      // Message was sent via TwiML (not through sendSms) so no pre-existing row.
      // Create a minimal record so the alert system has something to attach to.
      if (To) {
        try {
          msg = await prisma.smsMessage.create({
            data: {
              phone: To,
              direction: 'outbound',
              body: '',
              twilioSid: MessageSid,
              deliveryStatus: status,
              statusUpdatedAt: new Date(),
              errorCode,
            },
          });
        } catch (e) {
          if (e.code === 'P2002') {
            // Race: another callback already created it
            msg = await prisma.smsMessage.findUnique({ where: { twilioSid: MessageSid } });
          } else {
            throw e;
          }
        }
      }
      if (!msg) {
        console.warn(`[sms-delivery] Unknown MessageSid and no To — skipping: ${MessageSid}`);
        return res.sendStatus(200);
      }
    } else {
      // Update status unless we already have a terminal answer
      if (!TERMINAL.includes(msg.deliveryStatus)) {
        await prisma.smsMessage.update({
          where: { id: msg.id },
          data: {
            deliveryStatus: status,
            statusUpdatedAt: new Date(),
            errorCode: errorCode ?? msg.errorCode,
          },
        });
      }
    }

    if (isFailure) {
      await prisma.smsAlert
        .create({ data: { smsMessageId: msg.id } })
        .catch(() => {}); // P2002 = duplicate webhook, alert already created
      console.warn(`[sms-delivery] ALERT: ${status} for ${MessageSid}${errorCode ? ` error=${errorCode}` : ''}`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('[sms-delivery] callback processing error:', err.message);
    res.sendStatus(500);
  }
});

// Per-message status callback for TwiML replies — used for latency diagnostics.
// (The Messaging Service callback above handles delivery monitoring for all messages.)
app.post('/webhook/sms-status', (req, res) => {
  const tCallback = Date.now();
  logTiming({
    event: 'status_callback',
    outboundSid: req.body.MessageSid || '',
    status: req.body.MessageStatus || req.body.SmsStatus || '',
    to: req.body.To || '',
    errorCode: req.body.ErrorCode || null,
    inboundSid: req.query.in || '',
    t0: req.query.t0 ? Number(req.query.t0) : null,
    t1: req.query.t1 ? Number(req.query.t1) : null,
    tCallback,
  });
  res.sendStatus(200);
});

// Public, token-authenticated web report flow. MUST stay above the Clerk gate
// below — employees completing a report have no login and no Clerk session.
app.use('/api/report', require('./routes/report'));

// All REST API routes — require valid Clerk session + resolve app user
app.use('/api', requireAuth(), withAppUser);

app.use('/api/locations', require('./routes/locations'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/absences', require('./routes/absences'));
app.use('/api/coverage', require('./routes/coverage'));
app.use('/api/users', require('./routes/users'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/sms-alerts', require('./routes/smsAlerts'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Serve dashboard static build
const dashboardDist = path.join(__dirname, '../../dashboard/dist');
app.use(express.static(dashboardDist));
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(dashboardDist, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (process.send) process.send('ready');
});
