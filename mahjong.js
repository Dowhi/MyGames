// Mahjong Solitaire - mahjong.js
import {
  Storage, checkAndUnlock, playSound,
  spawnParticles, spawnGoldenRing, showGameOver, animateScore, trackGamePlayed
} from './script.js';

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

const TILE_W  = 52; 
const TILE_H  = 72;
const GAP     = 1;
const COLS    = 6;
const ROWS_PER_LAYER = 7;
const TOTAL_TILES_TARGET = 80;

export class MahjongGame {
  constructor() {
    this.boardEl  = document.getElementById('mj-board');
    this.trayEl   = document.getElementById('mj-tray');
    this.scoreEl  = document.getElementById('mj-score');
    this.levelEl  = document.getElementById('mj-level');
    this.timerEl  = document.getElementById('mj-timer-display');
    this.hintBtn      = document.getElementById('mj-hint-btn');
    this.reshuffleBtn = document.getElementById('mj-reshuffle-btn');
    this.tiles    = [];
    this.tray     = [];
    this.score    = 0;
    this.pairs    = 0;
    this.level    = 1;
    this._timer   = null;
    this._elapsed = 0;
    this.lives    = 3;
    this._faceDownFlipped = null;
    this.comboMultiplier = 1;
    this.lastMatchTime = 0;
    this.hintBtn.addEventListener('click', () => this.showHint());
    this.reshuffleBtn.addEventListener('click', () => this.reshuffleBoard());
    this.livesEl = document.getElementById('mj-lives');
    trackGamePlayed('mj');
  }

  start() {
    clearInterval(this._timer);
    this.score    = 0;
    this.pairs    = 0;
    this.tray     = [];
    this._elapsed = 0;
    this.level    = 1;
    this._faceDownFlipped = null;
    this.comboMultiplier = 1;
    this.lastMatchTime = 0;
    this.lives = 3 + Storage.getMahjongBonusLives();
    Storage.consumeMahjongBonusLives();
    this.scoreEl.textContent = '0';
    if (this.levelEl) this.levelEl.textContent = this.level;
    this.trayEl.innerHTML    = '';
    this.generateTiles();
    this.render();
    this.updateLivesUI();
    this.startTimer();
  }

  updateLivesUI() {
    if (this.livesEl) this.livesEl.textContent = String.fromCodePoint(0x2764, 0xFE0F).repeat(Math.max(0, this.lives));
  }

  generateTiles() {
    this.tiles = [];
    const allSlots = [];
    for (let r = 0; r <= (ROWS_PER_LAYER - 1) * 2; r += 2) {
      for (let c = 0; c <= (COLS - 1) * 2; c += 2) {
        allSlots.push({ layer: 0, row: r, col: c });
      }
    }
    let attempts = 0;
    while (allSlots.length < TOTAL_TILES_TARGET && attempts < 2000) {
      attempts++;
      const l = Math.floor(Math.random() * 4) + 1;
      const offset = l % 2; 
      const r = (Math.floor(Math.random() * (ROWS_PER_LAYER - l)) + Math.floor(l/2)) * 2 + offset;
      const c = (Math.floor(Math.random() * (COLS - l)) + Math.floor(l/2)) * 2 + offset;
      if (allSlots.some(s => s.layer === l && s.row === r && s.col === c)) continue;
      const hasSupport = [{r: r-1, c: c-1}, {r: r-1, c: c+1}, {r: r+1, c: c-1}, {r: r+1, c: c+1}]
        .every(sup => allSlots.some(s => s.layer === l-1 && s.row === sup.r && s.col === sup.c));
      if (hasSupport) allSlots.push({ layer: l, row: r, col: c });
    }
    if (allSlots.length % 2 !== 0) allSlots.pop();
    const remaining = [...allSlots];
    let id = 0;
    while (remaining.length >= 2) {
        const i1 = Math.floor(Math.random() * remaining.length);
        const s1 = remaining.splice(i1, 1)[0];
        const i2 = Math.floor(Math.random() * remaining.length);
        const s2 = remaining.splice(i2, 1)[0];
        const symbol = TILE_SYMBOLS[id % TILE_SYMBOLS.length];
        this.tiles.push({ id: id++, symbol, ...s1, faceDown: false, el: null });
        this.tiles.push({ id: id++, symbol, ...s2, faceDown: false, el: null });
    }
    shuffle(this.tiles);
    for (let i = 0; i < 10 && i < this.tiles.length; i++) {
        if (this.tiles[i].layer > 0) this.tiles[i].faceDown = true;
    }
  }

