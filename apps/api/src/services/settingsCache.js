const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
// Deliberately short: see the note above refreshTemplates() about why the
// cross-worker invalidation approach was abandoned. This is the upper bound on
// how long a settings change can take to reach every worker.
const CACHE_TTL = 15 * 1000;

const DEFAULT_TEMPLATES = {
  UNKNOWN_PHONE: "We don't recognize this number. Reply with your Employee ID to get set up.",
  CONFIRM_START: 'Hi {{firstName}}! If you are reporting an absence or late arrival, reply YES to continue or CANCEL to stop.',
  CONFIRM_DATE: 'What date are you reporting for? Reply TODAY, TOMORROW, or a date (e.g. 06/20).',
  INVALID_DATE: "Didn't catch that. Reply TODAY, TOMORROW, or a date like 06/20.",
  SELECT_REASON: "Please select a reason:\n1 - I'm Sick\n2 - Family/Personal Emergency\n3 - Late Arrival\n4 - Other",
  INVALID_REASON: 'Please reply with a number 1-4.',
  SICK_NOTE_PROMPT: "Will you be getting a doctor's note? Reply YES or NO.",
  SICK_YES_NOTE: "Sounds like a plan! Your absence has been recorded for {{dateRange}}. Please provide a copy of the doctor's note to your manager within 48 hours and you will not receive any points per the Attendance Policy. However, if you do not submit a doctor's note within 48 hours, the absence will be considered unexcused and you will receive 2 points per the Attendance Policy.",
  SICK_NO_NOTE: "We're sorry to hear you're not feeling well. Your absence has been recorded for {{dateRange}}. Since you will not be providing a doctor's note, you will receive 2 points per the Attendance Policy.",
  SICK_REPROMPT: 'Please reply YES or NO.',
  FAMILY_DETAILS_PROMPT: 'Required - please provide further details about the nature of your absence.',
  FAMILY_DETAILS_ACK: 'We are sorry to hear you are dealing with an emergency. Per the Attendance Policy, an emergency situation includes but is not limited to unexpected family, household, or personal emergencies. Management will determine whether this is an excused absence and whether documentation is required.',
  FAMILY_PROOF_PROMPT: 'Are you able to provide proof of this emergency? Reply YES or NO.',
  FAMILY_YES_PROOF: "Sounds like a plan! Your absence has been recorded for {{dateRange}}. Please send proof to your manager within 48 hours. The nature of the emergency is subject to management review. If it is determined to be a true emergency, you will not receive any points per the Attendance Policy. If it's determined this is not a true emergency or proof is required and not received within 48 hours, you will receive 2 points per the Attendance Policy.",
  FAMILY_NO_PROOF: "Ok, we understand. Your absence has been recorded for {{dateRange}}. Your manager will determine whether proof is required for this emergency. If no proof is required, then you will not receive any points per the Attendance Policy. If proof is required and not received within 48 hours, you will receive 2 points per the Attendance Policy.",
  FAMILY_REPROMPT: 'Please reply YES or NO.',
  LATE_ARRIVAL_TIME_PROMPT: 'Approximately what time do you expect to arrive?',
  LATE_DONE: 'Thank you for letting us know, {{firstName}}. Your manager has been notified. If you clock in within 7 minutes of your scheduled start time, you will not receive any points. If you are tardy by more than 7 minutes, you will receive 1 point per the Attendance Policy.',
  LATE_MESSAGE: 'If you clock in within 7 minutes of your scheduled start time, you will not receive any points. If you are tardy by more than 7 minutes, you will receive 1 point per the Attendance Policy.',
  OTHER_DETAILS_PROMPT: 'Please briefly describe the reason for your absence.',
  OTHER_DONE: 'Got it, {{firstName}}. Your absence has been recorded for {{dateRange}} and your manager has been notified.',
  MULTI_DAY_PROMPT: 'Do you plan to miss more than one day? Reply YES or NO.',
  RETURN_DATE_PROMPT: 'What date do you plan to return to work? Reply a date (e.g. 06/22).',
  INVALID_RETURN_DATE: "Didn't catch that. Please reply with a return date like 06/22.",
  CANCEL: 'No problem. Text us anytime.',
  REPROMPT: "Didn't catch that. {{original}}",
  DUPLICATE_ABSENCE: 'You already reported out for {{date}}. Reply UPDATE to change it or CANCEL to keep the existing report.',
  ABSENCE_CONFIRMED: 'Your absence has been recorded for {{dateRange}}. Your manager has been notified.',

  // --- Web report flow: the single SMS that starts it -----------------------
  LINK_SENT: 'TeamNotifi: Hi {{firstName}}, use this link to report an absence or late arrival: {{reportUrl}}',
  LINK_RATE_LIMITED: 'You have requested several links recently. Please use the most recent link, or try again later.',

  // --- Web report flow: on-screen copy -------------------------------------
  // Deliberately a SEPARATE set from the SMS templates above: editing SMS
  // wording must never silently change the web page, and vice versa.
  WEB_DATE_TITLE: 'What date are you reporting?',
  WEB_DATE_HELP: '',
  WEB_REASON_TITLE: "What's the reason?",
  WEB_REASON_HELP: '',
  WEB_MULTIDAY_TITLE: 'Will you miss more than one day?',
  WEB_MULTIDAY_HELP: '',
  WEB_RETURN_DATE_TITLE: 'When do you plan to return to work?',
  WEB_RETURN_DATE_HELP: 'Choose your first day back.',
  WEB_SICK_NOTE_TITLE: "Will you provide a doctor's note?",
  WEB_SICK_NOTE_HELP: "Providing a note within 48 hours means 0 points. Without one, the absence is 2 points per the Attendance Policy.",
  WEB_EMERG_DETAILS_TITLE: 'Briefly describe the emergency',
  WEB_EMERG_DETAILS_HELP: 'Management will determine whether this is an excused absence and whether documentation is required.',
  WEB_PROOF_TITLE: 'Can you provide proof of this emergency?',
  WEB_PROOF_HELP: 'This is not required, but it helps your manager determine if the absence is excused.',
  WEB_LATE_TIME_TITLE: 'About what time will you arrive?',
  WEB_LATE_TIME_HELP: 'For example: 9:15am',
  WEB_OTHER_DETAILS_TITLE: 'Briefly describe the reason',
  WEB_OTHER_DETAILS_HELP: '',
  WEB_CONFIRM_TITLE: "You're all set, {{firstName}}.",
  WEB_CONFIRM_BODY: 'Your absence has been recorded for {{dateRange}} and your manager has been notified.',
  WEB_EXPIRED_TITLE: 'This link has expired',
  WEB_EXPIRED_BODY: 'For your security, report links expire after a short time. Text us again to get a new link.',
  WEB_ALREADY_TITLE: 'Already submitted',
  WEB_ALREADY_BODY: 'This report was already submitted and your manager has been notified.',
  WEB_DUPLICATE_TITLE: 'Already reported',
  WEB_DUPLICATE_BODY: 'You already have an absence on file for {{dateRange}}. Contact your manager if you need to change it.',
  WEB_NOT_FOUND_TITLE: 'Link not found',
  WEB_NOT_FOUND_BODY: "This link isn't valid. Text us again to get a new one.",

  // --- Web report flow: confirmation SMS (for the employee's records) -------
  // The web confirmation screen is authoritative; this text is a receipt.
  // Separate keys again so this can be tuned without touching either the
  // legacy SMS conversation or the web page copy.
  CONFIRM_SMS_SICK_NOTE: "Recorded: {{dateRange}}. Provide your doctor's note to your manager within 48 hours for 0 points, otherwise 2 points per the Attendance Policy.",
  CONFIRM_SMS_SICK_NO_NOTE: 'Recorded: {{dateRange}}. Without a doctor\'s note this is 2 points per the Attendance Policy.',
  CONFIRM_SMS_EMERG_PROOF: 'Recorded: {{dateRange}}. Please send proof to your manager within 48 hours.',
  CONFIRM_SMS_EMERG_NO_PROOF: 'Recorded: {{dateRange}}. Your manager will determine whether proof is required.',
  CONFIRM_SMS_LATE: 'Recorded: late arrival on {{dateRange}}, expected around {{lateArrivalTime}}. Within 7 minutes of your start time is 0 points; more than 7 minutes is 1 point.',
  CONFIRM_SMS_OTHER: 'Recorded: {{dateRange}}. Management will determine whether this is an excused absence.',
  CONFIRM_SMS_GENERIC: 'Recorded: {{dateRange}}. Your manager has been notified.',
};

