// ═══════════════════════════════════════════════════════════════
//  Block Deluxe (Tetris Zen) — block.js (Repurposed as onet.js)
//  Zen-style grid filling game with luxury aesthetics.
// ═══════════════════════════════════════════════════════════════

import {
  Storage, playSound, spawnParticles, showGameOver, animateScore, trackGamePlayed
} from './script.js';

const GRID_SIZE = 10;
const SHAPES = [
  { name: '1x1', shape: [[1]] },
  { name: '1x2', shape: [[1, 1]] },
  { name: '1x3', shape: [[1, 1, 1]] },
  { name: '1x4', shape: [[1, 1, 1, 1]] },
  { name: '1x5', shape: [[1, 1, 1, 1, 1]] },
  { name: '2x1', shape: [[1], [1]] },
  { name: '3x1', shape: [[1], [1], [1]] },
  { name: '4x1', shape: [[1], [1], [1], [1]] },
  { name: '5x1', shape: [[1], [1], [1], [1], [1]] },
  { name: '2x2', shape: [[1, 1], [1, 1]] },
  { name: '3x3', shape: [[1, 1, 1], [1, 1, 1], [1, 1, 1]] },
  { name: 'L2',  shape: [[1, 0], [1, 1]] },
  { name: 'L3',  shape: [[1, 0, 0], [1, 0, 0], [1, 1, 1]] },
  { name: 'J3',  shape: [[0, 0, 1], [0, 0, 1], [1, 1, 1]] },
  { name: 'T3',  shape: [[1, 1, 1], [0, 1, 0]] },
  { name: 'Z2',  shape: [[1, 1, 0], [0, 1, 1]] },
];

export class BlockDeluxeGame {
  constructor() {
    this.boardEl = document.getElementById('block-board');
    this.trayEl  = document.getElementById('block-pieces');
    this.scoreEl = document.getElementById('onet-score'); // Reusing ID from onet to avoid index.html mess
    this.bestEl  = document.getElementById('best-onet');

    this.grid = Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(0));
    this.score = 0;
    this.pieces = [null, null, null];
    
    // Drag state
    this.activePiece = null; // { idx, el, shape }
    this.dragX = 0;
    this.dragY = 0;

    this._setupBoard();
    this._bindEvents();
    
