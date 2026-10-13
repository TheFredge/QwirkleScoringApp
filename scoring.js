/* Qwirkle rules engine: move validation and scoring (no DOM dependencies). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QwirkleScoring = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const COLORS = 6;          // red, orange, yellow, green, blue, purple
  const SHAPES = 6;          // circle, square, diamond, clover, starburst, cross
  const COPIES = 3;          // 3 of each of the 36 unique tiles = 108 tiles
  const LINE = 6;            // a complete line has 6 tiles -> Qwirkle
  const QWIRKLE_BONUS = 6;
  const GO_OUT_BONUS = 6;
  const HAND = 6;
  const TOTAL_TILES = COLORS * SHAPES * COPIES;

  const key = (x, y) => x + ',' + y;

  function toMap(tiles) {
    const m = new Map();
    for (const t of tiles) m.set(key(t.x, t.y), t);
    return m;
  }

  // Maximal run of tiles through (x,y) along direction (dx,dy).
  function runAt(map, x, y, dx, dy) {
    let sx = x, sy = y;
    while (map.has(key(sx - dx, sy - dy))) { sx -= dx; sy -= dy; }
    const tiles = [];
    for (let cx = sx, cy = sy; map.has(key(cx, cy)); cx += dx, cy += dy) tiles.push(map.get(key(cx, cy)));
    return { sx, sy, dx, dy, tiles };
  }

  // A line is legal if it holds at most 6 tiles that all share exactly one
  // attribute (color or shape) and differ in the other (no duplicates).
  function lineProblem(tiles) {
    if (tiles.length <= 1) return null;
    if (tiles.length > LINE) return 'A line can never be longer than 6 tiles.';
    const sameColor = tiles.every(t => t.c === tiles[0].c);
    const sameShape = tiles.every(t => t.s === tiles[0].s);
    if (sameColor && sameShape) return 'A line cannot contain two identical tiles.';
    if (sameColor) return new Set(tiles.map(t => t.s)).size === tiles.length ? null : 'A line cannot repeat a shape.';
    if (sameShape) return new Set(tiles.map(t => t.c)).size === tiles.length ? null : 'A line cannot repeat a color.';
    return 'Every line must be all one color (different shapes) or all one shape (different colors).';
  }

  /**
   * Validate and score a turn.
   * @param boardTiles [{x,y,c,s}] tiles already on the board
   * @param placements [{x,y,c,s}] tiles played this turn
   * @returns {ok, error, score, lines, qwirkles}
   */
  function evaluateMove(boardTiles, placements) {
    const fail = error => ({ ok: false, error, score: 0, lines: [], qwirkles: 0 });
    if (!placements.length) return fail('Place at least one tile.');
    const map = toMap(boardTiles);
    const seen = new Set();
    for (const p of placements) {
      const k = key(p.x, p.y);
      if (map.has(k) || seen.has(k)) return fail('A space can only hold one tile.');
      seen.add(k);
    }
    const counts = new Map();
    for (const t of boardTiles.concat(placements)) {
      const k = t.c * SHAPES + t.s;
      const n = (counts.get(k) || 0) + 1;
      if (n > COPIES) return fail('Only ' + COPIES + ' copies of each tile exist.');
      counts.set(k, n);
    }
    const sameRow = placements.every(p => p.y === placements[0].y);
    const sameCol = placements.every(p => p.x === placements[0].x);
    if (!sameRow && !sameCol) return fail('All tiles played in one turn must be in a single row or column.');

    const full = new Map(map);
    for (const p of placements) full.set(key(p.x, p.y), p);

    if (placements.length > 1) {
      const horiz = sameRow;
      const coords = placements.map(p => (horiz ? p.x : p.y));
      const lo = Math.min(...coords), hi = Math.max(...coords);
      for (let i = lo; i <= hi; i++) {
        if (!full.has(horiz ? key(i, placements[0].y) : key(placements[0].x, i)))
          return fail('Tiles played in one turn must form an unbroken line (no gaps).');
      }
    }

    if (boardTiles.length) {
      const touches = placements.some(p =>
        [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => map.has(key(p.x + dx, p.y + dy))));
      if (!touches) return fail('New tiles must touch a tile already on the board.');
    }

    const runs = new Map();
    for (const p of placements) {
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const run = runAt(full, p.x, p.y, dx, dy);
        const problem = lineProblem(run.tiles);
        if (problem) return fail(problem);
        if (run.tiles.length >= 2) runs.set(dx + ',' + dy + ':' + run.sx + ',' + run.sy, run);
      }
    }

    let score = 0, qwirkles = 0;
    const lines = [];
    for (const run of runs.values()) {
      const n = run.tiles.length;
      let pts = n;
      if (n === LINE) { pts += QWIRKLE_BONUS; qwirkles++; }
      score += pts;
      lines.push({ length: n, points: pts, qwirkle: n === LINE });
    }
    if (!runs.size) score = 1; // lone first tile counts as a line of one
    return { ok: true, error: null, score, lines, qwirkles };
  }

  return {
    COLORS, SHAPES, COPIES, LINE, QWIRKLE_BONUS, GO_OUT_BONUS, HAND, TOTAL_TILES,
    evaluateMove, lineProblem,
  };
});
