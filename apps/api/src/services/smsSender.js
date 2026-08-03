const twilio = require('twilio');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

let client = null;
function getClient() {
  if (!client) client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return client;
}

// Server-initiated outbound SMS (i.e. not a TwiML reply to an inbound webhook).
// Also records the message so it shows up in the conversation view and audit
// trail alongside everything else.
async function sendSms(to, body, absenceId = null) {
  if (!to) return { sent: false, reason: 'no destination number' };

  const msg = await getClient().messages.create({
    body,
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
  });

  await prisma.smsMessage
    .create({ data: { phone: to, direction: 'outbound', body, absenceId } })
    .catch((e) => console.error('[smsSender] failed to log message:', e.message));

  return { sent: true, sid: msg.sid };
}

module.exports = { sendSms };
