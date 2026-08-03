const crypto = require('crypto');

// 256 bits of entropy, base64url so it's URL-safe and has no padding.
// The token encodes nothing — not the employee id, not the phone, nothing
// derivable. The only way to resolve it is a server-side hash lookup.
function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

// We never store the raw token, only this hash, so a database leak yields
// no usable links. SHA-256 (not bcrypt) is correct here: the input is already
// high-entropy random, so there is nothing to brute force, and we need the
// lookup to be a fast indexed equality match.
function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

module.exports = { generateToken, hashToken };