  render() {
    this.boardEl.innerHTML = '';
    // Calculate bounding box for perfect centering
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const tileCoords = this.tiles.map(tile => {
        const xOffset = -tile.layer * 6;
        const yOffset = tile.layer * 8;
        const x = tile.col * (TILE_W / 2) + xOffset;
        const y = tile.row * (TILE_H / 2) - yOffset;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x + TILE_W);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y + TILE_H);
        return { tile, x, y };
    });

    const boardActualW = maxX - minX;
    const boardActualH = maxY - minY;
    this.boardEl.style.width  = boardActualW + 'px';
    this.boardEl.style.height = boardActualH + 'px';

    // Auto-scale to fit container safely
    const parent = this.boardEl.parentElement;
    if (parent) {
      const availW = parent.clientWidth - 20;
      const availH = parent.clientHeight - 80; // Buffer for tray
      const scale = Math.min(1, availW / boardActualW, availH / (boardActualH || 1));
      this.boardEl.style.transform = `scale(${scale})`;
      this.boardEl.style.transformOrigin = 'center top';
    }

    for (const { tile, x, y } of tileCoords) {
      const el = document.createElement('div');
      // Normalize coordinated to start at 0 relative to boardEl
      const finalX = x - minX;
      const finalY = y - minY;

      el.className = 'mj-tile' + (tile.faceDown ? ' face-down' : '') +
                     (this.isFree(tile) && !tile.faceDown ? ' free' : ' blocked');
      el.style.cssText = `left:${finalX}px; top:${finalY}px; width:${TILE_W}px; height:${TILE_H}px; z-index:${tile.layer * 100 + tile.row}; --z: ${tile.layer};`;
      
      const content = document.createElement('div');
      content.className = 'mj-tile-content';
      
      if (!tile.faceDown) {
          const charSpan = document.createElement('span');
          charSpan.className = 'mj-tile-char';
          charSpan.style.backgroundImage = `url(${tile.symbol.img})`;
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

  isFree(tile) {
    const blockedAbove = this.tiles.some(t => t.layer === tile.layer + 1 && Math.abs(t.row - tile.row) < 2 && Math.abs(t.col - tile.col) < 2);
    if (blockedAbove) return false;
    const leftBlocked = this.tiles.some(t => t.layer === tile.layer && t.row === tile.row && t.col === tile.col - 2);
    const rightBlocked = this.tiles.some(t => t.layer === tile.layer && t.row === tile.row && t.col === tile.col + 2);
    return !leftBlocked || !rightBlocked;
  }

  handleClick(tile) {
    if (tile.faceDown) { this.flipFaceDown(tile); return; }
    if (!this.isFree(tile)) { playSound('error'); this.loseLife(); return; }
    this.moveTileToTray(tile);
  }

  flipFaceDown(tile) {
    if (this._faceDownFlipped && this._faceDownFlipped !== tile) { this._faceDownFlipped.faceDown = true; this.render(); }
    tile.faceDown = false;
    this._faceDownFlipped = tile;
    this.render();
    playSound('bonus');
  }

  moveTileToTray(tile) {
    if (this.tray.length >= 4) { this.loseLife(); this.tray = []; this.renderTray(); return; }
    playSound('click');
    this.tiles = this.tiles.filter(t => t !== tile);
    this.tray.push(tile);
    this.renderTray();
    this.checkTrayMatch();
    this.render();
    if (!this.tiles.length && !this.tray.length) { this.onWin(); return; }
    if (this.tray.length >= 4 && !this.hasTrayMatch()) this.onLose();
  }

  loseLife() { this.lives--; this.updateLivesUI(); if (this.lives <= 0) this.onLose(); }

  renderTray() {
    this.trayEl.innerHTML = '';
    for (const tile of this.tray) {
      const el = document.createElement('div');
      el.className = 'mj-tray-tile';
      el.innerHTML = `<div class="mj-tile-content"><span class="mj-tile-char" style="background-image:url(${tile.symbol.img});background-size:contain;background-repeat:no-repeat;background-position:center"></span></div>`;
      this.trayEl.appendChild(el);
    }
  }

  checkTrayMatch() {
    const counts = {};
    for (const t of this.tray) counts[t.symbol.id] = (counts[t.symbol.id] || 0) + 1;
    for (const [sid, count] of Object.entries(counts)) {
      if (count >= 2) {
        let indices = [];
        this.tray.forEach((t, idx) => { if (t.symbol.id === sid) indices.push(idx); });
        this.tray.splice(indices[1], 1);
        this.tray.splice(indices[0], 1);
        this.pairs++;
        this.score += 100 * this.comboMultiplier;
        this.scoreEl.textContent = this.score;
        playSound('match');
        this.renderTray();
        break;
      }
    }
  }

  hasTrayMatch() {
    const counts = {};
    for (const t of this.tray) counts[t.symbol.id] = (counts[t.symbol.id] || 0) + 1;
    return Object.values(counts).some(v => v >= 2);
  }

  startTimer() {
    clearInterval(this._timer);
    this._timer = setInterval(() => {
      this._elapsed++;
      const m = Math.floor(this._elapsed / 60).toString().padStart(2, '0');
      const s = (this._elapsed % 60).toString().padStart(2, '0');
      this.timerEl.textContent = `⏱ ${m}:${s}`;
    }, 1000);
  }

  showHint() {
      const free = this.tiles.filter(t => this.isFree(t) && !t.faceDown);
      for (let i = 0; i < free.length; i++) {
        for (let j = i + 1; j < free.length; j++) {
          if (free[i].symbol.id === free[j].symbol.id) {
            free[i].el.classList.add('hint-highlight');
            free[j].el.classList.add('hint-highlight');
            setTimeout(() => {
              free[i].el?.classList.remove('hint-highlight');
              free[j].el?.classList.remove('hint-highlight');
            }, 1500);
            return;
          }
        }
      }
  }

  reshuffleBoard() {
      const symbols = this.tiles.map(t => t.symbol);
      shuffle(symbols);
      this.tiles.forEach((t, i) => t.symbol = symbols[i]);
      this.render();
  }

  showSpecialMsg(msg) {
    const el = document.getElementById('special-match-msg');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 2000);
  }

  onWin() {
    const cleared = this.level;
    this.level++;
    if (this.levelEl) this.levelEl.textContent = this.level;
    if (cleared === 3 || (cleared > 3 && (cleared - 3) % 2 === 0)) {
        import('./script.js').then(m => m.showLifePicker(1));
        this.showSpecialMsg('🌟 ¡VIDA EXTRA CONSEGUIDA!');
    } else {
        this.showSpecialMsg('✨ ¡NIVEL COMPLETADO!');
    }
    Storage.updateStats('mj', true, this.pairs);
    checkAndUnlock('mj_level_' + cleared);
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    spawnParticles(cx, cy, 20);
    spawnGoldenRing(cx, cy);
    playSound('bonus');
    setTimeout(() => {
        this.tray = []; this.renderTray(); this._faceDownFlipped = null; this.generateTiles(); this.render();
    }, 1500);
  }

  onLose() {
    clearInterval(this._timer); playSound('error');
    Storage.updateStats('mj', false, this.pairs);
    showGameOver({ score: this.score, game: 'mj', won: false, extra: this.level, onReplay: () => this.start() });
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
