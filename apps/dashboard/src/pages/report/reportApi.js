// Minimal fetch helper for the public report flow.
// Deliberately imports no Clerk code and sends no Authorization header — the
// token in the URL is the only credential.

const BASE = '/api/report';

async function call(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  // 400 carries a validation message alongside a full screen payload, and 404
  // carries the not-found screen, so both are usable responses rather than
  // thrown errors. Anything else is a genuine failure.
  if (!res.ok && res.status !== 400 && res.status !== 404) {
    throw new Error((body && body.error) || 'Something went wrong.');
  }
  if (!body) throw new Error('Something went wrong.');
  return body;
}

export const getReport = (token) => call(`/${encodeURIComponent(token)}`);

export const sendAnswer = (token, state, value) =>
  call(`/${encodeURIComponent(token)}/answer`, {
    method: 'POST',
    body: JSON.stringify({ state, value }),
  });

export const goBack = (token) =>
  call(`/${encodeURIComponent(token)}/back`, { method: 'POST' });
