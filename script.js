// ═══════════════════════════════════════════════════════════════
//  MyGames — script.js  (Main orchestrator)
// ═══════════════════════════════════════════════════════════════

import { MyGamesGame }     from './mygames.js';
import { MahjongGame }      from './mahjong.js';
import { SolitaireGame }    from './solitaire.js';

// ─── Service Worker Registration ────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}

// ═══════════════════════════════════════════════════════════════
//  PERSISTENCE (localStorage)
// ═══════════════════════════════════════════════════════════════
const LS = {
  get(key, def) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }
    catch { return def; }
  },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
};

export const Storage = {
  get: (k, d) => LS.get(k, d),
  set: (k, v) => LS.set(k, v),
  // Player
  getPlayerName()  { return LS.get('playerName', 'Jugador'); },
  setPlayerName(n) { LS.set('playerName', n); },

  // High Scores: { global: [...{name,score,game,date,extra}], daily: [...] }
  getHighScores()  { return LS.get('highScores', { global: [], daily: [] }); },
  addScore(name, score, game, extra = null) {
    const hs = this.getHighScores();
    const today = new Date().toDateString();
    const entry = { name, score, game, date: new Date().toISOString(), extra };
    hs.global.push(entry);
    hs.global.sort((a, b) => b.score - a.score);
    if (hs.global.length > 50) hs.global = hs.global.slice(0, 50);
    hs.daily = hs.global.filter(e => new Date(e.date).toDateString() === today);
    LS.set('highScores', hs);
    return hs;
  },
  getBestScore(game) {
    const hs = this.getHighScores();
    const g = hs.global.filter(e => e.game === game);
    return g.length ? g[0].score : 0;
  },
  getDailyBest(game) {
    const today = new Date().toDateString();
    const hs = this.getHighScores();
    const d = hs.global.filter(e => e.game === game && new Date(e.date).toDateString() === today);
    return d.length ? d[0].score : 0;
  },

  // Stats
  getStats() {
    return LS.get('stats', {
      mg: { wins: 0, losses: 0, pairs: 0 },
      mj: { wins: 0, losses: 0, pairs: 0 },
      st: { wins: 0, losses: 0, pairs: 0 },
      totalGames: 0
    });
  },
  updateStats(game, won, pairs = 0) {
    const s = this.getStats();
    if (!s[game]) s[game] = { wins: 0, losses: 0, pairs: 0 };
    if (won) s[game].wins++; else s[game].losses++;
    s[game].pairs += pairs;
    s.totalGames++;
    LS.set('stats', s);
    return s;
  },

  // Achievements
  getAchievements() {
    return LS.get('achievements', {});
  },
  unlock(id) {
    const a = this.getAchievements();
    if (a[id]) return false; // already unlocked
    a[id] = { date: new Date().toISOString() };
    LS.set('achievements', a);
    return true;
  },
  isUnlocked(id) {
    return !!this.getAchievements()[id];
  },

  // Sound pref
  isSoundOn() { return LS.get('soundOn', true); },
  setSoundOn(v) { LS.set('soundOn', v); },

  // Mahjong Bonus Lives (from MyGames Classic)
  getMahjongBonusLives()    { return LS.get('mj_bonus_lives', 0); },
  addMahjongBonusLives(n)   { LS.set('mj_bonus_lives', this.getMahjongBonusLives() + n); },
  consumeMahjongBonusLives() {
    const curr = this.getMahjongBonusLives();
    if (curr > 0) LS.set('mj_bonus_lives', curr - 1);
    return curr > 0;
  },

  // Classic Bonus Lives
  getClassicBonusLives()    { return LS.get('classic_bonus_lives', 0); },
  addClassicBonusLives(n)   { LS.set('classic_bonus_lives', this.getClassicBonusLives() + n); },
  consumeClassicBonusLives() {
    const curr = this.getClassicBonusLives();
    if (curr > 0) LS.set('classic_bonus_lives', curr - 1);
    return curr > 0;
  },
  useClassicBonusLive() { return this.consumeClassicBonusLives(); },

  // Solitaire Bonus Lives
  getSolitaireBonusLives()      { return LS.get('st_bonus_lives', 0); },
  addSolitaireBonusLives(n)     { LS.set('st_bonus_lives', this.getSolitaireBonusLives() + n); },
  consumeSolitaireBonusLives() {
    const curr = this.getSolitaireBonusLives();
    if (curr > 0) LS.set('st_bonus_lives', curr - 1);
    return curr > 0;
  },

  // Generic helper for all games
  addBonusLives(game, n) {
    if (game === 'mg') this.addClassicBonusLives(n);
    else if (game === 'mj' || game === 'mahjong') this.addMahjongBonusLives(n);
    else if (game === 'st') this.addSolitaireBonusLives(n);
    refreshHome();
  },

  getLives(game) {
    if (game === 'mg') return this.getClassicBonusLives();
    if (game === 'mj' || game === 'mahjong') return this.getMahjongBonusLives();
    if (game === 'st') return this.getSolitaireBonusLives();
    return 0;
  },

  useBonusLive(game) {
    if (game === 'mg') return this.consumeClassicBonusLives();
    if (game === 'mj' || game === 'mahjong') return this.consumeMahjongBonusLives();
    if (game === 'st') return this.consumeSolitaireBonusLives();
    return false;
  }
};

