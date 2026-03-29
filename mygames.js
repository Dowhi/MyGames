// ═══════════════════════════════════════════════════════════════
//  MyGames Classic — mygames.js
//  Juego de parejas de números: suma 10 o iguales
//  Adyacencia horizontal/vertical/diagonal + salto de línea
// ═══════════════════════════════════════════════════════════════

import {
  Storage, checkAndUnlock, ACHIEVEMENTS,
  playSound, spawnParticles, spawnGoldenRing, spawnScoreParticles,
  showScorePopup, animateScore, showGameOver, trackGamePlayed
} from './script.js';

const COLS = 9;

export class MyGamesGame {
  constructor() {
    this.boardEl      = document.getElementById('mg-board');
    this.scoreEl      = document.getElementById('mg-score');
    this.phaseDisplay = document.getElementById('mg-phase-display');
    this.hintsCountEl = document.getElementById('mg-hints-count');
    this.addsCountEl  = document.getElementById('mg-adds-count');
    this.livesCountEl = document.getElementById('mg-lives-count');
    
    this.hintBtn      = document.getElementById('mg-hint-btn');
    this.addBtn       = document.getElementById('mg-add-btn');
    this.newBtn       = document.getElementById('mg-new-game-btn');
    this.msgEl        = document.getElementById('special-match-msg');
    this.pairsEl      = document.getElementById('mg-pairs');
    this.emptyEl      = document.getElementById('mg-empty');

    this.cells     = [];  // 1D array of { el, val }  (val=0 means empty)
    this.selected  = null;
    this.score     = 0;
    this.pairs     = 0;
    this.phase     = 1;
    this.hintsLeft = 5;
    this.addsLeft  = 5;
    this.hintUsed  = false;
    this._msgTimer = null;

    this._bind();
    trackGamePlayed('mg');
  }

  // ─── Init ───────────────────────────────────────────────────
  start(isNewGame = false) {
    // If it's a new game, we ignore saved state and clear storage
    const saved = isNewGame ? null : Storage.get?.('gameState', null);
    
    if (saved && saved.cells) {
      this.loadState(saved);
    } else {
      this.score     = 0;
      this.pairs     = 0;
      this.phase     = 1;
      this.hintsLeft = 5;
      this.addsLeft  = 5;
      this.selected  = null;
      this.hintUsed  = false;
      this.generateBoard();
    }
    
    // Always apply pending bonus lives (even on resumed games)
    this.applyPendingBonusLives();

    this.render();
    this.saveState();
  }

  applyPendingBonusLives() {
    const bonus = Storage.getClassicBonusLives();
    if (bonus > 0) {
      this.hintsLeft += bonus;
      this.addsLeft  += bonus;
      Storage.consumeClassicBonusLives();
      setTimeout(() => this.showSpecialMsg(`🎁 +${bonus} BONOS APLICADOS`), 800);
    }
  }

  // Generate initial board: [1..9] repeated and shuffled
  generateBoard() {
    const nums = [];
    // User requested 35 numbers. 
    // We generate 35 numbers, usually random 1-9 is standard for Match-10 games
    for (let i = 0; i < 35; i++) {
        nums.push(Math.floor(Math.random() * 9) + 1);
    }
    // Pad to multiple of COLS
    while (nums.length % COLS !== 0) nums.push(0);
    this.cells = nums.map(v => ({ val: v }));
  }

  loadState(state) {
    this.cells     = state.cells || [];
    this.score     = state.score || 0;
    this.pairs     = state.pairs || 0;
    this.phase     = state.phase || 1;
    this.hintsLeft = state.hintsLeft !== undefined ? state.hintsLeft : 5;
    this.addsLeft  = state.addsLeft !== undefined ? state.addsLeft : 5;
  }

  saveState() {
    (Storage.set || (() => {}))('gameState', {
      cells: this.cells.map(c => ({ val: c.val })),
      score: this.score,
      pairs: this.pairs,
      phase: this.phase,
      hintsLeft: this.hintsLeft,
      addsLeft: this.addsLeft
    });
  }

