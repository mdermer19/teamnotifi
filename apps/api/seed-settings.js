require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const templates = [
  {
    key: 'UNKNOWN_PHONE',
    label: 'Unrecognized Number',
    description: "Sent when we don't recognize the employee's phone number.",
    template: "We don't recognize this number. Reply with your Employee ID to get set up.",
    variables: [],
  },
  {
    key: 'CONFIRM_START',
    label: 'Absence Report Prompt',
    description: 'First message after identifying the employee. Asks if they want to report an absence.',
    template: 'Hi {{firstName}}! If you are reporting an absence or late arrival, reply YES to continue or CANCEL to stop.',
    variables: ['firstName'],
  },
  {
    key: 'CONFIRM_DATE',
    label: 'Date Request',
    description: 'Asks for the date of the absence.',
    template: 'What date are you reporting for? Reply TODAY, TOMORROW, or a date (e.g. 06/20).',
    variables: [],
  },
  {
    key: 'INVALID_DATE',
    label: 'Invalid Date Response',
    description: "Sent when the employee's date reply isn't recognized.",
    template: "Didn't catch that. Reply TODAY, TOMORROW, or a date like 06/20.",
    variables: [],
  },
  {
    key: 'SELECT_REASON',
    label: 'Reason Selection Menu',
    description: 'Asks the employee to pick an absence reason by number.',
    template: "Please select a reason:\n1 - I'm Sick\n2 - Family/Personal Emergency\n3 - Late Arrival\n4 - Other",
    variables: [],
  },
  {
    key: 'INVALID_REASON',
    label: 'Invalid Reason Response',
    description: 'Sent when the employee replies with an invalid reason number.',
    template: 'Please reply with a number 1-4.',
    variables: [],
  },
  {
    key: 'SICK_NOTE_PROMPT',
    label: "Doctor's Note Question",
    description: "Asks if the employee will provide a doctor's note (Sick absences only).",
    template: "Will you be getting a doctor's note? Reply YES or NO.",
    variables: [],
  },
  {
    key: 'SICK_YES_NOTE',
    label: "Sick Confirmed — Note Promised",
    description: "Confirmation when employee promises a doctor's note.",
    template: "Sounds like a plan! Your absence has been recorded for {{dateRange}}. Please provide a copy of the doctor's note to your manager within 48 hours and you will not receive any points per the Attendance Policy. However, if you do not submit a doctor's note within 48 hours, the absence will be considered unexcused and you will receive 2 points per the Attendance Policy.",
    variables: ['dateRange'],
  },
  {
    key: 'SICK_NO_NOTE',
    label: "Sick Confirmed — No Note",
    description: "Confirmation when employee will not provide a doctor's note. 2 points applied.",
    template: "We're sorry to hear you're not feeling well. Your absence has been recorded for {{dateRange}}. Since you will not be providing a doctor's note, you will receive 2 points per the Attendance Policy.",
    variables: ['dateRange'],
  },
  {
    key: 'SICK_REPROMPT',
    label: "Doctor's Note Re-prompt",
    description: "Sent when the YES/NO response to the doctor's note question is unclear.",
    template: 'Please reply YES or NO.',
    variables: [],
  },
  {
    key: 'FAMILY_DETAILS_PROMPT',
    label: 'Emergency Details Request',
    description: 'Asks the employee to describe the family/personal emergency.',
    template: 'Required - please provide further details about the nature of your absence.',
    variables: [],
  },
  {
    key: 'FAMILY_DETAILS_ACK',
    label: 'Emergency Details Acknowledgment',
    description: 'Acknowledges the emergency details before asking about proof.',
    template: 'We are sorry to hear you are dealing with an emergency. Per the Attendance Policy, an emergency situation includes but is not limited to unexpected family, household, or personal emergencies. Management will determine whether this is an excused absence and whether documentation is required.',
    variables: [],
  },
  {
    key: 'FAMILY_PROOF_PROMPT',
    label: 'Emergency Proof Question',
    description: 'Asks if the employee can provide documentation for the emergency.',
    template: 'Are you able to provide proof of this emergency? Reply YES or NO.',
    variables: [],
  },
  {
    key: 'FAMILY_YES_PROOF',
    label: 'Emergency Confirmed — Proof Promised',
    description: 'Confirmation when employee promises documentation.',
    template: "Sounds like a plan! Your absence has been recorded for {{dateRange}}. Please send proof to your manager within 48 hours. The nature of the emergency is subject to management review. If it is determined to be a true emergency, you will not receive any points per the Attendance Policy. If it's determined this is not a true emergency or proof is required and not received within 48 hours, you will receive 2 points per the Attendance Policy.",
    variables: ['dateRange'],
  },
  {
    key: 'FAMILY_NO_PROOF',
    label: 'Emergency Confirmed — No Proof',
    description: 'Confirmation when employee cannot provide documentation.',
    template: "Ok, we understand. Your absence has been recorded for {{dateRange}}. Your manager will determine whether proof is required for this emergency. If no proof is required, then you will not receive any points per the Attendance Policy. If proof is required and not received within 48 hours, you will receive 2 points per the Attendance Policy.",
    variables: ['dateRange'],
  },
  {
    key: 'FAMILY_REPROMPT',
    label: 'Emergency Proof Re-prompt',
    description: "Sent when the YES/NO response to the proof question is unclear.",
    template: 'Please reply YES or NO.',
    variables: [],
  },
  {
    key: 'LATE_MESSAGE',
    label: 'Late Arrival Confirmation',
    description: 'Sent after a late arrival is logged.',
    template: 'If you clock in within 7 minutes of your scheduled start time, you will not receive any points. If you are tardy by more than 7 minutes, you will receive 1 point per the Attendance Policy.',
    variables: [],
  },
  {
    key: 'OTHER_DETAILS_PROMPT',
    label: 'Other Reason Details Request',
    description: 'Asks the employee to describe the reason when "Other" is selected.',
    template: 'Please briefly describe the reason for your absence.',
    variables: [],
  },
  {
    key: 'OTHER_DONE',
    label: 'Other Reason Confirmed',
    description: 'Confirmation for an "Other" reason absence.',
    template: 'Got it, {{firstName}}. Your absence has been recorded for {{dateRange}} and your manager has been notified.',
    variables: ['firstName', 'dateRange'],
  },
  {
    key: 'MULTI_DAY_PROMPT',
    label: 'Multi-Day Question',
    description: 'Asks if the employee will be out more than one day.',
    template: 'Do you plan to miss more than one day? Reply YES or NO.',
    variables: [],
  },
  {
    key: 'RETURN_DATE_PROMPT',
    label: 'Return Date Request',
    description: 'Asks for the expected return date (multi-day absences only).',
    template: 'What date do you plan to return to work? Reply a date (e.g. 06/22).',
    variables: [],
  },
  {
    key: 'INVALID_RETURN_DATE',
    label: 'Invalid Return Date Response',
    description: "Sent when the return date provided doesn't make sense.",
    template: "Didn't catch that. Please reply with a return date like 06/22.",
    variables: [],
  },
  {
    key: 'CANCEL',
    label: 'Session Cancelled',
    description: 'Sent when the employee cancels the absence report.',
    template: 'No problem. Text us anytime.',
    variables: [],
  },
  {
    key: 'REPROMPT',
    label: 'Generic Re-prompt',
    description: "Prepended to a repeated question when the employee's response is unclear.",
    template: "Didn't catch that. {{original}}",
    variables: ['original'],
  },
  {
    key: 'DUPLICATE_ABSENCE',
    label: 'Duplicate Absence Warning',
    description: 'Sent when the employee already has an absence on the requested date.',
    template: 'You already reported out for {{date}}. Reply UPDATE to change it or CANCEL to keep the existing report.',
    variables: ['date'],
  },
  {
    key: 'ABSENCE_CONFIRMED',
    label: 'Generic Absence Confirmed',
    description: 'Used when a workflow prompt is disabled (e.g. dr. note or proof prompt turned off).',
    template: 'Your absence has been recorded for {{dateRange}}. Your manager has been notified.',
    variables: ['dateRange'],
  },
];