// ═══════════════════════════════════════════════════════════════
//  ACHIEVEMENTS DEFINITIONS
// ═══════════════════════════════════════════════════════════════
export const ACHIEVEMENTS = [
  { id: 'first_match',  icon: '🎯', name: 'Primera Pareja',    desc: 'Haz tu primera pareja' },
  { id: 'score_100',    icon: '💯', name: 'Centenario',         desc: 'Alcanza 100 puntos' },
  { id: 'score_500',    icon: '🌟', name: 'Superestrella',      desc: 'Alcanza 500 puntos' },
  { id: 'score_1000',   icon: '🏆', name: 'Campeón',            desc: 'Alcanza 1000 puntos' },
  { id: 'mg_win',       icon: '🔢', name: 'Tablero Limpio',     desc: 'Gana en MyGames Classic' },
  { id: 'mj_win',       icon: '🀄', name: 'Maestro Mahjong',    desc: 'Completa Mahjong' },
  { id: 'st_win',       icon: '🃏', name: 'Rey del Solitario', desc: 'Gana en el Solitario' },
  { id: 'multi_game',   icon: '🎮', name: 'Multijugador',       desc: 'Juega los 3 juegos' },
  { id: 'speed_match',  icon: '⚡', name: 'Rayo',               desc: 'Haz una pareja en <2s' },
  { id: 'no_hint',      icon: '🧠', name: 'Sin Pistas',         desc: 'Gana sin usar pistas' },
];

export function checkAndUnlock(id) {
  const def = ACHIEVEMENTS.find(a => a.id === id);
  if (!def) return;
  if (Storage.unlock(id)) {
    showAchievementToast(def);
    renderAchievements();
  }
}

// ═══════════════════════════════════════════════════════════════
//  TUTORIALS (How to Play)
// ═══════════════════════════════════════════════════════════════
const TUTORIALS = {
  mg: {
    title: '🔢 MyGames Classic',
    html: `
      <div class="tutorial-step"><span class="step-icon">🎯</span><div><strong>Objetivo:</strong> Vaciar el tablero encontrando parejas de números.</div></div>
      <div class="tutorial-step"><span class="step-icon">✅</span><div><strong>Reglas:</strong> Busca números que <strong>sumen 10</strong> (ej. 3 y 7) o que sean <strong>idénticos</strong> (ej. 5 y 5).</div></div>
      <div class="tutorial-step"><span class="step-icon">↔️</span><div><strong>Conectividad:</strong> Los números deben estar adyacentes (horizontal, vertical o diagonal) o separados solo por celdas vacías.</div></div>
      <div class="tutorial-step"><span class="step-icon">↩️</span><div><strong>Salto de Línea:</strong> Puedes conectar el último número de una fila con el primero de la siguiente.</div></div>
      <div class="tutorial-step"><span class="step-icon">➕</span><div><strong>Bloqueo:</strong> Si no hay más movimientos, pulsa <strong>"+"</strong> para añadir los números restantes al final.</div></div>
    `
  },
  mj: {
    title: '🀄 Mahjong Solitaire',
    html: `
      <div class="tutorial-step"><span class="step-icon">🎯</span><div><strong>Objetivo:</strong> Eliminar todas las fichas de la estructura.</div></div>
      <div class="tutorial-step"><span class="step-icon">🔓</span><div><strong>Fichas Libres:</strong> Solo puedes seleccionar fichas que no tengan nada encima y tengan libre su lado izquierdo o derecho.</div></div>
      <div class="tutorial-step"><span class="step-icon">📥</span><div><strong>La Bandeja:</strong> Tienes 7 espacios. Las fichas se eliminan solo cuando formas una pareja idéntica en la bandeja.</div></div>
      <div class="tutorial-step"><span class="step-icon">⚠️</span><div><strong>Estrategia:</strong> Si la bandeja se llena sin formar parejas, la partida termina. ¡Planifica tus movimientos!</div></div>
    `
  },
  st: {
    title: '🃏 Solitario',
    html: `
      <div class="tutorial-step"><span class="step-icon">🎯</span><div><strong>Objetivo:</strong> Mover todas las cartas a las 4 fundaciones (arriba a la derecha) por palo y en orden (A-K).</div></div>
      <div class="tutorial-step"><span class="step-icon">📋</span><div><strong>El Tablero:</strong> Puedes mover cartas entre columnas alternando colores y en orden descendente (ej: 9 Rojo sobre 10 Negro).</div></div>
      <div class="tutorial-step"><span class="step-icon">📦</span><div><strong>Pilas:</strong> Puedes mover grupos de cartas si están en el orden correcto.</div></div>
      <div class="tutorial-step"><span class="step-icon">🎴</span><div><strong>El Mazo:</strong> Si no hay movimientos, extrae cartas del mazo.</div></div>
      <div class="tutorial-step"><span class="step-icon">👑</span><div><strong>Reyes:</strong> Solo los Reyes pueden ocupar una columna vacía.</div></div>
    `
  }
};