const DEFAULT_WORKFLOW = {
  session_timeout_minutes: '30',
  multi_day_prompt_enabled: 'true',
  dr_note_prompt_enabled: 'true',
  proof_prompt_enabled: 'true',

  // Web report flow. Defaults OFF: with this false the existing
  // conversational SMS workflow runs completely unchanged.
  web_report_flow_enabled: 'false',
  report_token_ttl_minutes: '120',
  report_token_max_per_hour: '5',
  report_link_dedupe_seconds: '60',
  confirm_sms_enabled: 'true',
};

let templateCache = { ...DEFAULT_TEMPLATES };
let workflowCache = { ...DEFAULT_WORKFLOW };

async function refreshTemplates() {
  try {
    const rows = await prisma.messageTemplate.findMany();
    const next = { ...DEFAULT_TEMPLATES };
    rows.forEach(r => { next[r.key] = r.template; });
    templateCache = next;
  } catch (e) {
    console.error('[settings] Template cache refresh failed:', e.message);
  }
}

async function refreshWorkflow() {
  try {
    const rows = await prisma.workflowSetting.findMany();
    const next = { ...DEFAULT_WORKFLOW };
    rows.forEach(r => { next[r.key] = r.value; });
    workflowCache = next;
  } catch (e) {
    console.error('[settings] Workflow cache refresh failed:', e.message);
  }
}

