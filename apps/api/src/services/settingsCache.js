const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const CACHE_TTL = 5 * 60 * 1000;

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
};

const DEFAULT_WORKFLOW = {
  session_timeout_minutes: '30',
  multi_day_prompt_enabled: 'true',
  dr_note_prompt_enabled: 'true',
  proof_prompt_enabled: 'true',
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
  await Promise.all([refreshTemplates(), refreshWorkflow()]);
}

module.exports = {
  getMessage,
  getWorkflowSetting,
  getSessionTimeoutMinutes,
  getDefaultTemplates,
  invalidateCaches,
};
