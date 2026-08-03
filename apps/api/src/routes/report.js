const express = require('express');
const { PrismaClient } = require('@prisma/client');
const R = require('../services/reportService');
const W = require('../workflow/absenceWorkflow');

const router = express.Router();
const prisma = new PrismaClient();

// This router is mounted BEFORE the Clerk auth gate in index.js. The token in
// the URL is the only credential — there is no session and no logged-in user.
// Every handler must therefore treat all input as untrusted and re-validate.

const clientIp = (req) =>
  (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || null;

function notFound(res) {
  const { getMessage } = require('../services/settingsCache');
  return res.status(404).json({
    status: 'not_found',
    screen: {
      kind: 'done',
      title: getMessage('WEB_NOT_FOUND_TITLE'),
      body: getMessage('WEB_NOT_FOUND_BODY'),
    },
  });
}

// Loads + expires a token, or sends the not-found payload.
async function resolve(req, res) {
  const record = await R.loadByRawToken(req.params.token);
  if (!record) {
    notFound(res);
    return null;
  }
  return R.expireIfNeeded(record);
}

// GET /api/report/:token — current screen (also the resume-after-refresh path)
router.get('/:token', async (req, res) => {
  try {
    const record = await resolve(req, res);
    if (!record) return;
    res.json(await R.buildScreen(record));
  } catch (e) {
    console.error('[report] GET failed:', e);
    res.status(500).json({ status: 'error', error: 'Something went wrong.' });
  }
});

// POST /api/report/:token/answer — save one answer, advance, finalize if last
router.post('/:token/answer', async (req, res) => {
  try {
    const record = await resolve(req, res);
    if (!record) return;

    if (record.status !== 'active') {
      return res.json(await R.buildScreen(record));
    }

    // The client echoes back which question it is answering. A mismatch means
    // a stale screen (double-tap, back-forward, re-sent request) — return the
    // real current screen instead of applying the answer twice.
    const { state, value } = req.body || {};
    if (state && state !== record.state) {
      return res.json(await R.buildScreen(record));
    }

    const ctx = record.context || {};
    const { error, patch } = await W.applyAnswer(record.state, value, ctx);
    if (error) {
      const screen = await R.buildScreen(record);
      return res.status(400).json({ ...screen, error });
    }

    const newCtx = { ...ctx, ...patch };
    const target = W.nextState(record.state, newCtx);

    const updated = await prisma.reportToken.update({
      where: { id: record.id },
      data: {
        context: newCtx,
        state: target,
        stateHistory: [...(record.stateHistory || []), record.state],
      },
    });

    R.audit(record, 'report_step', { state: record.state, next: target, patch }, clientIp(req));

    // No review screen: reaching the terminal state means submit now.
    if (target === W.STATES.SUBMITTED) {
      const result = await R.finalize(record.id);
      const fresh = await prisma.reportToken.findUnique({
        where: { id: record.id },
        include: { employee: { select: { id: true, firstName: true, phone: true } } },
      });
      if (!result.alreadyClaimed) {
        R.audit(
          record,
          result.duplicate ? 'report_duplicate' : 'report_submitted',
          { absenceId: result.absence ? result.absence.id : null },
          clientIp(req)
        );
      }
      return res.json(await R.buildScreen(fresh));
    }

    return res.json(
      await R.buildScreen({ ...updated, employee: record.employee })
    );
  } catch (e) {
    console.error('[report] answer failed:', e);
    res.status(500).json({ status: 'error', error: 'Something went wrong.' });
  }
});

// POST /api/report/:token/back — step back one question
router.post('/:token/back', async (req, res) => {
  try {
    const record = await resolve(req, res);
    if (!record) return;

    if (record.status !== 'active') {
      return res.json(await R.buildScreen(record));
    }

    const history = [...(record.stateHistory || [])];
    if (history.length === 0) {
      return res.json(await R.buildScreen(record));
    }

    const previous = history.pop();
    // The previous answer stays in context on purpose, so the question comes
    // back pre-filled and can simply be overwritten going forward.
    const updated = await prisma.reportToken.update({
      where: { id: record.id },
      data: { state: previous, stateHistory: history },
    });

    R.audit(record, 'report_back', { from: record.state, to: previous }, clientIp(req));

    res.json(await R.buildScreen({ ...updated, employee: record.employee }));
  } catch (e) {
    console.error('[report] back failed:', e);
    res.status(500).json({ status: 'error', error: 'Something went wrong.' });
  }
});

module.exports = router;