export function showHowTo(gameKey) {
  const t = TUTORIALS[gameKey];
  if (!t) return;
  document.getElementById('howto-title').textContent = t.title;
  document.getElementById('howto-content').innerHTML = t.html;
  document.getElementById('howto-modal').hidden = false;
}

// ═══════════════════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════════════════
let currentScreen = 'home-screen';
let activeGames = {};

export function navigateTo(screenId, opts = {}) {
  // Clear any flying cards from Solitaire celebration
  document.querySelectorAll('.flying-card').forEach(el => el.remove());

  if (screenId === currentScreen) return;
  const prev = document.getElementById(currentScreen);
  const next = document.getElementById(screenId);
  if (!next) return;

  prev.classList.remove('active');
  if (currentScreen !== 'home-screen') prev.classList.add('slide-out-left');

  currentScreen = screenId;

  requestAnimationFrame(() => {
    next.classList.add('active');
    setTimeout(() => prev.classList.remove('slide-out-left'), 400);
  });
}

export function goHome() {
  navigateTo('home-screen');
  refreshHome();
}

// ═══════════════════════════════════════════════════════════════
//  SOUND ENGINE (Web Audio API)
// ═══════════════════════════════════════════════════════════════
let audioCtx = null;

function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

export function playSound(type) {
  if (!Storage.isSoundOn()) return;
  try {
    const ctx = getAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const configs = {
      match:   { freq: 880, type: 'sine',     dur: 0.15, gainPeak: 0.3 },
      special: { freq: 1046, type: 'triangle', dur: 0.3,  gainPeak: 0.4 },
      error:   { freq: 220,  type: 'sawtooth', dur: 0.2,  gainPeak: 0.25 },
      win:     { freq: 1318, type: 'sine',     dur: 0.5,  gainPeak: 0.4 },
      click:   { freq: 660,  type: 'square',   dur: 0.07, gainPeak: 0.15 },
    };
    const c = configs[type] || configs.click;
    osc.frequency.value = c.freq;
    osc.type = c.type;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(c.gainPeak, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + c.dur);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + c.dur);
  } catch {}
}

// ═══════════════════════════════════════════════════════════════
//  PARTICLE SYSTEM
// ═══════════════════════════════════════════════════════════════
const canvas = document.getElementById('particle-canvas');
const ctx2d = canvas.getContext('2d');
let particles = [];

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Luxury: golden dust particles (replaces colorful confetti)
export function spawnParticles(x, y, count = 12, color = '#c9a84c') {
  // Use champagne/gold palette only, ignoring passed color for visual consistency
  const luxuryColors = ['#e8c97a', '#c9a84c', '#f0e4c4', '#d4dce8', '#a8b2c0'];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.2 + Math.random() * 3.2;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.5,
      alpha: 1,
      size: 1.5 + Math.random() * 2.5,
      color: luxuryColors[Math.floor(Math.random() * luxuryColors.length)],
      life: 0,
      maxLife: 50 + Math.random() * 30,
    });
  }
}