refreshTemplates();
refreshWorkflow();
setInterval(refreshTemplates, CACHE_TTL).unref();
setInterval(refreshWorkflow, CACHE_TTL).unref();

// In PM2 cluster mode each worker holds its own copy of these caches, and a
// save only refreshes the worker that handled the request. An earlier attempt
// to notify siblings with process.send({type:'process:msg'}) did NOT work:
// that publishes to PM2's monitoring bus, not to the other workers. A setting
// changed in the dashboard therefore stayed stale on the other worker for up
// to CACHE_TTL, so roughly half of inbound texts kept using the old value.
//
// Rather than reach for PM2-specific IPC, the refresh interval is simply short
// enough that a stale read is measured in seconds. Two small indexed queries
// per worker per interval is negligible load, and it behaves correctly under
// any process manager or a future second server.

function render(template, vars = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{{${k}}}`));
}

function getMessage(key, vars = {}) {
  return render(templateCache[key] || DEFAULT_TEMPLATES[key] || '', vars);
}

function getWorkflowSetting(key) {
  return workflowCache[key] ?? DEFAULT_WORKFLOW[key] ?? '';
}

function getSessionTimeoutMinutes() {
  return parseInt(getWorkflowSetting('session_timeout_minutes'), 10) || 30;
}

function getDefaultTemplates() {
  return DEFAULT_TEMPLATES;
}

async function invalidateCaches() {
  // Refreshes this worker immediately so the person who just saved sees their
  // change reflected right away. Other workers catch up within CACHE_TTL.
  await Promise.all([refreshTemplates(), refreshWorkflow()]);
}

module.exports = {
  getMessage,
  getWorkflowSetting,
  getSessionTimeoutMinutes,
  getDefaultTemplates,
  invalidateCaches,
};
