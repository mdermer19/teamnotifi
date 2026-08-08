const crypto = require('crypto');

// 72 bits of entropy — enough for a short-lived link (2-hour window,
// rate-limited to 5/hour per employee). The shorter URL helps avoid carrier
// spam filters that flag long random token strings.
function generateToken() {
  return crypto.randomBytes(9).toString('base64url');
}

// We never store the raw token, only this hash, so a database leak yields
// no usable links. SHA-256 (not bcrypt) is correct here: the input is already
// high-entropy random, so there is nothing to brute force, and we need the
// lookup to be a fast indexed equality match.
function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

module.exports = { generateToken, hashToken };
