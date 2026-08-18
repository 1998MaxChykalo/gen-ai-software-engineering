'use strict';

function calculateTotal(expenses) {
  let total = 0;
  for (let i = 0; i < expenses.length; i++) {
    total += expenses[i].amount;
  }
  return Math.round(total * 100) / 100;
}

function filterByMonth(expenses, year, month) {
  return expenses.filter((e) => {
    const d = new Date(e.date);
    return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month;
  });
}

function validateExpense(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['body must be a JSON object'] };
  }
  if (!body.description) errors.push('description is required');
  if (body.amount === undefined || body.amount === null) errors.push('amount is required');
  if (!body.date) errors.push('date is required');
  return { valid: errors.length === 0, errors };
}

module.exports = { calculateTotal, filterByMonth, validateExpense };
