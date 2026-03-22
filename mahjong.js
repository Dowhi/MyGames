// ═══════════════════════════════════════════════════════════════
//  Mahjong Solitaire — mahjong.js
//  5-column layout, 3D tiles, 7-slot tray, match-2 free tiles
// ═══════════════════════════════════════════════════════════════

import {
  Storage, checkAndUnlock, playSound,
  spawnParticles, spawnGoldenRing, showGameOver, animateScore, trackGamePlayed
} from './script.js';

// ─── Tile Symbol Set (Zodiacs & Characters from Photo) ───────
const TILE_SYMBOLS = [
  { id: 'apple',     img: 'assets/mahjong/food_apple.png' },
  { id: 'banana',    img: 'assets/mahjong/food_banana.png' },
  { id: 'bread',     img: 'assets/mahjong/food_bread.png' },
  { id: 'broccoli',  img: 'assets/mahjong/food_broccoli.png' },
  { id: 'carrot',    img: 'assets/mahjong/food_carrot.png' },
  { id: 'cheese',    img: 'assets/mahjong/food_cheese.png' },
  { id: 'chocolate', img: 'assets/mahjong/food_chocolate.png' },
  { id: 'coffee',    img: 'assets/mahjong/food_coffee.png' },
  { id: 'croissant', img: 'assets/mahjong/food_croissant.png' },
  { id: 'egg',       img: 'assets/mahjong/food_egg.png' },
  { id: 'fish',      img: 'assets/mahjong/food_fish.png' },
  { id: 'grapes',    img: 'assets/mahjong/food_grapes.png' },
  { id: 'olive',     img: 'assets/mahjong/food_olive.png' },
  { id: 'pear',      img: 'assets/mahjong/food_pear.png' },
  { id: 'pizza',     img: 'assets/mahjong/food_pizza.png' },
  { id: 'sushi',     img: 'assets/mahjong/food_sushi.png' },
  { id: 'walnut',    img: 'assets/mahjong/food_walnut.png' }
];

const TILE_W  = 54;
const TILE_H  = 76;
const GAP     = 2;
const COLS    = 6;
const ROWS_PER_LAYER = 7;
const TOTAL_TILES_TARGET = 80;

export class MahjongGame {
  constructor() {
    this.boardEl  = document.getElementById('mj-board');
    this.trayEl   = document.getElementById('mj-tray');
    this.scoreEl  = document.getElementById('mj-score');
    this.timerEl  = document.getElementById('mj-timer-display');
    this.newBtn       = document.getElementById('mj-new-btn');
    this.hintBtn      = document.getElementById('mj-hint-btn');
    this.reshuffleBtn = document.getElementById('mj-reshuffle-btn');

    this.tiles    = [];  // { id, symbol, layer, row, col, faceDown, el }
    this.tray     = [];  // symbol slots (max 4)
    this.selected = null;
    this.score    = 0;
    this.pairs    = 0;
    this._timer   = null;
    this._elapsed = 0;
    this._faceDownFlipped = null;

    this.newBtn.addEventListener('click', () => this.start());
    this.hintBtn.addEventListener('click', () => this.showHint());
    this.reshuffleBtn.addEventListener('click', () => this.reshuffleBoard());
    this.livesEl = document.getElementById('mj-lives');
    trackGamePlayed('mj');
  }

  // ─── Start ───────────────────────────────────────────────────
  start() {
    clearInterval(this._timer);
    this.score    = 0;
    this.pairs    = 0;
    this.selected = null;
    this.tray     = [];
    this._elapsed = 0;
    this._faceDownFlipped = null;
    
    // Base 3 lives + bonus from MyGames Classic
    this.lives = 3 + Storage.getMahjongBonusLives();
    Storage.consumeMahjongBonusLives();
    
    this.scoreEl.textContent = '0';
    this.trayEl.innerHTML    = '';

    this.generateTiles();
    this.render();
    this.updateLivesUI();
    this.startTimer();
  }

  updateLivesUI() {
    if (this.livesEl) this.livesEl.textContent = '❤️'.repeat(Math.max(0, this.lives));
  }

