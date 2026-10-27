const test = require('node:test');
const assert = require('node:assert');
const { add, multiply } = require('./math.js');

test('add() adds two numbers', () => {
  assert.strictEqual(add(2, 3), 5);
});

test('multiply() multiplies two numbers', () => {
  assert.strictEqual(multiply(2, 3), 6);
});
