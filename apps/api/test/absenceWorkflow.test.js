const { test } = require('node:test');
const assert = require('node:assert');

const W = require('../src/workflow/absenceWorkflow');
const { generateToken, hashToken } = require('../src/lib/reportToken');

const S = W.STATES;

// These exercise the pure parts of the workflow: transitions and validation.
// Anything requiring a database lookup (reason codes, employee timezone) is
// covered separately — contexts here deliberately omit employeeId so the
// timezone helper short-circuits without touching the DB.

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

test('date question always leads to the reason question', () => {
  assert.strictEqual(W.nextState(S.CONFIRM_DATE, {}), S.SELECT_REASON);
});

test('late arrivals skip the multi-day question entirely', () => {
  assert.strictEqual(
    W.nextState(S.SELECT_REASON, { reasonCode: 'LATE' }),
    S.LATE_ARRIVAL_TIME
  );
});

test('non-late reasons go to the multi-day question when enabled', () => {
  assert.strictEqual(
    W.nextState(S.SELECT_REASON, { reasonCode: 'SICK' }),
    S.MULTI_DAY_PROMPT
  );
});

test('answering yes to multi-day asks for a return date', () => {
  assert.strictEqual(
    W.nextState(S.MULTI_DAY_PROMPT, { reasonCode: 'SICK', multiDay: true }),
    S.RETURN_DATE_PROMPT
  );
});

test('answering no to multi-day goes straight into the reason branch', () => {
  assert.strictEqual(
    W.nextState(S.MULTI_DAY_PROMPT, { reasonCode: 'SICK', multiDay: false }),
    S.SICK_NOTE_PROMPT
  );
});

test('return date leads into the reason branch', () => {
  assert.strictEqual(
    W.nextState(S.RETURN_DATE_PROMPT, { reasonCode: 'EMERG' }),
    S.FAMILY_DETAILS
  );
});

test('emergency details lead to the proof question', () => {
  assert.strictEqual(
    W.nextState(S.FAMILY_DETAILS, { reasonCode: 'EMERG', notes: 'x' }),
    S.FAMILY_PROOF_PROMPT
  );
});

test('emergency skips the details question when details are already known', () => {
  assert.strictEqual(
    W.reasonEntryState({ reasonCode: 'EMERG', notes: 'car accident' }),
    S.FAMILY_PROOF_PROMPT
  );
});

test('other skips its details question when details are already known', () => {
  assert.strictEqual(
    W.reasonEntryState({ reasonCode: 'OTHER', notes: 'jury duty' }),
    S.SUBMITTED
  );
});

test('every terminal question submits — there is no review step', () => {
  for (const state of [
    S.SICK_NOTE_PROMPT,
    S.FAMILY_PROOF_PROMPT,
    S.LATE_ARRIVAL_TIME,
    S.OTHER_DETAILS,
  ]) {
    assert.strictEqual(W.nextState(state, {}), S.SUBMITTED, `${state} should submit`);
  }
});

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

test('parseIsoDate accepts a valid date at UTC midnight', () => {
  assert.strictEqual(
    W.parseIsoDate('2026-08-04').toISOString(),
    '2026-08-04T00:00:00.000Z'
  );
});

test('parseIsoDate rejects impossible and malformed dates', () => {
  for (const bad of ['2026-02-31', '2026-13-01', '08/04/2026', 'tomorrow', '', null, undefined]) {
    assert.strictEqual(W.parseIsoDate(bad), null, `should reject ${bad}`);
  }
});

test('parseBool understands the values the UI and API can send', () => {
  assert.strictEqual(W.parseBool(true), true);
  assert.strictEqual(W.parseBool('yes'), true);
  assert.strictEqual(W.parseBool('1'), true);
  assert.strictEqual(W.parseBool(false), false);
  assert.strictEqual(W.parseBool('no'), false);
  assert.strictEqual(W.parseBool('maybe'), null);
});