  // ─── Render ─────────────────────────────────────────────────
  render() {
    this.boardEl.innerHTML = '';
    this.cells.forEach((c, idx) => {
      const el = document.createElement('div');
      el.className = 'mg-cell' + (c.val === 0 ? ' empty' : ' has-number');
      el.dataset.idx = idx;
      if (c.val !== 0) {
        el.textContent  = c.val;
        el.dataset.n    = c.val;
      }
      el.addEventListener('click', () => this.handleClick(idx));
      c.el = el;
      this.boardEl.appendChild(el);
    });
    this.updateInfo();
  }

  updateInfo(skipScoreRoll = false) {
    if (!skipScoreRoll) {
      animateScore('mg-score', +this.scoreEl.textContent || 0, this.score);
    }
    if (this.phaseDisplay) this.phaseDisplay.textContent = `Fase ${this.phase}`;
    if (this.hintsCountEl) this.hintsCountEl.textContent = this.hintsLeft;
    if (this.addsCountEl)  this.addsCountEl.textContent  = this.addsLeft;
    
    const lives = Storage.getClassicBonusLives();
    if (this.livesCountEl) this.livesCountEl.textContent = lives;
    
    // Bottom bar counters: Parejas and Vacías (cleared cells)
    if (this.pairsEl) this.pairsEl.textContent = this.pairs;
    if (this.emptyEl) {
        const clearedCount = this.cells.filter(c => c.val === 0).length;
        this.emptyEl.textContent = clearedCount;
    }
    
    // Disable buttons if no resources left
    if (this.hintBtn) this.hintBtn.style.opacity = this.hintsLeft > 0 ? '1' : '0.3';
    if (this.addBtn)  this.addBtn.style.opacity  = this.addsLeft  > 0 ? '1' : '0.3';
  }

  // ─── Cell Click ─────────────────────────────────────────────
  handleClick(idx) {
    const cell = this.cells[idx];
    if (cell.val === 0) return;

    if (this.selected === null) {
      this.selected = idx;
      cell.el.classList.add('selected');
      playSound('click');
    } else if (this.selected === idx) {
      cell.el.classList.remove('selected');
      this.selected = null;
    } else {
      const idxA = this.selected;
      const idxB = idx;
      const cellA = this.cells[idxA];
      const cellB = this.cells[idxB];

      cellA.el.classList.remove('selected');
      this.selected = null;

      if (this.canMatch(idxA, idxB)) {
        this.doMatch(idxA, idxB);
      } else {
        playSound('error');
        cell.el.classList.add('selected');
        setTimeout(() => { if (cell.el) cell.el.classList.remove('selected'); }, 300);
        this.selected = null;
      }
    }
  }

  // ─── Match Validation ────────────────────────────────────────
  canMatch(a, b) {
    const va = this.cells[a].val;
    const vb = this.cells[b].val;
    if (!va || !vb) return false;
    // Rule: same number or sum is 10
    if (!(va === vb || va + vb === 10)) return false;

    const [lo, hi] = a < b ? [a, b] : [b, a];
    const rlo = Math.floor(lo / COLS), clo = lo % COLS;
    const rhi = Math.floor(hi / COLS), chi = hi % COLS;

    // 1. Check Sequential (Reading order/Line wrap)
    // Are all indices between lo and hi empty?
    let sequentialClear = true;
    for (let i = lo + 1; i < hi; i++) {
      if (this.cells[i] && this.cells[i].val !== 0) {
        sequentialClear = false;
        break;
      }
    }
    if (sequentialClear) return true;

    // 2. Check Vertical (Same column, possibly with empty rows)
    if (clo === chi) {
      let verticalClear = true;
      for (let i = lo + COLS; i < hi; i += COLS) {
        if (this.cells[i] && this.cells[i].val !== 0) {
          verticalClear = false;
          break;
        }
      }
      if (verticalClear) return true;
    }

    // 3. Check Diagonal (Same diagonal line, possibly with empty cells)
    if (Math.abs(rlo - rhi) === Math.abs(clo - chi)) {
      let diagonalClear = true;
      const stepR = rhi > rlo ? 1 : -1;
      const stepC = chi > clo ? 1 : -1;
      let currR = rlo + stepR;
      let currC = clo + stepC;
      while (currR !== rhi) {
        const idx = currR * COLS + currC;
        if (this.cells[idx] && this.cells[idx].val !== 0) {
          diagonalClear = false;
          break;
        }
        currR += stepR;
        currC += stepC;
      }
      if (diagonalClear) return true;
    }

    return false;
  }