// Golden ring expansion — luxury match effect
export function spawnGoldenRing(x, y) {
  particles.push({
    x, y,
    alpha: 0.75,
    radius: 4,
    maxRadius: 52,
    life: 0,
    maxLife: 32,
    mode: 'ring',
    color: 'rgba(232,201,122,',
  });
  // Secondary white flash
  particles.push({
    x, y,
    alpha: 0.40,
    radius: 2,
    maxRadius: 36,
    life: 0,
    maxLife: 22,
    mode: 'ring',
    color: 'rgba(240,228,196,',
  });
}

export function spawnScoreParticles(fromX, fromY, toX, toY, count = 6) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x: fromX + (Math.random() - 0.5) * 16,
      y: fromY + (Math.random() - 0.5) * 16,
      tx: toX, ty: toY,
      alpha: 1, size: 2.5,
      color: '#e8c97a',  // champagne gold
      life: 0, maxLife: 38,
      mode: 'fly',
    });
  }
}

function animateParticles() {
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  particles = particles.filter(p => p.life < p.maxLife);
  for (const p of particles) {
    p.life++;
    const prog = p.life / p.maxLife;
    ctx2d.save();

    if (p.mode === 'ring') {
      // Expanding golden ring effect
      const r = p.radius + (p.maxRadius - p.radius) * prog;
      const a = p.alpha * (1 - prog);
      ctx2d.globalAlpha = a;
      ctx2d.strokeStyle = p.color + a + ')';
      ctx2d.lineWidth = 2 * (1 - prog * 0.7);
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx2d.stroke();
    } else if (p.mode === 'fly') {
      p.x += (p.tx - p.x) * 0.12;
      p.y += (p.ty - p.y) * 0.12;
      p.alpha = 1 - prog;
      ctx2d.globalAlpha = p.alpha;
      ctx2d.fillStyle = p.color;
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, p.size * (1 - prog * 0.4), 0, Math.PI * 2);
      ctx2d.fill();
    } else {
      // Gold dust — soft gravity
      p.vy += 0.08;
      p.vx *= 0.98;
      p.x  += p.vx;
      p.y  += p.vy;
      p.alpha = prog < 0.7 ? 1 : 1 - (prog - 0.7) / 0.3;
      ctx2d.globalAlpha = p.alpha * 0.80;
      ctx2d.fillStyle = p.color;
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, p.size * (1 - prog * 0.3), 0, Math.PI * 2);
      ctx2d.fill();
    }
    ctx2d.restore();
  }
  requestAnimationFrame(animateParticles);
}
animateParticles();

// ═══════════════════════════════════════════════════════════════
//  SCORE POPUP
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
//  HIGH-END SCORE POPUP (Dynamic label with fly-to-score trajectory)
// ═══════════════════════════════════════════════════════════════
export function showScorePopup(x, y, text, onImpact) {
  const el = document.createElement('div');
  el.className = 'floating-score-label';
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  el.style.position = 'fixed';
  el.style.pointerEvents = 'none';
  el.style.zIndex = '9999';
  el.style.transform = 'translate(-50%, -50%) scale(0)';
  el.style.opacity = '0';
  document.body.appendChild(el);

  const scoreBoard = document.getElementById('mg-score')?.getBoundingClientRect() 
                   || document.getElementById('mahjong-score')?.getBoundingClientRect()
                   || { left: window.innerWidth / 2, top: 40, width: 0, height: 0 };
  
  const targetX = scoreBoard.left + scoreBoard.width / 2;
  const targetY = scoreBoard.top + scoreBoard.height / 2;

  // Phase 1: Appearance & Pause (Ease Out / 0.2s)
  // We use Web Animations API for precise control
  const appear = el.animate([
    { transform: 'translate(-50%, -50%) scale(0)', opacity: 0 },
    { transform: 'translate(-50%, -50%) scale(1.3)', opacity: 1, offset: 0.7 },
    { transform: 'translate(-50%, -50%) scale(1.0)', opacity: 1 }
  ], { duration: 250, easing: 'ease-out', fill: 'forwards' });

  appear.onfinish = () => {
    // Phase 2: Trajectory to goal (Ease In / 0.7s)
    setTimeout(() => {
      const fly = el.animate([
        { left: x + 'px', top: y + 'px' },
        { left: targetX + 'px', top: targetY + 'px' }
      ], { duration: 700, easing: 'ease-in', fill: 'forwards' });

      fly.onfinish = () => {
        el.remove();
        
        // Impact Effect on Score Board
        const targetEl = document.getElementById('mg-score') || document.getElementById('mahjong-score');
        if (targetEl) {
          targetEl.animate([
            { transform: 'scale(1)' },
            { transform: 'scale(1.25)' },
            { transform: 'scale(1)' }
          ], { duration: 200, easing: 'ease-out' });
        }

        if (onImpact) onImpact();
      };
    }, 100); // Small pause at the beginning
  };
}

