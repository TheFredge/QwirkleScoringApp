const test = require('node:test');
const assert = require('node:assert');
const { evaluateMove } = require('../scoring.js');

const T = (x, y, c, s) => ({ x, y, c, s });

test('first move scores one point per tile', () => {
  const r = evaluateMove([], [T(0, 0, 0, 0), T(1, 0, 0, 1), T(2, 0, 0, 2)]);
  assert.ok(r.ok); assert.strictEqual(r.score, 3);
});
test('single first tile scores 1', () => {
  assert.strictEqual(evaluateMove([], [T(0, 0, 0, 0)]).score, 1);
});
test('first move must be a legal line', () => {
  assert.ok(!evaluateMove([], [T(0, 0, 0, 0), T(1, 0, 1, 1)]).ok);
  assert.ok(!evaluateMove([], [T(0, 0, 0, 0), T(1, 0, 0, 0)]).ok);
  assert.ok(!evaluateMove([], [T(0, 0, 0, 0), T(2, 0, 0, 1)]).ok);
});
test('a tile joining a row and a column scores both lines', () => {
  const board = [T(0, 0, 0, 0), T(1, 0, 0, 1), T(0, 1, 1, 0)];
  const r = evaluateMove(board, [T(1, 1, 1, 1)]);
  // row (0,1)-(1,1): 1,0 + 1,1 shapes differ? colors 1,1 / shapes 0,1 ok => 2; col (1,0)-(1,1): colors 0,1 same shape 1 => 2
  assert.ok(r.ok); assert.strictEqual(r.score, 4);
});
test('extending a line scores whole line', () => {
  const board = [T(0, 0, 0, 0), T(1, 0, 0, 1)];
  assert.strictEqual(evaluateMove(board, [T(2, 0, 0, 2)]).score, 3);
});
test('qwirkle gives 12', () => {
  const board = [0, 1, 2, 3, 4].map(i => T(i, 0, 2, i));
  const r = evaluateMove(board, [T(5, 0, 2, 5)]);
  assert.strictEqual(r.score, 12); assert.strictEqual(r.qwirkles, 1);
});
test('multi-tile play counts main line once plus cross lines', () => {
  const board = [T(0, 0, 0, 0), T(0, 1, 1, 0)]; // vertical, same shape
  // play two tiles to the right of (0,0): row y=0 colors 0 shapes 1,2
  const r = evaluateMove(board, [T(1, 0, 0, 1), T(2, 0, 0, 2)]);
  assert.ok(r.ok); assert.strictEqual(r.score, 3);
});
test('rejects non-collinear, gaps, disconnected, occupied', () => {
  const board = [T(0, 0, 0, 0)];
  assert.ok(!evaluateMove(board, [T(1, 0, 0, 1), T(1, 1, 0, 2), T(2, 2, 0, 3)]).ok);
  assert.ok(!evaluateMove(board, [T(1, 0, 0, 1), T(3, 0, 0, 3)]).ok);
  assert.ok(!evaluateMove(board, [T(5, 5, 0, 1)]).ok);
  assert.ok(!evaluateMove(board, [T(0, 0, 0, 1)]).ok);
});
test('gap filled by existing tile is allowed', () => {
  const board = [T(1, 0, 0, 1)];
  const r = evaluateMove(board, [T(0, 0, 0, 0), T(2, 0, 0, 2)]);
  assert.ok(r.ok); assert.strictEqual(r.score, 3);
});
test('rejects line longer than 6 and duplicates in cross line', () => {
  const board = [0, 1, 2, 3, 4, 5].map(i => T(i, 0, 2, i));
  assert.ok(!evaluateMove(board, [T(6, 0, 2, 0)]).ok);
  assert.ok(!evaluateMove(board, [T(0, 1, 2, 0)]).ok); // duplicate in column
});
test('at most three copies of a tile', () => {
  const board = [T(0, 0, 0, 0), T(0, 1, 1, 0), T(0, 2, 2, 0)];
  const r = evaluateMove(board.concat([T(5, 5, 0, 0), T(9, 9, 0, 0)]), [T(0, 3, 0, 0)]);
  assert.ok(!r.ok);
});
