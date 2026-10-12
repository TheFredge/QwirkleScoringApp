(function () {
  const Q = QwirkleScoring;
  const COLOR_HEX = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'];
  const COLOR_NAME = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
  const SHAPE_NAME = ['circle', 'square', 'diamond', 'clover', 'starburst', 'cross'];
  const STORE = 'qwirkle-scorer-v1';
  const NS = 'http://www.w3.org/2000/svg';

  let state = load() || { phase: 'setup' };
  let pending = [];      // tiles placed this turn, not yet committed
  let selected = null;   // {c,s} chosen from the palette
  const app = document.getElementById('app');

  function load() { try { return JSON.parse(localStorage.getItem(STORE)); } catch (e) { return null; } }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* ignore */ } }

  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid);
    return n;
  }

  function svg(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  }

  function tileSVG(c, s) {
    const f = COLOR_HEX[c];
    const root = svg('svg', { viewBox: '0 0 100 100', role: 'img', 'aria-label': COLOR_NAME[c] + ' ' + SHAPE_NAME[s] });
    const add = (tag, a) => root.append(svg(tag, Object.assign({ fill: f }, a)));
    if (s === 0) add('circle', { cx: 50, cy: 50, r: 34 });
    else if (s === 1) add('rect', { x: 17, y: 17, width: 66, height: 66, rx: 4 });
    else if (s === 2) add('polygon', { points: '50,10 90,50 50,90 10,50' });
    else if (s === 3) {
      for (const [x, y] of [[50, 30], [50, 70], [30, 50], [70, 50]]) add('circle', { cx: x, cy: y, r: 20 });
      add('rect', { x: 32, y: 32, width: 36, height: 36 });
    } else if (s === 4) {
      const pts = [];
      for (let i = 0; i < 16; i++) {
        const r = i % 2 ? 18 : 42, a = (Math.PI * i) / 8 - Math.PI / 2;
        pts.push((50 + r * Math.cos(a)).toFixed(1) + ',' + (50 + r * Math.sin(a)).toFixed(1));
      }
      add('polygon', { points: pts.join(' ') });
    } else {
      const g = svg('g', { transform: 'rotate(45 50 50)' });
      g.append(svg('rect', { x: 39, y: 10, width: 22, height: 80, fill: f }), svg('rect', { x: 10, y: 39, width: 80, height: 22, fill: f }));
      root.append(g);
    }
    return root;
  }

  // ---------- game flow ----------
  function newGame(players, starter) {
    state = {
      phase: 'play', players: players.map(p => ({ name: p.name, score: 0, hand: Q.HAND })),
      current: starter, board: [], bag: Q.TOTAL_TILES - Q.HAND * players.length,
      passes: 0, log: [], undo: [], turn: 1,
    };
    pending = []; selected = null;
    save(); render();
  }

  function snapshot() {
    const { undo, ...rest } = state;
    state.undo.push(JSON.stringify(rest));
  }

  function nextPlayer() { state.current = (state.current + 1) % state.players.length; state.turn++; }

  function commitPlay() {
    const res = Q.evaluateMove(state.board, pending);
    const p = state.players[state.current];
    if (!res.ok || pending.length > p.hand) return;
    snapshot();
    p.score += res.score;
    state.board.push(...pending);
    const n = pending.length;
    const draw = Math.min(n, state.bag);
    state.bag -= draw; p.hand += draw - n;
    let note = p.name + ' played ' + n + ' tile' + (n > 1 ? 's' : '') + ': +' + res.score +
      (res.qwirkles ? ' (' + (res.qwirkles > 1 ? res.qwirkles + ' ' : '') + 'QWIRKLE!)' : '');
    state.passes = 0;
    if (p.hand === 0) {
      p.score += Q.GO_OUT_BONUS;
      note += ' — went out first, +' + Q.GO_OUT_BONUS + ' bonus';
      state.phase = 'over';
    } else nextPlayer();
    state.log.push(note);
    pending = []; save(); render();
  }

  function exchange() {
    const p = state.players[state.current];
    const max = Math.min(p.hand, state.bag);
    if (max < 1) return;
    const v = parseInt(prompt('How many tiles to exchange (1–' + max + ')?', '1'), 10);
    if (!(v >= 1 && v <= max)) return;
    snapshot();
    state.log.push(p.name + ' exchanged ' + v + ' tile' + (v > 1 ? 's' : '') + ' (+0)');
    state.passes = 0; nextPlayer(); pending = []; save(); render();
  }

  function pass() {
    snapshot();
    state.log.push(state.players[state.current].name + ' passed (+0)');
    state.passes++; nextPlayer(); pending = []; save(); render();
  }

  function endStalemate() {
    if (!confirm('End the game with no going-out bonus? (Nobody can play.)')) return;
    snapshot(); state.log.push('Game ended — no more legal plays.'); state.phase = 'over'; save(); render();
  }

  function undoTurn() {
    if (!state.undo.length) return;
    const prev = JSON.parse(state.undo.pop());
    state = Object.assign(prev, { undo: state.undo });
    pending = []; save(); render();
  }

  // ---------- views ----------
  function renderSetup() {
    const names = state.names || ['Player 1', 'Player 2'];
    const lens = state.lens || names.map(() => 1);
    const manual = state.starter == null ? 'auto' : String(state.starter);
    const sync = () => {
      state.names = [...app.querySelectorAll('.nm')].map((i, k) => i.value || 'Player ' + (k + 1));
      state.lens = [...app.querySelectorAll('.ln')].map(i => Math.min(6, Math.max(1, parseInt(i.value, 10) || 1)));
    };
    const autoStarter = () => lens.indexOf(Math.max(...lens));
    const rows = names.map((n, i) => el('div', { class: 'setup-row' },
      el('input', { class: 'nm', value: n, 'aria-label': 'Player ' + (i + 1) + ' name', maxlength: 20 }),
      el('input', { class: 'ln', type: 'number', min: 1, max: 6, value: lens[i], 'aria-label': 'Longest starting line for player ' + (i + 1) })));
    const sel = el('select', { id: 'starter' }, el('option', { value: 'auto' }, 'Automatic (longest line wins)'),
      names.map((n, i) => el('option', { value: i, selected: manual === String(i) }, n)));
    sel.addEventListener('change', () => { sync(); state.starter = sel.value === 'auto' ? null : +sel.value; save(); render(); });
    app.replaceChildren(el('section', { class: 'card' },
      el('h2', {}, 'New game (2–4 players)'),
      el('p', {}, 'Each player draws 6 tiles. Enter each player’s longest set of tiles sharing one color or shape (all different in the other) — the highest goes first and must play that set.'),
      el('div', { class: 'setup-row' }, el('strong', {}, 'Name'), el('strong', {}, 'Start line (1–6)')),
      rows,
      el('div', { class: 'row' },
        el('button', { disabled: names.length >= 4, onclick: () => { sync(); state.names.push('Player ' + (names.length + 1)); state.lens.push(1); render(); } }, 'Add player'),
        el('button', { disabled: names.length <= 2, onclick: () => { sync(); state.names.pop(); state.lens.pop(); state.starter = null; render(); } }, 'Remove player')),
      el('p', {}, 'First player: ', sel, manual === 'auto' ? ' → ' + names[autoStarter()] : ''),
      el('button', { class: 'primary', onclick: () => {
        sync();
        const st = state.starter != null ? state.starter : state.lens.indexOf(Math.max(...state.lens));
        newGame(state.names.map(name => ({ name })), st);
      } }, 'Start game')));
    app.querySelectorAll('.ln,.nm').forEach(i => i.addEventListener('change', () => { sync(); save(); render(); }));
  }

  function renderBoard(res) {
    const all = state.board.concat(pending);
    const xs = all.map(t => t.x), ys = all.map(t => t.y);
    const x0 = Math.min(-3, ...xs) - 1, x1 = Math.max(3, ...xs) + 1;
    const y0 = Math.min(-3, ...ys) - 1, y1 = Math.max(3, ...ys) + 1;
    const grid = el('div', { class: 'board', style: 'grid-template-columns:repeat(' + (x1 - x0 + 1) + ',44px)' });
    const at = new Map(state.board.map(t => [t.x + ',' + t.y, t]));
    const pend = new Map(pending.map(t => [t.x + ',' + t.y, t]));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const k = x + ',' + y, t = at.get(k) || pend.get(k);
      const cell = el('button', { class: 'cell' + (at.has(k) ? ' tile' : '') + (pend.has(k) ? ' tile pending' : ''), 'aria-label': 'Space ' + x + ',' + y, disabled: at.has(k) || state.phase === 'over' });
      if (t) cell.append(tileSVG(t.c, t.s));
      cell.addEventListener('click', () => {
        if (pend.has(k)) pending = pending.filter(p => p.x + ',' + p.y !== k);
        else if (selected) pending.push({ x, y, c: selected.c, s: selected.s });
        render();
      });
      grid.append(cell);
    }
    return el('div', { class: 'boardwrap' }, grid);
  }

  function renderPlay() {
    const over = state.phase === 'over';
    const p = state.players[state.current];
    const res = pending.length ? Q.evaluateMove(state.board, pending) : null;
    let tooMany = pending.length > p.hand;
    const used = new Map();
    for (const t of state.board.concat(pending)) used.set(t.c * 6 + t.s, (used.get(t.c * 6 + t.s) || 0) + 1);

    const board = state.board.length === 0 && !pending.length
      ? 'First play: lay a line of tiles sharing a color or a shape (no repeats). Each tile scores 1.' : '';

    const players = el('div', { class: 'players' }, state.players.map((pl, i) =>
      el('div', { class: 'player' + (i === state.current && !over ? ' active' : '') },
        el('strong', {}, pl.name), el('div', { class: 'score' }, pl.score),
        el('small', {}, pl.hand + ' tiles in hand'))));

    const pal = el('div', { class: 'palette' });
    for (let c = 0; c < 6; c++) for (let s = 0; s < 6; s++) {
      const left = Q.COPIES - (used.get(c * 6 + s) || 0);
      const b = el('button', { class: 'pal' + (selected && selected.c === c && selected.s === s ? ' sel' : ''), disabled: left <= 0 || over,
        title: COLOR_NAME[c] + ' ' + SHAPE_NAME[s] + ' (' + left + ' left)', onclick: () => { selected = { c, s }; render(); } },
        tileSVG(c, s), el('b', {}, left));
      pal.append(b);
    }

    let msg;
    if (over) {
      const top = Math.max(...state.players.map(x => x.score));
      const w = state.players.filter(x => x.score === top).map(x => x.name);
      msg = el('div', { class: 'banner' }, '🏆 ' + (w.length > 1 ? 'Tie: ' + w.join(' & ') : w[0] + ' wins') + ' with ' + top + ' points!');
    } else if (!pending.length) msg = el('div', { class: 'msg' }, board || p.name + ': pick a tile below, then tap board spaces.');
    else if (tooMany) msg = el('div', { class: 'msg bad' }, p.name + ' only has ' + p.hand + ' tiles in hand.');
    else if (!res.ok) msg = el('div', { class: 'msg bad' }, res.error);
    else msg = el('div', { class: 'msg good' }, '+' + res.score + ' points' + (res.qwirkles ? ' — QWIRKLE!' : '') +
      (pending.length === p.hand && state.bag === 0 ? ' (+' + Q.GO_OUT_BONUS + ' for going out)' : ''));

    const canPlay = res && res.ok && !tooMany;
    const controls = over
      ? el('div', { class: 'row' }, el('button', { onclick: undoTurn, disabled: !state.undo.length }, 'Undo last turn'), el('button', { class: 'primary', onclick: () => { state = { phase: 'setup' }; save(); render(); } }, 'New game'))
      : el('div', { class: 'row' },
        el('button', { class: 'primary', disabled: !canPlay, onclick: commitPlay }, 'Score turn'),
        el('button', { disabled: !pending.length, onclick: () => { pending = []; render(); } }, 'Clear'),
        el('button', { disabled: Math.min(p.hand, state.bag) < 1, onclick: exchange }, 'Exchange tiles'),
        el('button', { onclick: pass }, 'Pass'),
        el('button', { disabled: !state.undo.length, onclick: undoTurn }, 'Undo last turn'),
        el('button', { class: 'ghost', disabled: state.bag > 0, onclick: endStalemate }, 'End game (no plays left)'));

    app.replaceChildren(
      el('section', { class: 'card' }, players,
        el('p', {}, el('small', {}, 'Bag: ' + state.bag + ' tiles · Turn ' + state.turn + (over ? '' : ' · ' + p.name + ' to play')))),
      el('section', { class: 'card' }, renderBoard(res), msg, controls),
      over ? null : el('section', { class: 'card' }, el('h2', {}, 'Tiles (' + 'tap to select, then tap board)'), pal),
      el('section', { class: 'card' }, el('h2', {}, 'Log'),
        el('ol', { class: 'log' }, state.log.slice().reverse().map(l => el('li', {}, l)))));
  }

  function render() { state.phase === 'setup' ? renderSetup() : renderPlay(); }

  document.getElementById('newGame').addEventListener('click', () => {
    if (state.phase === 'setup' || confirm('Abandon this game and start a new one?')) { state = { phase: 'setup' }; pending = []; save(); render(); }
  });
  render();
})();
