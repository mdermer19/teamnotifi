const Anthropic = require('@anthropic-ai/sdk');

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

// State definitions: what the system asked and what valid intents are
const STATE_CONFIGS = {
  CONFIRM_START: {
    prompt: 'Are you reporting an absence or late arrival today? Reply YES to continue or CANCEL to stop.',
    intents: ['YES', 'CANCEL'],
    description: 'YES means they want to report an absence. CANCEL means they want to stop or are not reporting.',
  },
  CONFIRM_DATE: {
    prompt: 'What date are you reporting for? Reply TODAY, TOMORROW, or a date (e.g. 06/20).',
    intents: ['TODAY', 'TOMORROW', 'DATE', 'UNKNOWN'],
    description: 'TODAY or TOMORROW are keywords. DATE means they gave a specific date like "Monday", "June 20", "next week" — extract the most likely date as MM/DD. UNKNOWN if truly unclear.',
  },
  SELECT_REASON: {
    prompt: 'Please select a reason: 1 - I\'m Sick, 2 - Family/Personal Emergency, 3 - Late Arrival, 4 - Other',
    intents: ['1', '2', '3', '4'],
    description: '1=sick/ill/not feeling well/fever/flu/cold. 2=emergency/family/personal crisis/death/accident. 3=late/tardy/running behind/delayed. 4=other/personal/miscellaneous.',
  },
  MULTI_DAY_PROMPT: {
    prompt: 'Do you plan to miss more than one day? Reply YES or NO.',
    intents: ['YES', 'NO'],
    description: 'YES means multiple days. NO means just today or one day.',
  },
  RETURN_DATE_PROMPT: {
    prompt: 'What date do you plan to return to work? Reply a date (e.g. 06/22).',
    intents: ['DATE', 'UNKNOWN'],
    description: 'DATE means they gave a return date — extract as MM/DD. Could be "Monday", "next week", "a few days", "Thursday". UNKNOWN if truly unclear.',
  },
  SICK_NOTE_PROMPT: {
    prompt: 'Will you be getting a doctor\'s note? Reply YES or NO.',
    intents: ['YES', 'NO'],
    description: 'YES means they will get/provide a doctor note. NO means they will not.',
  },
  FAMILY_PROOF_PROMPT: {
    prompt: 'Are you able to provide proof of this emergency? Reply YES or NO.',
    intents: ['YES', 'NO'],
    description: 'YES means they can provide proof/documentation. NO means they cannot.',
  },
};

/**
 * Parse an employee's SMS reply using Claude Haiku when exact matching fails.
 * Returns the matched intent string, or null if AI is unavailable/fails.
 *
 * For DATE intents, returns { intent: 'DATE', value: 'MM/DD' }
 * For all others, returns { intent: 'YES'|'NO'|'1'|etc }
 */
async function parseIntent(state, employeeInput) {
  const config = STATE_CONFIGS[state];
  if (!config) return null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const isDateState = config.intents.includes('DATE');

  const systemPrompt = isDateState
    ? `You are parsing an SMS reply from an employee in a call-out system.
The system asked: "${config.prompt}"
Context: ${config.description}

The employee replied. Determine their intent.
If they gave a date, return it as MM/DD using the current year (${new Date().getFullYear()}).
For relative dates: "Monday" = next upcoming Monday, "next week" = next Monday, "a few days" = 3 days from today (${new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })}).

Respond with ONLY a JSON object, no other text:
- If they gave a date: {"intent":"DATE","value":"MM/DD"}
- If they said TODAY: {"intent":"TODAY"}
- If they said TOMORROW: {"intent":"TOMORROW"}
- If unclear: {"intent":"UNKNOWN"}`
    : `You are parsing an SMS reply from an employee in a call-out system.
The system asked: "${config.prompt}"
Context: ${config.description}
Valid responses: ${config.intents.join(', ')}

The employee replied. Determine which valid response best matches their intent.
Respond with ONLY a JSON object, no other text: {"intent":"<one of ${config.intents.join('|')}>"}
If truly unclear, use UNKNOWN (or the last option if no UNKNOWN exists).`;

  try {
    const response = await getClient().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [
        { role: 'user', content: `Employee replied: "${employeeInput}"` },
      ],
      system: systemPrompt,
    });

    const raw = response.content[0]?.text?.trim() || '';
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(text);
    console.log(`[AI intent] state=${state} input="${employeeInput}" → ${JSON.stringify(parsed)}`);
    return parsed;
  } catch (err) {
    console.error('[AI intent] failed:', err.message);
    return null;
  }
}

module.exports = { parseIntent };
