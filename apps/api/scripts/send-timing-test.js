require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const twilio = require('twilio');

const TIMING_LOG = path.join(__dirname, '../logs/sms-timing.jsonl');
function logTiming(record) {
  fs.appendFileSync(TIMING_LOG, JSON.stringify({ loggedAt: new Date().toISOString(), ...record }) + '\n');
}

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const MG_SID = 'MG756c7162a8579c0b3b5c721d2bb2986f';
const BASE = process.env.API_BASE_URL;

async function main() {
  const [, , to, label, countArg] = process.argv;
  const count = parseInt(countArg || '10', 10);
  if (!to || !label) {
    console.error('Usage: node send-timing-test.js <toNumber> <label> [count]');
    process.exit(1);
  }

  for (let i = 1; i <= count; i++) {
    const tSend = Date.now();
    const testId = `${label}-${i}-${tSend}`;
    const body = `Hi! If you are reporting an absence or late arrival, reply YES to continue or CANCEL to stop. [test ${testId}]`;
    const cbUrl = `${BASE}/webhook/sms-status?in=CONTROLLED_TEST&t0=${tSend}&t1=${tSend}&testId=${encodeURIComponent(testId)}`;
    try {
      const msg = await client.messages.create({
        to,
        messagingServiceSid: MG_SID,
        body,
        statusCallback: cbUrl,
      });
      logTiming({
        event: 'controlled_test_sent',
        testId, label, index: i, to,
        outboundSid: msg.sid,
        initialStatus: msg.status,
        tSend,
        tRestReturned: Date.now(),
      });
      console.log(`[${i}/${count}] sent to ${to} sid=${msg.sid} testId=${testId}`);
    } catch (e) {
      console.error(`[${i}/${count}] FAILED:`, e.message);
      logTiming({ event: 'controlled_test_send_failed', testId, label, index: i, to, error: e.message, tSend });
    }
    // Space sends out to avoid looking like a burst/spam pattern and to keep timestamps distinguishable
    await new Promise(r => setTimeout(r, 15000));
  }
}

main().then(() => process.exit(0));