  getMatchInfo(a, b) {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const rlo = Math.floor(lo / COLS);
    const rhi = Math.floor(hi / COLS);

    // Is it sequential clear and in different rows?
    let sequentialClear = true;
    for (let i = lo + 1; i < hi; i++) {
        if (this.cells[i] && this.cells[i].val !== 0) {
            sequentialClear = false;
            break;
        }
    }

    // If it spans multiple rows in sequential order, it's a "special wrap"
    if (sequentialClear && rlo !== rhi) return 'special';
    return 'normal';
  }

  // ─── Execute Match ───────────────────────────────────────────
  doMatch(a, b) {
    const cellA = this.cells[a];
    const cellB = this.cells[b];
    
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const rlo = Math.floor(lo / COLS), clo = lo % COLS;
    const rhi = Math.floor(hi / COLS), chi = hi % COLS;
    const isWrap = (hi === lo + 1 && rlo !== rhi);

    // Adjacent = touching cells (8 neighbors) and NOT a line wrap
    const isAdjacent = (Math.abs(rlo-rhi) <= 1 && Math.abs(clo-chi) <= 1 && !isWrap);
    const basePts = isAdjacent ? 1 : 4;
    // Puntos x Fase: Phase 1 (x1), Phase 2 (x2), Phase 3 (x3), etc.
    const pts = basePts * this.phase;

    this.score += pts;
    this.pairs++;

    // Animate matched cells
    cellA.el.classList.add('matched');
    cellB.el.classList.add('matched');

    // Particles/FX
    const rectA = cellA.el.getBoundingClientRect();
    const rectB = cellB.el.getBoundingClientRect();
    const midX  = (rectA.left + rectA.width / 2 + rectB.left + rectB.width / 2) / 2;
    const midY  = (rectA.top  + rectA.height / 2 + rectB.top  + rectB.height / 2) / 2;
    const scoreBefore = this.score;
    this.score += pts;
    this.pairs++;

    const scoreRect = this.scoreEl.getBoundingClientRect();

    spawnGoldenRing(midX, midY);
    spawnParticles(midX, midY, 7);
    spawnScoreParticles(midX, midY, scoreRect.left + scoreRect.width / 2, scoreRect.top + scoreRect.height / 2, 5);
    
    // Pass the rolling action as impact callback
    showScorePopup(midX, midY, '+' + pts, () => {
      animateScore('mg-score', scoreBefore, this.score);
    });

    playSound(basePts === 4 ? 'special' : 'match');
    if (basePts === 4) this.showSpecialMsg('🥳 -- BIEN VISTO -- 🎉');

    // Remove after animation
    setTimeout(() => {
      cellA.val = 0; if (cellA.el) { cellA.el.textContent = ''; cellA.el.className = 'mg-cell empty'; }
      cellB.val = 0; if (cellB.el) { cellB.el.textContent = ''; cellB.el.className = 'mg-cell empty'; }
      this.updateInfo(true); // skip rolling here, handled by popup impact
      this.saveState();
      this.trimEmptyRows();
      this.checkAchievements();
      if (this.isBoardEmpty()) {
        this.score += 150 * this.phase;
        this.advancePhase();
      }
    }, 500);
  }

  advancePhase() {
      // Reward 1 Life every 2 phase completions
      if (this.phase % 2 === 0) {
          Storage.addClassicBonusLives(1);
          this.showSpecialMsg('🎁 ¡HAS GANADO UNA VIDA!');
      }
      
      this.phase++;
      // Reset Hints and Adds on New Phase
      this.hintsLeft = 5;
      this.addsLeft  = 5;
      
      this.generateBoard();
      this.render();
      this.saveState();
  }

  showSpecialMsg(txt) {
    this.msgEl.textContent = txt || '🥳 — ¡BIEN VISTO! — 🎉';
    this.msgEl.classList.add('visible');
    clearTimeout(this._msgTimer);
    this._msgTimer = setTimeout(() => this.msgEl.classList.remove('visible'), 2200);
  }

