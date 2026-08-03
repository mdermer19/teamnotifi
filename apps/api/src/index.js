require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const twilio = require('twilio');
const { twiml: { MessagingResponse } } = require('twilio');
const { clerkMiddleware, requireAuth } = require('@clerk/express');
const { handleInbound, logMessage, normalizeInbound } = require('./sms/handler');
const { withAppUser } = require('./middleware/appUser');

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
app.use(clerkMiddleware());
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
    const { reply, absenceId } = await handleInbound(from, body);
    const t1 = Date.now();
    logTiming({ event: 'app_finished', inboundSid, from, t0, t1, appMs: t1 - t0, hasReply: !!reply });

    if (reply) await logMessage(from, 'outbound', reply, absenceId);
    const response = new MessagingResponse();
    if (reply) {
      const base = process.env.API_BASE_URL || '';
      const cbUrl = `${base}/webhook/sms-status?in=${encodeURIComponent(inboundSid)}&t0=${t0}&t1=${t1}`;
      response.message({ statusCallback: cbUrl }, reply);
    }
    res.type('text/xml');
    res.send(response.toString());
  } catch (err) {
    console.error('Webhook error:', err);
    logTiming({ event: 'webhook_error', inboundSid, from, t0, error: err.message });
    const response = new MessagingResponse();
    response.message('Sorry, something went wrong. Please try again.');
    res.type('text/xml');
    res.send(response.toString());
  }
});

// Twilio status callback — fires on queued/sending/sent/delivered/undelivered/failed
// for each outbound reply, letting us measure real carrier-side latency per message.
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

// All REST API routes — require valid Clerk session + resolve app user
app.use('/api', requireAuth(), withAppUser);

app.use('/api/locations', require('./routes/locations'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/absences', require('./routes/absences'));
app.use('/api/coverage', require('./routes/coverage'));
app.use('/api/users', require('./routes/users'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/reports', require('./routes/reports'));

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