  // ─── Generate Layout ─────────────────────────────────────────
  generateTiles() {
    this.tiles = [];
    const allSlots = [];
    const baseW = COLS * 2;
    const baseH = ROWS_PER_LAYER * 2;

    // Phase 1: Full Base Layer (z=0) -> 6 columns x 7 rows = 42 tiles
    for (let r = 0; r <= (ROWS_PER_LAYER - 1) * 2; r += 2) {
      for (let c = 0; c <= (COLS - 1) * 2; c += 2) {
        allSlots.push({ layer: 0, row: r, col: c });
      }
    }

    // Phase 2: Random Growth (to hit 80 tiles)
    // We need 80 - 42 = 38 more tiles.
    let attempts = 0;
    while (allSlots.length < TOTAL_TILES_TARGET && attempts < 2000) {
      attempts++;
      const l = Math.floor(Math.random() * 4) + 1; // layers 1, 2, 3, 4
      const offset = l % 2; 
      // Higher layers should be slightly more centered (shorter range)
      const r = (Math.floor(Math.random() * (ROWS_PER_LAYER - l)) + Math.floor(l/2)) * 2 + offset;
      const c = (Math.floor(Math.random() * (COLS - l)) + Math.floor(l/2)) * 2 + offset;

      // Duplicate check
      if (allSlots.some(s => s.layer === l && s.row === r && s.col === c)) continue;

      // Support check: Requires 4 tiles at layer l-1 below
      const hasSupport = [
        {r: r-1, c: c-1}, {r: r-1, c: c+1},
        {r: r+1, c: c-1}, {r: r+1, c: c+1}
      ].every(sup => allSlots.some(s => s.layer === l-1 && s.row === sup.r && s.col === sup.c));

      if (hasSupport) {
        allSlots.push({ layer: l, row: r, col: c });
      }
    }

    if (allSlots.length % 2 !== 0) allSlots.pop();

    // 2. Inverse Gemeration (保证可解性)
    // We pick "free" slots from the remaining pool and assign them in pairs
    const remaining = [...allSlots];
    let id = 0;

    while (remaining.length >= 2) {
      const pickableIndices = [];
      for (let i = 0; i < remaining.length; i++) {
        const s = remaining[i];
        // Rule A: Above check (|diff| < 2)
        const blockedAbove = remaining.some(t => t !== s && t.layer === s.layer + 1 && Math.abs(t.row - s.row) < 2 && Math.abs(t.col - s.col) < 2);
        if (blockedAbove) continue;

        // Rule B: Side check (x \pm 2)
        const leftBlocked = remaining.some(t => t !== s && t.layer === s.layer && t.row === s.row && t.col === s.col - 2);
        const rightBlocked = remaining.some(t => t !== s && t.layer === s.layer && t.row === s.row && t.col === s.col + 2);
        if (!leftBlocked || !rightBlocked) pickableIndices.push(i);
      }

      if (pickableIndices.length < 2) {
        const i1 = Math.floor(Math.random() * remaining.length);
        const s1 = remaining.splice(i1, 1)[0];
        const i2 = Math.floor(Math.random() * remaining.length);
        const s2 = remaining.splice(i2, 1)[0];
        const symbol = TILE_SYMBOLS[id % TILE_SYMBOLS.length];
        this.tiles.push({ id: id++, symbol, ...s1, faceDown: false, el: null });
        this.tiles.push({ id: id++, symbol, ...s2, faceDown: false, el: null });
        continue;
      }

      const idxA = pickableIndices.splice(Math.floor(Math.random() * pickableIndices.length), 1)[0];
      const s1 = remaining.splice(idxA, 1)[0];
      
      const pickableIndicesB = [];
      for (let i = 0; i < remaining.length; i++) {
        const s = remaining[i];
        const blockedAbove = remaining.some(t => t !== s && t.layer === s.layer + 1 && Math.abs(t.row - s.row) < 2 && Math.abs(t.col - s.col) < 2);
        if (blockedAbove) continue;
        const leftBlocked = remaining.some(t => t !== s && t.layer === s.layer && t.row === s.row && t.col === s.col - 2);
        const rightBlocked = remaining.some(t => t !== s && t.layer === s.layer && t.row === s.row && t.col === s.col + 2);
        if (!leftBlocked || !rightBlocked) pickableIndicesB.push(i);
      }
      
      const idxB = pickableIndicesB.length > 0 ? pickableIndicesB[Math.floor(Math.random() * pickableIndicesB.length)] : 0;
      const s2 = remaining.splice(idxB, 1)[0];

      const symbol = TILE_SYMBOLS[id % TILE_SYMBOLS.length];
      this.tiles.push({ id: id++, symbol, ...s1, faceDown: false, el: null });
      this.tiles.push({ id: id++, symbol, ...s2, faceDown: false, el: null });
    }

    // Phase 3: Select exactly 10 tiles distributed among layers 2, 3, 4 (internal 1, 2, 3)
    const l2 = shuffle(this.tiles.filter(t => t.layer === 1));
    const l3 = shuffle(this.tiles.filter(t => t.layer === 2));
    const l4 = shuffle(this.tiles.filter(t => t.layer === 3));
    
    let count = 0;
    const pickFrom = (list, num) => {
      for (let i = 0; i < num && list.length > 0 && count < 10; i++) {
        list.pop().faceDown = true;
        count++;
      }
    };
    
    // Distribution attempt: spread across internal layers 1, 2, 3
    pickFrom(l4, 3);
    pickFrom(l3, 3);
    pickFrom(l2, 3);
    
    // Fill remaining if needed to reach exactly 10
    if (count < 10) {
      const remainingUpper = shuffle([...l2, ...l3, ...l4].filter(t => !t.faceDown));
      pickFrom(remainingUpper, 10 - count);
    }
  }

