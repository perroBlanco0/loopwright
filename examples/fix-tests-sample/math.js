function add(a, b) {
  return a - b; // bug: should add, not subtract
}

function multiply(a, b) {
  return a * b;
}

module.exports = { add, multiply };