// Animate topbar score "rolling" with Ease In
let _rollingAnims = new Map();
export function animateScore(elId, from, to, duration = 1000) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (from === to) { el.textContent = to; return; }

  // Cancel any existing animation for this element
  if (_rollingAnims.has(elId)) cancelAnimationFrame(_rollingAnims.get(elId));

  const start = performance.now();
  const tick = (now) => {
    const timeProg = Math.min(1, (now - start) / duration);
    // Ease In Cubic: start very slow, accelerate more dramatically
    const valueProg = timeProg * timeProg * timeProg;
    const val  = Math.round(from + (to - from) * valueProg);
    el.textContent = val;

    if (timeProg < 1) {
      _rollingAnims.set(elId, requestAnimationFrame(tick));
    } else {
      el.textContent = to;
      _rollingAnims.delete(elId);
      el.classList.add('pop');
      setTimeout(() => el.classList.remove('pop'), 200);
    }
  };
  _rollingAnims.set(elId, requestAnimationFrame(tick));
}

// ═══════════════════════════════════════════════════════════════
//  ACHIEVEMENT TOAST
// ═══════════════════════════════════════════════════════════════
function showAchievementToast(def) {
  const toast = document.getElementById('achievement-toast');
  document.getElementById('toast-icon').textContent = def.icon;
  document.getElementById('toast-name').textContent  = def.name;
  toast.hidden = false;
  setTimeout(() => { toast.hidden = true; }, 3500);
}

// ═══════════════════════════════════════════════════════════════
//  GAME OVER MODAL
// ═══════════════════════════════════════════════════════════════
export function showGameOver(opts) {
  const { score, game, won, onReplay, onHome, onContinue, extra } = opts;
  const prevBest = Storage.getBestScore(game);
  Storage.addScore(Storage.getPlayerName(), score, game, extra);
  const newBest = Storage.getBestScore(game);

  document.getElementById('gameover-emoji').textContent    = won ? '🎉' : '😔';
  document.getElementById('gameover-title').textContent    = won ? '¡Has Ganado!' : 'Fin de partida';
  document.getElementById('gameover-score-val').textContent = score;
  const bestWrap = document.getElementById('gameover-best-wrap');
  if (score > prevBest) {
    document.getElementById('gameover-best-val').textContent = newBest;
    bestWrap.style.display = '';
  } else {
    bestWrap.style.display = 'none';
  }
  const modal = document.getElementById('gameover-modal');
  modal.hidden = false;

  const replayBtn = document.getElementById('gameover-replay');
  const homeBtn   = document.getElementById('gameover-home');
  const nr = replayBtn.cloneNode(true);
  const nh = homeBtn.cloneNode(true);
  replayBtn.replaceWith(nr);
  homeBtn.replaceWith(nh);

  // CONTINUE WITH LIFE
  const continueBtn = document.getElementById('gameover-continue');
  if (continueBtn) {
    const lives = Storage.getLives(game);
    if (!won && lives > 0 && onContinue) {
      continueBtn.style.display = 'block';
      continueBtn.innerHTML = `🌟 Usar Vida (${lives})`;
      
      const nc = continueBtn.cloneNode(true);
      continueBtn.replaceWith(nc);
      nc.onclick = () => {
        if (Storage.useBonusLive(game)) {
          modal.hidden = true;
          onContinue();
          playSound('special');
        }
      };
    } else {
      continueBtn.style.display = 'none';
    }
  }

  nr.onclick = () => { modal.hidden = true; onReplay?.(); };
  nh.onclick = () => { modal.hidden = true; goHome(); };

  if (won) {
    playSound('win');
    // Luxury: golden dust shower from center
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    spawnParticles(cx, cy, 22);
    spawnGoldenRing(cx, cy);
    setTimeout(() => spawnGoldenRing(cx, cy), 120);
    setTimeout(() => spawnParticles(cx - 60, cy - 40, 10), 180);
    setTimeout(() => spawnParticles(cx + 60, cy - 40, 10), 260);
  }
}

