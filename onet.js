// ═══════════════════════════════════════════════════════════════
//  Onet Connect Fauna — onet.js
//  BFS pathfinding (≤3 turns), exterior border allowed
// ═══════════════════════════════════════════════════════════════

import {
  Storage, checkAndUnlock, playSound,
  spawnParticles, spawnGoldenRing, showGameOver, animateScore, trackGamePlayed
} from './script.js';

const FAUNA_ICONS = [
  '🦋','🐬','🦁','🦊','🐸','🦝','🐧','🦜','🦚','🦀',
  '🐙','🦈','🐳','🦌','🦒','🦓','🐘','🦏','🦛','🐪',
  '🦅','🦆','🦉','🦋','🐝','🐞','🦗','🦟','🐌','🐛',
];

const DIFF = {
  easy:   { rows: 5,  cols: 6,  time: 90, lives: 3 },
  medium: { rows: 6,  cols: 8,  time: 60, lives: 2 },
  hard:   { rows: 8,  cols: 10, time: 90, lives: 1 },
};

export class OnetGame {
  constructor() {
    this.boardEl    = document.getElementById('onet-board');
    this.canvasEl   = document.getElementById('onet-canvas');
    this.scoreEl    = document.getElementById('onet-score');
    this.timerEl    = document.getElementById('onet-timer-display');
    this.livesEl    = document.getElementById('onet-lives');
    this.diffSel    = document.getElementById('onet-difficulty-select');
    this.hintBtn    = document.getElementById('onet-hint-btn');

    this.grid     = [];   // [row][col] = emoji  | null
    this.rows     = 0;
    this.cols     = 0;
    this.selected = null;
    this.score    = 0;
    this.lives    = 3;
    this.timeLeft = 90;
    this._timer   = null;
    this._path    = null;
    this._pathTimer = null;

    this._bindDiff();
    this.hintBtn.addEventListener('click', () => this.showHint());
    trackGamePlayed('onet');
  }

