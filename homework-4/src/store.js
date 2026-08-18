'use strict';

// In-memory expense store. Intentionally simple: the app exists so the
// 4-agent pipeline has something real to research, fix, review and test.

const expenses = [];
let nextId = 1;

function addExpense(data) {
  const expense = {
    id: nextId,
    description: data.description,
    amount: data.amount,
    category: data.category,
    date: data.date,
  };
  nextId += 1;
  expenses.push(expense);
  return expense;
}

function listExpenses() {
  return expenses.slice();
}

function reset() {
  expenses.length = 0;
  nextId = 1;
}

module.exports = { addExpense, listExpenses, reset };