const workflowSettings = [
  {
    key: 'session_timeout_minutes',
    value: '30',
    label: 'Session Timeout (minutes)',
    type: 'number',
    description: 'How long an SMS conversation stays active before expiring. After this time, the employee must start over.',
  },
  {
    key: 'multi_day_prompt_enabled',
    value: 'true',
    label: 'Ask About Multi-Day Absences',
    type: 'boolean',
    description: 'When enabled, employees are asked if they will be out more than one day and prompted for a return date.',
  },
  {
    key: 'dr_note_prompt_enabled',
    value: 'true',
    label: "Ask for Doctor's Note (Sick)",
    type: 'boolean',
    description: "When enabled, employees reporting sick are asked if they will provide a doctor's note.",
  },
  {
    key: 'proof_prompt_enabled',
    value: 'true',
    label: 'Ask for Proof (Emergency)',
    type: 'boolean',
    description: 'When enabled, employees reporting a family/personal emergency are asked if they can provide documentation.',
  },
];

async function seed() {
  console.log('Seeding message templates...');
  for (const t of templates) {
    await prisma.messageTemplate.upsert({
      where: { key: t.key },
      update: { label: t.label, description: t.description, variables: t.variables },
      create: { key: t.key, label: t.label, description: t.description, template: t.template, variables: t.variables },
    });
  }
  console.log(`✓ ${templates.length} message templates`);

  console.log('Seeding workflow settings...');
  for (const s of workflowSettings) {
    await prisma.workflowSetting.upsert({
      where: { key: s.key },
      update: { label: s.label, description: s.description, type: s.type },
      create: { key: s.key, value: s.value, label: s.label, type: s.type, description: s.description },
    });
  }
  console.log(`✓ ${workflowSettings.length} workflow settings`);
}

seed()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