// ═══════════════════════════════════════════════════════════════
//  LIFE PICKER MODAL
// ═══════════════════════════════════════════════════════════════
export function showLifePicker(amount, callback) {
  const modal = document.getElementById('life-picker-modal');
  if (!modal) return;
  modal.hidden = false;

  const buttons = modal.querySelectorAll('.life-option-btn');
  const handler = (e) => {
    const game = e.currentTarget.dataset.game;
    modal.hidden = true;
    playSound('special');
    Storage.addBonusLives(game, amount);
    // Cleanup listeners
    buttons.forEach(b => {
      const nb = b.cloneNode(true);
      b.replaceWith(nb);
    });
    if (callback) callback(game);
  };

  buttons.forEach(b => {
    b.addEventListener('click', handler);
  });
}

// ═══════════════════════════════════════════════════════════════
//  HOME REFRESH
// ═══════════════════════════════════════════════════════════════
function refreshHome() {
  // Player name
  const pnd = document.getElementById('player-name-display');
  if (pnd) pnd.textContent = Storage.getPlayerName();

  // Scores
  const today = new Date().toDateString();
  const hs    = Storage.getHighScores();
  const best  = hs.global.length ? hs.global[0].score : 0;
  const daily = hs.global.filter(e => new Date(e.date).toDateString() === today);
  const dailyBest = daily.length ? daily[0].score : 0;
  const stats = Storage.getStats();

  const hb = document.getElementById('home-best-score'); if(hb) hb.textContent  = best;
  const hd = document.getElementById('home-daily-score'); if(hd) hd.textContent = dailyBest;
  const ht = document.getElementById('home-total-games'); if(ht) ht.textContent = stats.totalGames;

  const bmg = document.getElementById('best-mygames'); if(bmg) bmg.textContent = '⭐ ' + Storage.getBestScore('mg');
  const bmj = document.getElementById('best-mahjong'); if(bmj) bmj.textContent = '⭐ ' + Storage.getBestScore('mj');
  const bst = document.getElementById('best-solitaire'); if(bst) bst.textContent = '⭐ ' + Storage.getBestScore('st');
  const chainBest = document.getElementById('best-chain');
  if (chainBest) chainBest.textContent = '⭐ ' + Storage.getBestScore('chain');
}

// ═══════════════════════════════════════════════════════════════
//  ACHIEVEMENTS RENDER
// ═══════════════════════════════════════════════════════════════
function renderAchievements() {
  const row = document.getElementById('achievements-row');
  row.innerHTML = '';
  for (const a of ACHIEVEMENTS) {
    const chip = document.createElement('div');
    chip.className = 'achievement-chip' + (Storage.isUnlocked(a.id) ? ' unlocked' : '');
    chip.setAttribute('title', a.desc);
    chip.innerHTML = `<span>${a.icon}</span><span>${a.name}</span>`;
    row.appendChild(chip);
  }
}

