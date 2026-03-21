// ═══════════════════════════════════════════════════════════════
//  MyGames — script.js  (Main orchestrator)
// ═══════════════════════════════════════════════════════════════

import { MyGamesGame } from './mygames.js';
import { MahjongGame }  from './mahjong.js';
import { OnetGame }     from './onet.js';

// ─── Service Worker Registration ────────────────────────────────
// if ('serviceWorker' in navigator) {
//   window.addEventListener('load', () => {
//     navigator.serviceWorker.register('./service-worker.js').catch(() => {});
//   });
// }

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

  // High Scores: { global: [...{name,score,game,date}], daily: [...] }
  getHighScores()  { return LS.get('highScores', { global: [], daily: [] }); },
  addScore(name, score, game) {
    const hs = this.getHighScores();
    const today = new Date().toDateString();
    const entry = { name, score, game, date: new Date().toISOString() };
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
      onet: { wins: 0, losses: 0, pairs: 0 },
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
  consumeMahjongBonusLives() { LS.set('mj_bonus_lives', 0); }
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
  { id: 'onet_win',     icon: '🦋', name: 'Conector Fauna',     desc: 'Completa Onet' },
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
  onet: {
    title: '🦋 Onet Fauna',
    html: `
      <div class="tutorial-step"><span class="step-icon">🎯</span><div><strong>Objetivo:</strong> Conectar todos los animales idénticos por parejas.</div></div>
      <div class="tutorial-step"><span class="step-icon">🔗</span><div><strong>Línea de Unión:</strong> La conexión solo es válida si se puede trazar con un <strong>máximo de 2 giros</strong> (3 tramos rectos).</div></div>
      <div class="tutorial-step"><span class="step-icon">🌐</span><div><strong>Espacio Exterior:</strong> Puedes usar el borde exterior del tablero para realizar conexiones.</div></div>
      <div class="tutorial-step"><span class="step-icon">⏱</span><div><strong>Resistencia:</strong> Vigila el tiempo y tus vidas. Cada fallo restará una de tus oportunidades.</div></div>
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
export function showScorePopup(x, y, text) {
  const el = document.getElementById('score-popup');
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  el.style.transition = 'none';
  el.style.opacity = '1';
  el.style.transform = 'translate(-50%, 0)';
  setTimeout(() => {
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%, -60px)';
  }, 50);
}

// Animate topbar score "rolling"
let _rollingTimer = null;
export function animateScore(elId, from, to, duration = 600) {
  const el = document.getElementById(elId);
  if (!el) return;
  clearTimeout(_rollingTimer);
  const start = performance.now();
  const tick = (now) => {
    const prog = Math.min(1, (now - start) / duration);
    const val  = Math.round(from + (to - from) * prog);
    el.textContent = val;
    if (prog < 1) requestAnimationFrame(tick);
    else { el.textContent = to; el.classList.add('pop'); setTimeout(() => el.classList.remove('pop'), 200); }
  };
  requestAnimationFrame(tick);
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
  const { score, game, won, onReplay, onHome } = opts;
  const prevBest = Storage.getBestScore(game);
  Storage.addScore(Storage.getPlayerName(), score, game);
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
  nr.addEventListener('click', () => { modal.hidden = true; onReplay?.(); });
  nh.addEventListener('click', () => { modal.hidden = true; goHome(); });

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
//  HOME REFRESH
// ═══════════════════════════════════════════════════════════════
function refreshHome() {
  // Player name
  document.getElementById('player-name-display').textContent = Storage.getPlayerName();

  // Scores
  const today = new Date().toDateString();
  const hs    = Storage.getHighScores();
  const best  = hs.global.length ? hs.global[0].score : 0;
  const daily = hs.global.filter(e => new Date(e.date).toDateString() === today);
  const dailyBest = daily.length ? daily[0].score : 0;
  const stats = Storage.getStats();

  document.getElementById('home-best-score').textContent  = best;
  document.getElementById('home-daily-score').textContent = dailyBest;
  document.getElementById('home-total-games').textContent = stats.totalGames;

  // Per-game best
  document.getElementById('best-mygames').textContent = '⭐ ' + Storage.getBestScore('mg');
  document.getElementById('best-mahjong').textContent = '⭐ ' + Storage.getBestScore('mj');
  document.getElementById('best-onet').textContent    = '⭐ ' + Storage.getBestScore('onet');
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
  let list    = tab === 'global'
    ? hs.global
    : hs.global.filter(e => new Date(e.date).toDateString() === today);
  list = list.slice(0, 10);

  const container = document.getElementById('ranking-list');
  container.innerHTML = '';
  if (!list.length) {
    container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem">Sin puntuaciones aún</p>';
    return;
  }

  const medals = ['🥇','🥈','🥉'];
  const topScore = list[0]?.score || 1;
  list.forEach((e, i) => {
    const entry = document.createElement('div');
    entry.className = 'ranking-entry';
    entry.style.animationDelay = (i * 0.07) + 's';
    const pct = Math.round((e.score / topScore) * 100);
    entry.innerHTML = `
      <div class="rank-pos">${medals[i] || (i+1)}</div>
      <div style="flex:1">
        <div class="rank-name">${e.name} <small style="color:var(--text-muted);font-size:0.7rem">[${e.game?.toUpperCase()}]</small></div>
        <div class="rank-bar-wrap"><div class="rank-bar" style="width:${pct}%"></div></div>
      </div>
      <div class="rank-score">${e.score}</div>
    `;
    container.appendChild(entry);
  });
}

// ═══════════════════════════════════════════════════════════════
//  STATS SCREEN
// ═══════════════════════════════════════════════════════════════
function renderStats() {
  const s = Storage.getStats();
  const body = document.getElementById('stats-body');
  const items = [
    { icon: '🎮', label: 'Total Partidas', val: s.totalGames },
    { icon: '🔢', label: 'MG Victorias',   val: s.mg?.wins || 0 },
    { icon: '🀄', label: 'MJ Victorias',   val: s.mj?.wins || 0 },
    { icon: '🦋', label: 'Onet Victorias', val: s.onet?.wins || 0 },
    { icon: '💔', label: 'Derrotas Totales', val: (s.mg?.losses || 0) + (s.mj?.losses || 0) + (s.onet?.losses || 0) },
    { icon: '🔗', label: 'Parejas Totales', val: (s.mg?.pairs || 0) + (s.mj?.pairs || 0) + (s.onet?.pairs || 0) },
    { icon: '⭐', label: 'Mejor Puntuación', val: Storage.getBestScore('mg') },
    { icon: '🏅', label: 'Logros', val: Object.keys(Storage.getAchievements()).length + '/' + ACHIEVEMENTS.length },
  ];
  body.innerHTML = items.map(it => `
    <div class="stat-card">
      <div class="stat-icon">${it.icon}</div>
      <div class="stat-value">${it.val}</div>
      <div class="stat-label">${it.label}</div>
    </div>
  `).join('');
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
  document.getElementById('card-onet').addEventListener('click', () => {
    navigateTo('onet-screen');
    activeGames.onet = activeGames.onet || new OnetGame();
    activeGames.onet.showDifficultySelect();
  });

  // Back buttons
  document.getElementById('mygames-back').addEventListener('click', goHome);
  document.getElementById('mahjong-back').addEventListener('click', goHome);
  document.getElementById('onet-back').addEventListener('click', goHome);
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
  const showOnetTutorial = () => showHowTo('onet');
  document.getElementById('onet-how-to-btn').addEventListener('click', showOnetTutorial);
  document.getElementById('onet-how-to-btn-game').addEventListener('click', showOnetTutorial);
  document.getElementById('mg-how-to-btn').addEventListener('click', () => showHowTo('mg'));
  document.getElementById('mj-how-to-btn').addEventListener('click', () => showHowTo('mj'));

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
  refreshHome();
  renderAchievements();
  wireNavigation();

  // Ensure home screen is active
  document.getElementById('home-screen').classList.add('active');
}

init();