  // ─── Render ──────────────────────────────────────────────────
  render() {
    this.boardEl.innerHTML = '';
    const boardW = COLS * (TILE_W + GAP);
    const boardH = ROWS_PER_LAYER * (TILE_H + GAP) + 3 * 8; // layer offsets
    this.boardEl.style.width  = boardW + 'px';
    this.boardEl.style.height = boardH + 'px';

    // Sort by layer so higher layers render on top
    const sorted = [...this.tiles].sort((a, b) => a.layer - b.layer || a.row - b.row || a.col - b.col);
    for (const tile of sorted) {
      const el = document.createElement('div');
      // Half-grid positioning: 1 unit = TILE_DIM / 2
      const xOffset = -tile.layer * 6;
      const yOffset = tile.layer * 8;
      
      const x = tile.col * (TILE_W / 2) + xOffset;
      const y = tile.row * (TILE_H / 2) - yOffset;

      el.className = 'mj-tile' + (tile.faceDown ? ' face-down' : '') +
                     (this.isFree(tile) && !tile.faceDown ? ' free' : ' blocked');
      el.style.cssText = `left:${x}px; top:${y}px; width:${TILE_W}px; height:${TILE_H}px; z-index:${tile.layer * 100 + tile.row}; --z: ${tile.layer};`;
      
      const content = document.createElement('div');
      content.className = 'mj-tile-content';
      
      if (!tile.faceDown) {
          const charSpan = document.createElement('span');
          charSpan.className = 'mj-tile-char';
          charSpan.style.backgroundImage = `url(${tile.symbol.img})`;
          charSpan.style.backgroundSize = 'contain';
          charSpan.style.backgroundRepeat = 'no-repeat';
          charSpan.style.backgroundPosition = 'center';
          content.appendChild(charSpan);
      }
      el.appendChild(content);

      el.setAttribute('aria-label', tile.faceDown ? 'Ficha boca abajo' : 'Ficha Mahjong');
      el.setAttribute('role', 'button');
      el.addEventListener('click', () => this.handleClick(tile));

      tile.el = el;
      this.boardEl.appendChild(el);
    }
  }