  // Remove fully empty trailing rows
  trimEmptyRows() {
    const prevRowCount = Math.floor(this.cells.length / COLS);
    const rows = [];
    for (let i = 0; i < this.cells.length; i += COLS) {
      rows.push(this.cells.slice(i, i + COLS));
    }
    // Only keep rows that have at least one numeric value
    const filteredRows = rows.filter(row => row.some(c => c.val !== 0));
    const newRowCount = filteredRows.length;

    if (newRowCount < prevRowCount) {
      const rowsRemoved = prevRowCount - newRowCount;
      this.score += 20 * rowsRemoved * this.phase;
    }

    this.cells = filteredRows.flat();
    this.render();
  }

  isBoardEmpty() {
    return this.cells.every(c => c.val === 0 || !c.val);
  }

  // ─── Hints ──────────────────────────────────────────────────
  showHint() {
    if (this.hintsLeft <= 0) {
        playSound('error');
        return;
    }
    const pair = this.findValidMove();
    if (!pair) {
        this.onAddNumbers();
        return;
    }
    
    this.hintsLeft--;
    this.updateInfo();
    
    const [a, b] = pair;
    this.cells[a].el.classList.add('hint-highlight');
    this.cells[b].el.classList.add('hint-highlight');
    setTimeout(() => {
      if (this.cells[a]?.el) this.cells[a].el.classList.remove('hint-highlight');
      if (this.cells[b]?.el) this.cells[b].el.classList.remove('hint-highlight');
    }, 2000);
  }

  findValidMove() {
    const active = this.cells.map((c, i) => c.val !== 0 ? i : -1).filter(i => i >= 0);
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        if (this.canMatch(active[i], active[j])) return [active[i], active[j]];
      }
    }
    return null;
  }

  hasValidMoves() { return !!this.findValidMove(); }

  // ─── Add Numbers ────────────────────────────────────────────
  onAddNumbers() {
    if (this.addsLeft <= 0) {
        this.onLose();
        return;
    }
    
    const active = this.cells.filter(c => c.val !== 0).map(c => ({ val: c.val }));
    if (!active.length) { 
        this.advancePhase();
        return; 
    }
    
    this.addsLeft--;
    this.updateInfo();
    playSound('click');

    // Find the last non-empty cell to append right after it
    let lastIdx = -1;
    for (let i = this.cells.length - 1; i >= 0; i--) {
      if (this.cells[i].val !== 0 && this.cells[i].val !== undefined) {
        lastIdx = i;
        break;
      }
    }
    // Truncate to the last active cell so we append "a continuación"
    if (lastIdx !== -1 && lastIdx < this.cells.length - 1) {
      this.cells = this.cells.slice(0, lastIdx + 1);
    }

    // Append existing active cells again
    active.forEach(c => this.cells.push({ val: c.val }));
    // Pad to COLS
    while (this.cells.length % COLS !== 0) this.cells.push({ val: 0 });
    this.render();
    this.saveState();
  }

  onLose() {
      playSound('error');
      showGameOver({ 
        score: this.score, 
        game: 'mg', 
        won: false, 
        extra: this.phase,
        onReplay: () => this.start(true),
        onContinue: () => {
          // Grant +1 Add Number and +1 Hint when using a life
          this.addsLeft  += 1;
          this.hintsLeft += 1;
          this.updateInfo();
          playSound('special');
          this.showSpecialMsg('❤️ ¡VIDA USADA! +1 CARGA');
        }
      });
  }

  // ─── Achievements ────────────────────────────────────────────
  checkAchievements() {
    if (this.pairs === 1) checkAndUnlock('first_match');
    if (this.score >= 100) checkAndUnlock('score_100');
    if (this.score >= 500) checkAndUnlock('score_500');
    if (this.score >= 1000) checkAndUnlock('score_1000');
    if (!this.hintUsed && this.isBoardEmpty()) checkAndUnlock('no_hint');
  }

  // ─── Win / Lose ──────────────────────────────────────────────
  onWin() {
    Storage.updateStats('mg', true, this.pairs);
    checkAndUnlock('mg_win');
    if (!this.hintUsed) checkAndUnlock('no_hint');
    showGameOver({
      score: this.score,
      game: 'mg',
      won: true,
      extra: this.phase,
      onReplay: () => this.start(true)
    });
  }

  // ─── Bind ────────────────────────────────────────────────────
  _bind() {
    this.hintBtn.addEventListener('click', () => this.showHint());
    this.addBtn.addEventListener('click', () => this.onAddNumbers());
    this.newBtn.addEventListener('click', () => this.start(true));
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