    document.getElementById('onet-new-btn').addEventListener('click', () => this.start());
    trackGamePlayed('onet');
  }

  _setupBoard() {
    this.boardEl.innerHTML = '';
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = document.createElement('div');
        cell.className = 'block-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;
        this.boardEl.appendChild(cell);
      }
    }
  }

  _bindEvents() {
    window.addEventListener('pointermove', (e) => this._onMove(e));
    window.addEventListener('pointerup', (e) => this._onUp(e));
  }

  start() {
    this.grid = Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(0));
    this.score = 0;
    this.scoreEl.textContent = '0';
    this._renderGrid();
    this.generatePieces();
    
    // Apply Bonus Lives (actually score bonus in this game)
    const bonus = Storage.getOnetBonusLives();
    if (bonus > 0) {
        this.score += bonus * 100;
        this.scoreEl.textContent = this.score;
        Storage.consumeOnetBonusLives();
    }
  }

  generatePieces() {
    this.pieces = [null, null, null].map(() => {
      const idx = Math.floor(Math.random() * SHAPES.length);
      return SHAPES[idx];
    });
    this._renderTray();
  }

  _renderTray() {
    this.trayEl.innerHTML = '';
    this.pieces.forEach((p, idx) => {
      if (!p) return;
      
      const container = document.createElement('div');
      container.className = 'piece-container';
      container.dataset.idx = idx;
      
      const grid = document.createElement('div');
      grid.className = 'piece-grid';
      grid.style.gridTemplateColumns = `repeat(${p.shape[0].length}, 20px)`;
      
      p.shape.forEach(row => {
        row.forEach(cell => {
          const b = document.createElement('div');
          b.className = cell ? 'piece-block' : 'piece-block-empty';
          if (!cell) b.style.opacity = '0';
          grid.appendChild(b);
        });
      });
      
      container.appendChild(grid);
      container.addEventListener('pointerdown', (e) => this._onDown(e, idx));
      this.trayEl.appendChild(container);
    });
  }

  _renderGrid() {
    const cells = this.boardEl.children;
    for (let i = 0; i < cells.length; i++) {
        const r = Math.floor(i / GRID_SIZE);
        const c = i % GRID_SIZE;
        cells[i].className = 'block-cell' + (this.grid[r][c] ? ' filled' : '');
    }
  }

  _onDown(e, idx) {
    if (this.activePiece) return;
    const piece = this.pieces[idx];
    if (!piece) return;

    const touch = e.touches ? e.touches[0] : e;
    const rect = e.currentTarget.getBoundingClientRect();
    this.activePiece = {
      shape: piece.shape, 
      idx,
      el: e.currentTarget,
      offsetX: touch.clientX - rect.left,
      offsetY: touch.clientY - rect.top
    };

    this.activePiece.el.classList.add('dragging');
    this._updateDragPos(touch.clientX, touch.clientY);
    playSound('click');
  }

  _getCoords(e) {
    if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches && e.changedTouches.length > 0) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  _onMove(e) {
    if (!this.activePiece) return;
    const { x, y } = this._getCoords(e);
    this._updateDragPos(x, y);
    this._showPreview(x, y);
  }

  _updateDragPos(x, y) {
    if (!this.activePiece) return;
    // Set exactly based on touch offset + vertical shift (130px)
    this.activePiece.el.style.left = `${x - this.activePiece.offsetX}px`;
    this.activePiece.el.style.top  = `${y - this.activePiece.offsetY - 130}px`; 
  }

  _showPreview(x, y) {
    // Clear previous preview
    Array.from(this.boardEl.children).forEach(c => c.classList.remove('preview'));

    const gridPos = this._getGridPos(x, y);
    if (!gridPos) return;

    const { r, c } = gridPos;
    if (this.canPlace(this.activePiece.shape, r, c)) {
       this._applyToGridEffect(this.activePiece.shape, r, c, 'preview');
    }
  }

  _onUp(e) {
    if (!this.activePiece) return;
    const { x, y } = this._getCoords(e);
    const gridPos = this._getGridPos(x, y);
    let placed = false;

    if (gridPos) {
       const { r, c } = gridPos;
       if (this.canPlace(this.activePiece.shape, r, c)) {
          this.placePiece(this.activePiece.shape, r, c);
          this.pieces[this.activePiece.idx] = null;
          placed = true;
          playSound('match');
       }
    }

    this.activePiece.el.classList.remove('dragging');
    this.activePiece.el.style.left = '';
    this.activePiece.el.style.top = '';
    
    if (!placed) playSound('error');

    this.activePiece = null;
    this._renderGrid();
    
    if (placed) {
      this.checkLines();
      if (this.pieces.every(p => p === null)) {
        this.generatePieces();
      }
      if (this.isGameOver()) {
        setTimeout(() => this.onLose(), 500);
      }
    }
  }

  _getGridPos(x, y) {
    const boardRect = this.boardEl.getBoundingClientRect();
    const firstCell = this.boardEl.children[0].getBoundingClientRect();
    
    // The piece's top-left origin (left, top) before being scaled/transformed
    const originL = x - this.activePiece.offsetX;
    const originT = y - this.activePiece.offsetY - 130;

    // With 1.4x scale centered (50,50), the visual top-left of the 60x60 shape 
    // inside the 100x100 container is precisely at (originL + 8, originT + 8).
    const shapeL = originL + 8;
    const shapeT = originT + 8;

    // Use board padding (10px from CSS) and gap (4px)
    // Board inner coordinates
    const innerL = boardRect.left + 10;
    const innerT = boardRect.top + 10;

    const cellStepW = firstCell.width + 4; // width + gap
    const cellStepH = firstCell.height + 4; // height + gap
    
    // Calculate the column and row for the top-left block of the piece
    const c = Math.round((shapeL - innerL) / cellStepW);
    const r = Math.round((shapeT - innerT) / cellStepH);

    if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
       return { r, c };
    }
    return null;
  }

  canPlace(shape, startR, startC) {
    const rows = shape.length;
    const cols = shape[0].length;
    
    if (startR < 0 || startR + rows > GRID_SIZE) return false;
    if (startC < 0 || startC + cols > GRID_SIZE) return false;

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (shape[i][j] && this.grid[startR + i][startC + j]) return false;
      }
    }
    return true;
  }

  placePiece(shape, startR, startC) {
    const rows = shape.length;
    const cols = shape[0].length;

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (shape[i][j]) {
          this.grid[startR + i][startC + j] = 1;
          this.score += 10;
        }
      }
    }
    this.scoreEl.textContent = this.score;
  }

  _applyToGridEffect(shape, startR, startC, className) {
    const rows = shape.length;
    const cols = shape[0].length;

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (shape[i][j]) {
          const row = startR + i;
          const col = startC + j;
          if (row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE) {
            const cell = this.boardEl.children[row * GRID_SIZE + col];
            if (cell) cell.classList.add(className);
          }
        }
      }
    }
  }

  checkLines() {
    let linesCleared = 0;
    const rowsToClear = [];
    const colsToClear = [];

    // Check rows
    for (let r = 0; r < GRID_SIZE; r++) {
      if (this.grid[r].every(v => v === 1)) rowsToClear.push(r);
    }
    // Check cols
    for (let c = 0; c < GRID_SIZE; c++) {
      let full = true;
      for (let r = 0; r < GRID_SIZE; r++) {
        if (!this.grid[r][c]) { full = false; break; }
      }
      if (full) colsToClear.push(c);
    }

    if (rowsToClear.length > 0 || colsToClear.length > 0) {
      playSound('special');
      rowsToClear.forEach(r => {
        for (let c = 0; c < GRID_SIZE; c++) {
           this.grid[r][c] = 0;
           this._animateCellClear(r, c);
        }
      });
      colsToClear.forEach(c => {
        for (let r = 0; r < GRID_SIZE; r++) {
           this.grid[r][c] = 0;
           this._animateCellClear(r, c);
        }
      });
      
      const total = rowsToClear.length + colsToClear.length;
      const points = total * 100 * total; // Bonus for multi-line
      this.score += points;
      animateScore('onet-score', this.score - points, this.score);
      
      setTimeout(() => this._renderGrid(), 500);
    }
  }

  _animateCellClear(r, c) {
    const cell = this.boardEl.children[r * GRID_SIZE + c];
    cell.classList.add('clearing');
    const rect = cell.getBoundingClientRect();
    spawnParticles(rect.left + rect.width/2, rect.top + rect.height/2, 5);
    setTimeout(() => cell.classList.remove('clearing'), 500);
  }

  isGameOver() {
    // Check if any available piece fits anywhere
    return !this.pieces.some(p => {
      if (!p) return false;
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (this.canPlace(p.shape, r, c)) return true;
        }
      }
      return false;
    });
  }

  onLose() {
    Storage.updateStats('onet', false, this.score);
    showGameOver({
      score: this.score,
      game: 'onet',
      won: false,
      onReplay: () => this.start()
    });
  }
}