// ═══════════════════════════════════════════════════════════════
//  RANKING SCREEN
// ═══════════════════════════════════════════════════════════════
function renderRanking(tab = 'global') {
  const hs    = Storage.getHighScores();
  const today = new Date().toDateString();
  let allList = tab === 'global'
    ? hs.global
    : hs.global.filter(e => new Date(e.date).toDateString() === today);
  
  // Sort by score desc
  allList.sort((a,b) => b.score - a.score);
  
  const podiumList = allList.slice(0, 3);
  const scrollList = allList.slice(3, 15);

  const podiumContainer = document.getElementById('ranking-podium');
  const listContainer   = document.getElementById('ranking-list');
  
  podiumContainer.innerHTML = '';
  listContainer.innerHTML   = '';

  if (!allList.length) {
    listContainer.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem">Sin puntuaciones aún</p>';
    podiumContainer.style.display = 'none';
    return;
  }
  podiumContainer.style.display = 'flex';

  const gameIcons = { 'mg': '🔢', 'mj': '🀄', 'st': '🃏' };

  // Render Podium (Order: 2, 1, 3 for visual balance)
  const renderPodiumSpot = (entry, rank) => {
    if (!entry) return `<div class="podium-spot rank-${rank}" style="visibility:hidden"></div>`;
    
    const icons = { 1: '👑', 2: '🥈', 3: '🥉' };
    const avatars = ['👤', '👤', '👤'];
    const gameIcon = gameIcons[entry.game] || '🎮';
    const dateStr = entry.date ? new Date(entry.date).toLocaleDateString('es-ES', { day:'2-digit', month:'short' }) : '';
    
    let extraLabel = '';
    if (entry.extra) {
      const type = entry.game === 'mg' ? 'Fase' : (entry.game === 'mj' ? 'Nivel' : '');
      if (type) extraLabel = `<div style="font-size:0.6rem;opacity:0.8">${type} ${entry.extra}</div>`;
    }

    return `
      <div class="podium-spot rank-${rank}">
        <div class="crown-icon">${icons[rank]}</div>
        ${rank === 1 ? '<div class="star-decoration" style="top:0;left:-20px">✨</div><div class="star-decoration" style="top:10px;right:-15px">✨</div>' : ''}
        <div class="podium-avatar">
          ${avatars[rank-1]}
          <span style="position:absolute;bottom:0;right:0;font-size:0.8rem;background:var(--bg-main);border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center">${gameIcon}</span>
        </div>
        <div class="podium-base">
          <div class="podium-score">${entry.score}</div>
          ${extraLabel}
        </div>
        <div class="podium-name">${entry.name}</div>
        <div style="font-size:0.6rem;opacity:0.5;margin-top:2px">${dateStr}</div>
      </div>
    `;
  };

  podiumContainer.innerHTML = `
    ${renderPodiumSpot(podiumList[1], 2)}
    ${renderPodiumSpot(podiumList[0], 1)}
    ${renderPodiumSpot(podiumList[2], 3)}
  `;

  // Render Rest of the List
  scrollList.forEach((e, i) => {
    const realRank = i + 4;
    const entry = document.createElement('div');
    entry.className = 'ranking-entry';
    entry.style.animationDelay = (i * 0.05) + 's';
    
    const icon = gameIcons[e.game] || '🎮';
    const dateStr = e.date ? new Date(e.date).toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit' }) : '';
    
    let extraInfo = '';
    if (e.extra) {
      const type = e.game === 'mg' ? 'Fase' : (e.game === 'mj' ? 'Nivel' : '');
      if (type) extraInfo = `<span style="font-size:0.7rem;opacity:0.7;margin-left:5px">[${type} ${e.extra}]</span>`;
    }

    entry.innerHTML = `
      <div class="rank-pos">${realRank}</div>
      <div class="rank-name">
        <div>${e.name} <span style="opacity:0.6;font-size:0.8rem">${icon}</span> ${extraInfo}</div>
        <div style="font-size:0.65rem;opacity:0.4">${dateStr}</div>
      </div>
      <div class="rank-score">${e.score}</div>
    `;
    listContainer.appendChild(entry);
  });
}

// ═══════════════════════════════════════════════════════════════
//  STATS SCREEN
// ═══════════════════════════════════════════════════════════════
function renderStats() {
  const s = Storage.getStats();
  const body = document.getElementById('stats-body');
  
  const totalWins = (s.mg?.wins || 0) + (s.mj?.wins || 0) + (s.st?.wins || 0);
  const totalLosses = (s.mg?.losses || 0) + (s.mj?.losses || 0) + (s.st?.losses || 0);
  const totalGames = s.totalGames || 0;

  const formatTime = (ms) => {
    if (!ms || ms === Infinity) return '--:--';
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  };

  const getGameHTML = (id, name, icon, stats) => {
    const wins = stats?.wins || 0;
    const losses = stats?.losses || 0;
    const games = (stats?.totalGames) || (wins + losses);
    const rate = games > 0 ? Math.round((wins / games) * 100) : 0;
    const bestScore = Storage.getBestScore(id);
    const bestTime = stats?.bestTime || null;

    return `
      <div class="game-stats-section">
        <div class="game-stats-header">
          <span>${icon} ${name}</span>
        </div>
        <div class="game-stats-grid">
          <div class="sub-stat"><span class="s-label">Vic.</span><span class="s-val">${wins}</span></div>
          <div class="sub-stat"><span class="s-label">Derr.</span><span class="s-val">${losses}</span></div>
          <div class="sub-stat"><span class="s-label">% Vic.</span><span class="s-val">${rate}%</span></div>
          <div class="sub-stat"><span class="s-label">Part.</span><span class="s-val">${games}</span></div>
          <div class="sub-stat"><span class="s-label">Récord</span><span class="s-val">${bestScore}</span></div>
          <div class="sub-stat"><span class="s-label">Tiempo</span><span class="s-val">${formatTime(bestTime)}</span></div>
        </div>
      </div>
    `;
  };

  body.innerHTML = `
    <!-- Global -->
    <div class="stats-global-summary">
      <div class="mini-stat-card"><span class="m-val">${totalGames}</span><span class="m-label">Partidas</span></div>
      <div class="mini-stat-card"><span class="m-val">${totalWins}</span><span class="m-label">Victorias</span></div>
      <div class="mini-stat-card"><span class="m-val">${totalLosses}</span><span class="m-label">Derrotas</span></div>
    </div>

    ${getGameHTML('mg', 'Clásico', '🔢', s.mg)}
    ${getGameHTML('mj', 'Mahjong', '🀄', s.mj)}
    ${getGameHTML('st', 'Solitario', '🃏', s.st)}
  `;
}