test('dateRangeText shows a single day, or a range ending the day before return', () => {
  const start = '2026-08-04T00:00:00.000Z';
  assert.strictEqual(W.dateRangeText(start, null), 'Aug 4');
  // Returning on the 7th means the last absent day is the 6th.
  assert.strictEqual(W.dateRangeText(start, '2026-08-07T00:00:00.000Z'), 'Aug 4 – Aug 6');
});

// ---------------------------------------------------------------------------
// Server-side answer validation
// ---------------------------------------------------------------------------

test('return date must fall after the first absent day', async () => {
  const ctx = { shiftDate: '2026-08-04T00:00:00.000Z' };

  const same = await W.applyAnswer(S.RETURN_DATE_PROMPT, '2026-08-04', ctx);
  assert.ok(same.error, 'same day should be rejected');

  const earlier = await W.applyAnswer(S.RETURN_DATE_PROMPT, '2026-08-01', ctx);
  assert.ok(earlier.error, 'earlier day should be rejected');

  const ok = await W.applyAnswer(S.RETURN_DATE_PROMPT, '2026-08-05', ctx);
  assert.ok(!ok.error && ok.patch.returnDate, 'next day should be accepted');
});

test('return date far beyond the shift date is rejected', async () => {
  const ctx = { shiftDate: '2026-08-04T00:00:00.000Z' };
  const res = await W.applyAnswer(S.RETURN_DATE_PROMPT, '2027-08-04', ctx);
  assert.ok(res.error);
});

test('yes/no answers are validated, not coerced', async () => {
  const good = await W.applyAnswer(S.SICK_NOTE_PROMPT, 'yes', {});
  assert.strictEqual(good.patch.drNotePromised, true);

  const bad = await W.applyAnswer(S.SICK_NOTE_PROMPT, 'sometimes', {});
  assert.ok(bad.error);
});

test('free-text answers reject empty input and cap length', async () => {
  const empty = await W.applyAnswer(S.FAMILY_DETAILS, '   ', {});
  assert.ok(empty.error);

  const long = await W.applyAnswer(S.FAMILY_DETAILS, 'x'.repeat(1001), {});
  assert.ok(long.error);

  const ok = await W.applyAnswer(S.FAMILY_DETAILS, '  car accident  ', {});
  assert.strictEqual(ok.patch.notes, 'car accident');
});

test('switching multi-day back to no clears any stale return date', async () => {
  const res = await W.applyAnswer(S.MULTI_DAY_PROMPT, 'no', {
    returnDate: '2026-08-09T00:00:00.000Z',
  });
  assert.strictEqual(res.patch.multiDay, false);
  assert.strictEqual(res.patch.returnDate, null);
});

test('the shift date must be within a sane window', async () => {
  const far = await W.applyAnswer(S.CONFIRM_DATE, '2030-01-01', {});
  assert.ok(far.error, 'far future should be rejected');

  const old = await W.applyAnswer(S.CONFIRM_DATE, '2020-01-01', {});
  assert.ok(old.error, 'distant past should be rejected');
});

test('an answer to an already-finished report is refused', async () => {
  const res = await W.applyAnswer(S.SUBMITTED, 'anything', {});
  assert.ok(res.error);
});

// ---------------------------------------------------------------------------
// Token security
// ---------------------------------------------------------------------------

test('tokens are long, URL-safe and unique', () => {
  const a = generateToken();
  const b = generateToken();
  assert.notStrictEqual(a, b);
  assert.ok(a.length >= 43, 'should carry 256 bits of entropy');
  assert.match(a, /^[A-Za-z0-9_-]+$/, 'must be URL-safe with no padding');
});

test('hashing is deterministic and never returns the raw token', () => {
  const raw = generateToken();
  const hash = hashToken(raw);
  assert.strictEqual(hash, hashToken(raw));
  assert.notStrictEqual(hash, raw);
  assert.strictEqual(hash.length, 64);
  assert.notStrictEqual(hashToken(generateToken()), hash);
});