  // ─── Free Check ──────────────────────────────────────────────
  isFree(tile) {
    // 1. Check for any tile in layer z+1 that overlaps (abs diff < 2 units)
    const blockedAbove = this.tiles.some(t => 
      t.layer === tile.layer + 1 &&
      Math.abs(t.row - tile.row) < 2 &&
      Math.abs(t.col - tile.col) < 2
    );
    if (blockedAbove) return false;

    // 2. Lateral freedom (Rule B): Free if Left OR Right is empty
    const leftBlocked = this.tiles.some(t => 
      t.layer === tile.layer && 
      t.row === tile.row && 
      t.col === tile.col - 2
    );
    const rightBlocked = this.tiles.some(t => 
      t.layer === tile.layer && 
      t.row === tile.row && 
      t.col === tile.col + 2
    );

    return !leftBlocked || !rightBlocked;
  }

  // ─── Click ───────────────────────────────────────────────────
  handleClick(tile) {
    if (tile.faceDown) {
      this.flipFaceDown(tile);
      return;
    }
    if (!this.isFree(tile)) {
      playSound('error');
      this.loseLife();
      return;
    }

    if (this.selected === tile) {
      tile.el?.classList.remove('selected');
      this.selected = null;
      return;
    }

    // Move to tray
    this.moveTileToTray(tile);
  }

  flipFaceDown(tile) {
    // Only one face-down tile flipped at a time
    if (this._faceDownFlipped && this._faceDownFlipped !== tile) {
      const prev = this._faceDownFlipped;
      prev.faceDown = true;
      if (prev.el) {
        prev.el.classList.add('face-down');
        prev.el.innerHTML = '';
        // Restore blocked/free status visual
        const isFree = this.isFree(prev);
        prev.el.classList.toggle('free', isFree);
        prev.el.classList.toggle('blocked', !isFree);
      }
    }

    tile.faceDown = false;
    this._faceDownFlipped = tile;
    
    if (tile.el) {
      tile.el.classList.remove('face-down');
      tile.el.innerHTML = '';
      const content = document.createElement('div');
      content.className = 'mj-tile-content';
      const charSpan = document.createElement('span');
      charSpan.className = 'mj-tile-char';
      charSpan.style.backgroundImage = `url(${tile.symbol.img})`;
      content.appendChild(charSpan);
      tile.el.appendChild(content);
      
      // Flipping makes it "free" to interact with for matching
      tile.el.classList.remove('blocked');
      tile.el.classList.add('free');
    }
    playSound('bonus');
  }

  // ─── Tray Logic ───────────────────────────────────────────────
  moveTileToTray(tile) {
    if (this.tray.length >= 4) {
      if (this.lives > 1) {
          this.loseLife();
          this.tray = [];
          this.renderTray();
          playSound('bonus');
      } else {
          this.onLose();
          return;
      }
    }

    playSound('click');

    // Remove from board
    this.tiles = this.tiles.filter(t => t !== tile);
    tile.el?.classList.add('removing');
    setTimeout(() => tile.el?.remove(), 350);

    this.tray.push(tile);
    this.renderTray();

    // Check for match in tray
    this.checkTrayMatch();

    // Re-evaluate free tiles
    this.render();

    // Check game over
    if (!this.tiles.length) { this.onWin(); return; }
    if (this.tray.length >= 4 && !this.hasTrayMatch()) {
      this.onLose();
    }
    if (!this.hasFreeTiles() && !this.hasTrayMatch()) {
      if (this.lives > 1) {
          this.loseLife();
          this.tray = [];
          this.renderTray();
          playSound('bonus');
      } else {
          this.onLose();
      }
    }
  }

  loseLife() {
      this.lives--;
      this.updateLivesUI();
      if (this.lives <= 0) this.onLose();
  }

  renderTray() {
    this.trayEl.innerHTML = '';
    for (const tile of this.tray) {
      const el = document.createElement('div');
      el.className = 'mj-tray-tile';
      
      const content = document.createElement('div');
      content.className = 'mj-tile-content';
      const charSpan = document.createElement('span');
      charSpan.className = 'mj-tile-char';
      charSpan.style.backgroundImage = `url(${tile.symbol.img})`;
      charSpan.style.backgroundSize = 'contain';
      charSpan.style.backgroundRepeat = 'no-repeat';
      charSpan.style.backgroundPosition = 'center';
      content.appendChild(charSpan);
      el.appendChild(content);

      el.setAttribute('role', 'listitem');
      this.trayEl.appendChild(el);
    }
  }

