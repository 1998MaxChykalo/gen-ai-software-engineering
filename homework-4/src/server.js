'use strict';

const http = require('node:http');
const { addExpense, listExpenses, reset } = require('./store');
const { calculateTotal, filterByMonth, validateExpense } = require('./utils');
const { isAdmin } = require('./auth');

const PORT = process.env.PORT || 3000;

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }

  if (req.method === 'POST' && url.pathname === '/expenses') {
    let body;
    try {
      body = await readBody(req);
    } catch {
      return sendJson(res, 400, { error: 'invalid JSON body' });
    }
    const { valid, errors } = validateExpense(body);
    if (!valid) {
      return sendJson(res, 400, { errors });
    }
    const expense = addExpense(body);
    return sendJson(res, 201, expense);
  }

  if (req.method === 'GET' && url.pathname === '/expenses') {
    let result = listExpenses();
    const category = url.searchParams.get('category');
    if (category) {
      result = result.filter((e) => e.category === category);
    }
    return sendJson(res, 200, result);
  }

  if (req.method === 'GET' && url.pathname === '/summary') {
    let result = listExpenses();
    const month = url.searchParams.get('month'); // format: YYYY-MM
    if (month) {
      const [y, m] = month.split('-').map(Number);
      result = filterByMonth(result, y, m);
    }
    return sendJson(res, 200, {
      count: result.length,
      total: calculateTotal(result),
    });
  }

  if (req.method === 'POST' && url.pathname === '/admin/reset') {
    if (!isAdmin(req.headers['x-admin-token'])) {
      return sendJson(res, 403, { error: 'forbidden' });
    }
    reset();
    return sendJson(res, 200, { status: 'reset' });
  }

  return sendJson(res, 404, { error: 'not found' });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Tiny Expense Tracker listening on http://localhost:${PORT}`);
  });
}

module.exports = { server };
