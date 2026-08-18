'use strict';

const crypto = require('node:crypto');

function isAdmin(token) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) return false;
  if (typeof token !== 'string') return false;

  const expected = Buffer.from(adminToken, 'utf8');
  const supplied = Buffer.from(token, 'utf8');
  if (expected.length !== supplied.length) return false;

  return crypto.timingSafeEqual(supplied, expected);
}

module.exports = { isAdmin };