  checkTrayMatch() {
    // Look for identical symbols in the tray
    const counts = {};
    for (let i = 0; i < this.tray.length; i++) {
      const s = this.tray[i].symbol.id;
      if (!counts[s]) counts[s] = [];
      counts[s].push(i);
    }
    for (const [sid, idxs] of Object.entries(counts)) {
      if (idxs.length >= 2) {
        const i = idxs[0], j = idxs[1];
        this.removeTrayPair(i, j, sid);
        return;
      }
    }
  }

  removeTrayPair(i, j, symbolChar) {
    setTimeout(() => {
      this.tray.splice(Math.max(i, j), 1);
      this.tray.splice(Math.min(i, j), 1);

      this.pairs++;
      this.score += 50;
      animateScore('mj-score', this.score - 50, this.score);
      // Luxury tray match FX
      const cx = window.innerWidth / 2, cy = window.innerHeight * 0.75;
      spawnGoldenRing(cx, cy);
      spawnParticles(cx, cy, 8);
      playSound('match');

      this.renderTray();

      if (!this.tiles.length && !this.tray.length) this.onWin();
    }, 200);
  }

  hasTrayMatch() {
    const counts = {};
    for (const t of this.tray) {
      const sid = t.symbol.id;
      counts[sid] = (counts[sid] || 0) + 1;
    }
    return Object.values(counts).some(v => v >= 2);
  }

  hasFreeTiles() {
    return this.tiles.some(t => !t.faceDown && this.isFree(t));
  }

  // ─── Timer ───────────────────────────────────────────────────
  startTimer() {
    clearInterval(this._timer);
    this._elapsed = 0;
    this._timer = setInterval(() => {
      this._elapsed++;
      const m = Math.floor(this._elapsed / 60).toString().padStart(2, '0');
      const s = (this._elapsed % 60).toString().padStart(2, '0');
      this.timerEl.textContent = `⏱ ${m}:${s}`;
    }, 1000);
  }

  // ─── Zen Extensions ──────────────────────────────────────────
  showHint() {
      const freeTiles = this.tiles.filter(t => this.isFree(t) && !t.faceDown);
      // Find a pair
      for (let i = 0; i < freeTiles.length; i++) {
          for (let j = i + 1; j < freeTiles.length; j++) {
              if (freeTiles[i].symbol.id === freeTiles[j].symbol.id) {
                  this.highlightHint(freeTiles[i], freeTiles[j]);
                  return;
              }
          }
      }
      this.showSpecialMsg('No hay parejas a la vista... ¡Prueba a barajar!');
  }

  highlightHint(t1, t2) {
      t1.el?.classList.add('hint-highlight');
      t2.el?.classList.add('hint-highlight');
      setTimeout(() => {
          t1.el?.classList.remove('hint-highlight');
          t2.el?.classList.remove('hint-highlight');
      }, 1500);
      playSound('hint');
  }

  reshuffleBoard() {
      if (this.tiles.length === 0) return;
      // Collect current symbols
      const currentSymbols = this.tiles.map(t => t.symbol);
      shuffle(currentSymbols);
      // Re-assign
      this.tiles.forEach((t, i) => {
          t.symbol = currentSymbols[i];
      });
      this.render();
      this.showSpecialMsg('✨ Tablero Barajado');
      playSound('bonus');
  }

  showSpecialMsg(msg) {
    const el = document.getElementById('special-match-msg');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 2000);
  }

  // ─── Win / Lose ──────────────────────────────────────────────
  onWin() {
    clearInterval(this._timer);
    Storage.updateStats('mj', true, this.pairs);
    checkAndUnlock('mj_win');
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    spawnParticles(cx, cy, 20);
    spawnGoldenRing(cx, cy);
    setTimeout(() => spawnGoldenRing(cx, cy), 150);
    showGameOver({ score: this.score, game: 'mj', won: true, onReplay: () => this.start() });
  }

  onLose() {
    clearInterval(this._timer);
    playSound('error');
    Storage.updateStats('mj', false, this.pairs);
    showGameOver({ score: this.score, game: 'mj', won: false, onReplay: () => this.start() });
  }
}

// ─── Helpers ─────────────────────────────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