// ═══════════════════════════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════════════════════════
function openSettings() {
  const modal = document.getElementById('settings-modal');
  document.getElementById('input-player-name').value = Storage.getPlayerName();
  const toggle = document.getElementById('toggle-sound');
  toggle.setAttribute('aria-checked', String(Storage.isSoundOn()));
  toggle.textContent = Storage.isSoundOn() ? 'ON' : 'OFF';
  modal.hidden = false;
}

// ═══════════════════════════════════════════════════════════════
//  EVENT WIRING
// ═══════════════════════════════════════════════════════════════
function wireNavigation() {
  // Home → Game Cards
  document.getElementById('card-mygames').addEventListener('click', () => {
    navigateTo('mygames-screen');
    activeGames.mg = activeGames.mg || new MyGamesGame();
    activeGames.mg.start();
    checkAndUnlock('multi_game_mg');
  });
  document.getElementById('card-mahjong').addEventListener('click', () => {
    navigateTo('mahjong-screen');
    activeGames.mj = activeGames.mj || new MahjongGame();
    activeGames.mj.start();
  });

  document.getElementById('card-solitaire').addEventListener('click', () => {
    navigateTo('solitaire-game-screen');
    activeGames.st = activeGames.st || new SolitaireGame();
    activeGames.st.start();
  });

  // Back buttons
  document.getElementById('mygames-back').addEventListener('click', goHome);
  document.getElementById('mahjong-back').addEventListener('click', goHome);
  document.getElementById('solitaire-back').addEventListener('click', goHome);
  document.getElementById('ranking-back').addEventListener('click', goHome);
  document.getElementById('stats-back').addEventListener('click', goHome);

  // Ranking
  document.getElementById('btn-ranking').addEventListener('click', () => {
    navigateTo('ranking-screen');
    renderRanking('global');
  });
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderRanking(btn.dataset.tab);
    });
  });

  // Stats
  document.getElementById('btn-stats').addEventListener('click', () => {
    navigateTo('stats-screen');
    renderStats();
  });

  // Settings
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('close-settings-btn').addEventListener('click', () => {
    document.getElementById('settings-modal').hidden = true;
  });
  document.getElementById('save-settings-btn').addEventListener('click', () => {
    const name = document.getElementById('input-player-name').value.trim() || 'Jugador';
    Storage.setPlayerName(name);
    document.getElementById('settings-modal').hidden = true;
    refreshHome();
  });
  document.getElementById('toggle-sound').addEventListener('click', (e) => {
    const curr = e.target.getAttribute('aria-checked') === 'true';
    Storage.setSoundOn(!curr);
    e.target.setAttribute('aria-checked', String(!curr));
    e.target.textContent = !curr ? 'ON' : 'OFF';
  });

  // How to play buttons
  
  const solBtnMg = document.getElementById('solitaire-how-to-btn');
  if (solBtnMg) solBtnMg.addEventListener('click', () => showHowTo('st'));

  const mgBtn = document.getElementById('mg-how-to-btn');
  if (mgBtn) mgBtn.addEventListener('click', () => showHowTo('mg'));
  
  const mjBtn = document.getElementById('mj-how-to-btn');
  if (mjBtn) mjBtn.addEventListener('click', () => showHowTo('mj'));

  const chainBtnHT = document.getElementById('chain-how-to-btn');
  if (chainBtnHT) chainBtnHT.addEventListener('click', () => showHowTo('chain'));

  document.getElementById('close-howto-btn').addEventListener('click', () => {
    document.getElementById('howto-modal').hidden = true;
  });
  document.getElementById('howto-modal').addEventListener('click', (e) => {
    if (e.target.id === 'howto-modal') document.getElementById('howto-modal').hidden = true;
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.hidden = true; });
  });
}

// ═══════════════════════════════════════════════════════════════
//  MULTI-GAME ACHIEVEMENT TRACKER
// ═══════════════════════════════════════════════════════════════
const _playedGames = new Set();
export function trackGamePlayed(game) {
  _playedGames.add(game);
  if (_playedGames.size >= 3) checkAndUnlock('multi_game');
}

// ═══════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════
function init() {
  console.log('--- MYGAMES INIT v1.7.0 ---');
  refreshHome();
  renderAchievements();
  wireNavigation();

  // Ensure home screen is active
  document.getElementById('home-screen').classList.add('active');
}

init();
