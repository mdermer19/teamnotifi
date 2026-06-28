require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const twilio = require('twilio');
const { twiml: { MessagingResponse } } = require('twilio');
const { clerkMiddleware, requireAuth } = require('@clerk/express');
const { handleInbound, logMessage } = require('./sms/handler');
const { withAppUser } = require('./middleware/appUser');

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

  const from = req.body.From || '';
  const body = req.body.Body || '';
  console.log(`SMS from ${from}: ${body}`);

  try {
    const { reply, absenceId } = await handleInbound(from, body);
    if (reply) await logMessage(from, 'outbound', reply, absenceId);
    const response = new MessagingResponse();
    if (reply) response.message(reply);
    res.type('text/xml');
    res.send(response.toString());
  } catch (err) {
    console.error('Webhook error:', err);
    const response = new MessagingResponse();
    response.message('Sorry, something went wrong. Please try again.');
    res.type('text/xml');
    res.send(response.toString());
  }
});

// All REST API routes — require valid Clerk session + resolve app user
app.use('/api', requireAuth(), withAppUser);

app.use('/api/locations', require('./routes/locations'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/absences', require('./routes/absences'));
app.use('/api/coverage', require('./routes/coverage'));
app.use('/api/users', require('./routes/users'));

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
});