  // ─── Difficulty ──────────────────────────────────────────────
  _bindDiff() {
    document.querySelectorAll('.diff-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = DIFF[btn.dataset.diff];
        this.startGame(btn.dataset.diff, d);
      });
    });
  }

  showDifficultySelect() {
    this.diffSel.style.display = 'flex';
    clearInterval(this._timer);
  }

  // ─── Start ───────────────────────────────────────────────────
  startGame(diffKey, diff) {
    this.diffSel.style.display = 'none';
    clearInterval(this._timer);

    this.rows     = diff.rows;
    this.cols     = diff.cols;
    this.lives    = diff.lives;
    this.timeLeft = diff.time;
    this.score    = 0;
    this.selected = null;
    this.scoreEl.textContent = '0';

    this.generateGrid();
    this.renderBoard();
    this.updateLives();
    this.startTimer();
  }

  // ─── Grid Generation ─────────────────────────────────────────
  generateGrid() {
    const total = this.rows * this.cols;
    const pairs = total / 2;
    const icons = [];

    for (let i = 0; i < pairs; i++) {
      const emoji = FAUNA_ICONS[i % FAUNA_ICONS.length];
      icons.push(emoji, emoji);
    }
    shuffle(icons);

    this.grid = [];
    for (let r = 0; r < this.rows; r++) {
      this.grid.push([]);
      for (let c = 0; c < this.cols; c++) {
        this.grid[r][c] = icons[r * this.cols + c];
      }
    }
  }

  // ─── Render ──────────────────────────────────────────────────
  renderBoard() {
    this.boardEl.innerHTML = '';
    this.boardEl.style.gridTemplateColumns = `repeat(${this.cols}, 1fr)`;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = document.createElement('div');
        cell.className = 'onet-cell' + (this.grid[r][c] ? '' : ' empty');
        cell.dataset.row = r;
        cell.dataset.col = c;
        if (this.grid[r][c]) {
          cell.textContent = this.grid[r][c];
          cell.setAttribute('aria-label', this.grid[r][c]);
          cell.addEventListener('click', () => this.handleClick(r, c));
        }
        this.boardEl.appendChild(cell);
      }
    }
    this.resizeCanvas();
  }

  resizeCanvas() {
    const rect = this.boardEl.getBoundingClientRect();
    this.canvasEl.style.top    = rect.top + 'px';
    this.canvasEl.style.left   = rect.left + 'px';
    this.canvasEl.width        = rect.width;
    this.canvasEl.height       = rect.height;
    this.canvasEl.style.width  = rect.width + 'px';
    this.canvasEl.style.height = rect.height + 'px';
  }

  getCellEl(r, c) {
    return this.boardEl.querySelector(`[data-row="${r}"][data-col="${c}"]`);
  }

  // ─── Click ───────────────────────────────────────────────────
  handleClick(r, c) {
    const val = this.grid[r][c];
    if (!val) return;

    if (this.selected && this.selected[0] === r && this.selected[1] === c) {
      this.getCellEl(r, c)?.classList.remove('selected');
      this.selected = null;
      return;
    }

    if (!this.selected) {
      this.selected = [r, c];
      this.getCellEl(r, c)?.classList.add('selected');
      playSound('click');
      return;
    }

    const [ar, ac] = this.selected;
    const valA = this.grid[ar][ac];

    this.getCellEl(ar, ac)?.classList.remove('selected');
    this.selected = null;

    if (valA === val) {
      const path = this.bfs(ar, ac, r, c);
      if (path) {
        this.doMatch(ar, ac, r, c, path);
      } else {
        playSound('error');
        this.loseLife();
      }
    } else {
      playSound('error');
    }
  }

  // ─── BFS Pathfinding ─────────────────────────────────────────
  // Expanded grid: add 1 cell border on all sides (exterior space)
  bfs(ar, ac, br, bc) {
    const R = this.rows + 2;
    const C = this.cols + 2;
    const toGrid = (r, c) => [r - 1, c - 1];
    const toExp  = (r, c) => [r + 1, c + 1];

    const [eAr, eAc] = toExp(ar, ac);
    const [eBr, eBc] = toExp(br, bc);

    const isFree = (r, c) => {
      if (r < 0 || r >= R || c < 0 || c >= C) return false;
      const [gr, gc] = toGrid(r, c);
      if (gr < 0 || gr >= this.rows || gc < 0 || gc >= this.cols) return true; // exterior
      if (gr === ar && gc === ac) return true; // start
      if (gr === br && gc === bc) return true; // end
      return !this.grid[gr][gc];
    };

    // BFS with turn count ≤ 2 (meaning ≤3 segments)
    // State: (r, c, direction, turns)
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    const queue = [];
    // { r, c, dir, turns, path }
    for (const [dr, dc] of dirs) {
      const nr = eAr + dr, nc = eAc + dc;
      if (isFree(nr, nc)) {
        queue.push({ r: nr, c: nc, dir: `${dr},${dc}`, turns: 0, path: [[eAr, eAc], [nr, nc]] });
      }
    }

    const visited = {}; // key = "r,c,dir,turns"
    const key = (r, c, dir, t) => `${r},${c},${dir},${t}`;

    let qi = 0;
    while (qi < queue.length) {
      const { r, c, dir, turns, path } = queue[qi++];
      if (r === eBr && c === eBc) {
        // Reconstruct actual grid coords
        return path.map(([pr, pc]) => toGrid(pr, pc));
      }
      if (turns > 2) continue;
      const k = key(r, c, dir, turns);
      if (visited[k]) continue;
      visited[k] = true;

      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        const nDir = `${dr},${dc}`;
        const nTurns = turns + (nDir !== dir ? 1 : 0);
        if (nTurns > 2) continue;
        if (!isFree(nr, nc)) continue;
        const nk = key(nr, nc, nDir, nTurns);
        if (visited[nk]) continue;
        queue.push({ r: nr, c: nc, dir: nDir, turns: nTurns, path: [...path, [nr, nc]] });
      }
    }
    return null;
  }

  // ─── Match ───────────────────────────────────────────────────
  doMatch(ar, ac, br, bc, path) {
    playSound('match');
    this.grid[ar][ac] = null;
    this.grid[br][bc] = null;

    const elA = this.getCellEl(ar, ac);
    const elB = this.getCellEl(br, bc);

    // Draw path
    this.drawPath(path, ar, ac, br, bc);

    elA?.classList.add('removing');
    elB?.classList.add('removing');
    setTimeout(() => {
      elA?.classList.remove('removing');
      elB?.classList.remove('removing');
      if (elA) { elA.textContent = ''; elA.className = 'onet-cell empty'; elA.replaceWith(elA.cloneNode()); }
      if (elB) { elB.textContent = ''; elB.className = 'onet-cell empty'; elB.replaceWith(elB.cloneNode()); }
      this.clearPath();

      const remaining = this.grid.flat().filter(Boolean).length;
      if (remaining === 0) { this.onWin(); return; }
      if (!this.hasValidMoves()) { this.onWin(); return; }
    }, 500);

    this.score += 100;
    animateScore('onet-score', this.score - 100, this.score);
    const rectA = elA?.getBoundingClientRect();
    if (rectA) {
      const cx = rectA.left + rectA.width / 2;
      const cy = rectA.top  + rectA.height / 2;
      spawnGoldenRing(cx, cy);
      spawnParticles(cx, cy, 5);
    }
    checkAndUnlock('first_match');
  }

  // ─── Draw Connection Path ────────────────────────────────────
  drawPath(path, ar, ac, br, bc) {
    const ctx = this.canvasEl.getContext('2d');
    ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);

    const elFirst = this.getCellEl(ar, ac);
    const elLast  = this.getCellEl(br, bc);
    if (!elFirst || !elLast) return;

    const boardRect = this.boardEl.getBoundingClientRect();
    const getCenter = (r, c) => {
      // Use offsets from grid index
      const cellW = this.canvasEl.width  / this.cols;
      const cellH = this.canvasEl.height / this.rows;
      return [(c + 0.5) * cellW, (r + 0.5) * cellH];
    };

    const pts = [[ar, ac], ...path.slice(1, -1), [br, bc]];
    const screenPts = [[ar, ac], [br, bc]];

    // Draw path — champagne gold stroke
    ctx.strokeStyle = 'rgba(201,168,76,0.85)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(232,201,122,0.50)';
    ctx.shadowBlur = 8;
    ctx.globalAlpha = 0.85;

    const [sx, sy] = getCenter(ar, ac);
    const [ex, ey] = getCenter(br, bc);

    ctx.beginPath();
    ctx.moveTo(sx, sy);

    for (const [pr, pc] of path.slice(1)) {
      const gr = pr - 1, gc = pc - 1;
      if (gr < 0 || gr >= this.rows || gc < 0 || gc >= this.cols) {
        // exterior point — clamp to edge
        const cx = Math.max(0, Math.min(this.cols - 0.5, gc + 0.5)) * (this.canvasEl.width / this.cols);
        const cy = Math.max(0, Math.min(this.rows - 0.5, gr + 0.5)) * (this.canvasEl.height / this.rows);
        ctx.lineTo(cx, cy);
      } else {
        const [px, py] = getCenter(gr, gc);
        ctx.lineTo(px, py);
      }
    }
    ctx.lineTo(ex, ey);
    ctx.stroke();

    clearTimeout(this._pathTimer);
    this._pathTimer = setTimeout(() => this.clearPath(), 600);
  }

  clearPath() {
    const ctx = this.canvasEl.getContext('2d');
    ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
  }

  // ─── Hint ────────────────────────────────────────────────────
  showHint() {
    const move = this.findMove();
    if (!move) return;
    const [ar, ac, br, bc] = move;
    const elA = this.getCellEl(ar, ac);
    const elB = this.getCellEl(br, bc);
    [elA, elB].forEach(el => {
      if (!el) return;
      el.classList.add('selected');
      setTimeout(() => el.classList.remove('selected'), 2000);
    });
  }

  findMove() {
    const cells = [];
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++)
        if (this.grid[r][c]) cells.push([r, c]);

    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const [ar, ac] = cells[i], [br, bc] = cells[j];
        if (this.grid[ar][ac] === this.grid[br][bc] && this.bfs(ar, ac, br, bc)) {
          return [ar, ac, br, bc];
        }
      }
    }
    return null;
  }

  hasValidMoves() { return !!this.findMove(); }

  // ─── Lives ───────────────────────────────────────────────────
  loseLife() {
    this.lives--;
    this.updateLives();
    if (this.lives <= 0) this.onLose();
  }

  updateLives() {
    this.livesEl.textContent = '❤️'.repeat(Math.max(0, this.lives));
  }

  // ─── Timer ───────────────────────────────────────────────────
  startTimer() {
    const el = this.timerEl;
    clearInterval(this._timer);
    this._timer = setInterval(() => {
      this.timeLeft--;
      const m = Math.floor(this.timeLeft / 60).toString().padStart(2, '0');
      const s = (this.timeLeft % 60).toString().padStart(2, '0');
      el.textContent = `⏱ ${m}:${s}`;
      if (this.timeLeft <= 10) el.classList.add('urgent');
      else el.classList.remove('urgent');
      if (this.timeLeft <= 0) { clearInterval(this._timer); this.onLose(); }
    }, 1000);
  }

  // ─── Win / Lose ───────────────────────────────────────────────
  onWin() {
    clearInterval(this._timer);
    Storage.updateStats('onet', true, this.score / 100);
    checkAndUnlock('onet_win');
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    spawnParticles(cx, cy, 20);
    spawnGoldenRing(cx, cy);
    setTimeout(() => spawnGoldenRing(cx, cy), 140);
    showGameOver({ score: this.score, game: 'onet', won: true, onReplay: () => this.showDifficultySelect() });
  }

  onLose() {
    clearInterval(this._timer);
    playSound('error');
    Storage.updateStats('onet', false, this.score / 100);
    showGameOver({ score: this.score, game: 'onet', won: false, onReplay: () => this.showDifficultySelect() });
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
