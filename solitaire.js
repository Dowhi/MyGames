/**
 * MyGames — Solitaire Game (Klondike)
 * Premium Card Game Implementation
 */
import { 
    Storage, checkAndUnlock, trackGamePlayed,
    playSound, spawnParticles, spawnGoldenRing, showGameOver
} from './script.js';

export class SolitaireGame {
    constructor() {
        this.deck = [];
        this.tableau = [[], [], [], [], [], [], []];
        this.foundations = { h: [], d: [], c: [], s: [] };
        this.stock = [];
        this.waste = [];
        
        this.score = 0;
        this.timer = 0;
        this.timerInterval = null;
        this.history = [];
        
        this.draggedCards = null;
        this.dragData = { startX: 0, startY: 0, originX: 0, originY: 0, source: null };
        
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('solitaire-stock').addEventListener('click', () => this.drawCard());
        document.getElementById('solitaire-new-btn').addEventListener('click', () => this.start());
        document.getElementById('solitaire-undo-btn').addEventListener('click', () => this.undo());
    }

    resetState() {
        this.deck = [];
        this.tableau = [[], [], [], [], [], [], []];
        this.foundations = { h: [], d: [], c: [], s: [] };
        this.stock = [];
        this.waste = [];
        this.score = 0;
        this.timer = 0;
        this.history = [];
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.updateUI();
    }

    start() {
        this.resetState();
        this.createDeck();
        this.shuffle(this.deck);
        this.deal();
        this.startTimer();
        this.updateUI();
        trackGamePlayed('st');
    }

    createDeck() {
        const suits = ['h', 'd', 'c', 's'];
        const Ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        suits.forEach(s => {
            Ranks.forEach((r, i) => {
                this.deck.push({
                    suit: s,
                    rank: r,
                    value: i + 1,
                    color: (s === 'h' || s === 'd') ? 'red' : 'black',
                    isFaceUp: false,
                    id: `${s}_${r}`
                });
            });
        });
    }

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    deal() {
        // Tableau deal
        for (let i = 0; i < 7; i++) {
            for (let j = 0; j <= i; j++) {
                const card = this.deck.pop();
                if (j === i) card.isFaceUp = true;
                this.tableau[i].push(card);
            }
        }
        // Rest goes to stock
        this.stock = [...this.deck];
        this.deck = [];
    }

    startTimer() {
        this.timerInterval = setInterval(() => {
            this.timer++;
            this.updateTimerDisplay();
        }, 1000);
    }

    updateTimerDisplay() {
        const min = Math.floor(this.timer / 60).toString().padStart(2, '0');
        const sec = (this.timer % 60).toString().padStart(2, '0');
        document.getElementById('solitaire-timer').textContent = `${min}:${sec}`;
    }

    drawCard() {
        this.saveState();
        if (this.stock.length === 0) {
            if (this.waste.length === 0) return;
            this.stock = this.waste.reverse().map(c => ({ ...c, isFaceUp: false }));
            this.waste = [];
        } else {
            const card = this.stock.pop();
            card.isFaceUp = true;
            this.waste.push(card);
        }
        this.updateUI();
    }

    saveState() {
        const state = {
            tableau: JSON.parse(JSON.stringify(this.tableau)),
            foundations: JSON.parse(JSON.stringify(this.foundations)),
            stock: JSON.parse(JSON.stringify(this.stock)),
            waste: JSON.parse(JSON.stringify(this.waste)),
            score: this.score
        };
        this.history.push(state);
        if (this.history.length > 20) this.history.shift();
    }

    undo() {
        if (this.history.length === 0) return;
        const state = this.history.pop();
        this.tableau = state.tableau;
        this.foundations = state.foundations;
        this.stock = state.stock;
        this.waste = state.waste;
        this.score = state.score;
        this.updateUI();
    }

    // Interaction handling
    handleCardClick(cardObj, location) {
        if (!cardObj.isFaceUp) {
            // Flip top of tableau if applicable
            if (location.type === 'tableau' && location.cardIndex === this.tableau[location.colIndex].length - 1) {
                this.saveState();
                cardObj.isFaceUp = true;
                this.updateUI();
            }
            return;
        }

        // 1. If we have a selection, try moving it HERE
        if (this.selectedCard) {
            if (this.selectedCard === cardObj) {
                this.selectedCard = null;
            } else if (this.tryMoveToTableau(this.selectedCard, this.selectedLocation, location)) {
                this.selectedCard = null;
                return;
            } else {
                // Change selection
                this.selectedCard = cardObj;
                this.selectedLocation = location;
            }
        } else {
            // 2. Try auto-move to foundation first
            if (this.tryMoveToFoundation(cardObj, location)) return;
            
            // 3. Otherwise select it
            this.selectedCard = cardObj;
            this.selectedLocation = location;
        }
        
        this.updateUI();
    }

    tryMoveToFoundation(card, loc) {
        // Can only move the last card of a stack to foundation
        if (loc.type === 'tableau' && loc.cardIndex !== this.tableau[loc.colIndex].length - 1) return false;
        if (loc.type === 'foundation') return false;

        const target = this.foundations[card.suit];
        const nextValue = target.length === 0 ? 1 : target[target.length - 1].value + 1;
        
        if (card.value === nextValue) {
            this.saveState();
            target.push(card);
            this.removeCardsFromLocation(loc); // Using removeCards (single card here)
            this.score += 10;
            this.checkWin();
            this.updateUI();
            return true;
        }
        return false;
    }

    tryMoveToTableau(card, from, to) {
        if (to.type !== 'tableau') return false;
        
        // Prevent moving to itself
        if (from.type === 'tableau' && from.colIndex === to.colIndex) return false;

        const col = this.tableau[to.colIndex];
        const lastInCol = col[col.length - 1];
        
        let canMove = false;
        if (col.length === 0) {
            if (card.rank === 'K') canMove = true;
        } else {
            if (lastInCol.isFaceUp && lastInCol.color !== card.color && lastInCol.value === card.value + 1) {
                canMove = true;
            }
        }

        if (canMove) {
            this.saveState();
            const cards = this.getCardsFromLocation(from);
            this.tableau[to.colIndex].push(...cards);
            this.removeCardsFromLocation(from);
            this.score = Math.max(0, this.score + (from.type === 'foundation' ? -15 : 5)); // Penalty for moving back
            this.updateUI();
            return true;
        }
        return false;
    }

    getCardsFromLocation(loc) {
        if (loc.type === 'tableau') return this.tableau[loc.colIndex].slice(loc.cardIndex);
        if (loc.type === 'waste') return [this.waste[this.waste.length - 1]];
        if (loc.type === 'foundation') return [this.foundations[loc.suit][this.foundations[loc.suit].length - 1]];
        return [];
    }

    removeCardsFromLocation(loc) {
        if (loc.type === 'tableau') {
            this.tableau[loc.colIndex].splice(loc.cardIndex);
            const col = this.tableau[loc.colIndex];
            if (col.length > 0 && !col[col.length - 1].isFaceUp) col[col.length - 1].isFaceUp = true;
        } else if (loc.type === 'waste') {
            this.waste.pop();
        } else if (loc.type === 'foundation') {
            this.foundations[loc.suit].pop();
        }
    }

    checkWin() {
        if (Object.values(this.foundations).every(f => f.length === 13)) {
            clearInterval(this.timerInterval);
            Storage.updateStats('st', true);
            checkAndUnlock('st_win');
            this.celebrate();
        }
    }

    celebrate() {
        playSound('win');
        
        // Show celebration effect
        const totalCards = 52;
        let animated = 0;
        
        // Take cards from foundations and make them fly
        const suits = ['h','d','c','s'];
        suits.forEach((suit, sIdx) => {
            const stack = this.foundations[suit];
            stack.forEach((card, cIdx) => {
                setTimeout(() => {
                    this.spawnFlyingCard(card, suit, sIdx);
                    if (++animated === totalCards) {
                        setTimeout(() => showGameOver({
                            score: this.score,
                            game: 'st',
                            won: true,
                            onReplay: () => this.start()
                        }), 1500);
                    }
                }, (sIdx * 500) + (cIdx * 50));
            });
        });
        
        // Spawn golden bursts
        for (let i = 0; i < 8; i++) {
            setTimeout(() => {
                const x = Math.random() * window.innerWidth;
                const y = Math.random() * window.innerHeight;
                spawnParticles(x, y, 20);
                spawnGoldenRing(x, y);
            }, i * 400);
        }
    }

    spawnFlyingCard(card, suit, stackIdx) {
        const el = document.createElement('div');
        el.className = 'playing-card flying-card';
        el.setAttribute('data-suit', suit);
        el.innerHTML = `
            <div style="display:flex; justify-content:space-between; width:100%;">
                <span class="card-rank">${card.rank}</span>
                <span>${this.getSuitIcon(suit)}</span>
            </div>
            <div style="flex:1; display:flex; align-items:center; justify-content:center; font-size:1.8rem;">
                ${this.getSuitIcon(suit)}
            </div>
        `;
        
        // Start position (from its foundation)
        const foundationEl = document.getElementById(`foundation-${suit}`);
        const rect = foundationEl.getBoundingClientRect();
        
        el.style.left = rect.left + 'px';
        el.style.top = rect.top + 'px';
        el.style.position = 'fixed';
        el.style.zIndex = '10000';
        document.body.appendChild(el);
        
        // Physics
        let x = rect.left;
        let y = rect.top;
        let vx = (Math.random() - 0.5) * 12 + (stackIdx < 2 ? -4 : 4);
        let vy = -Math.random() * 10 - 5;
        const gravity = 0.6;
        const friction = 0.98;
        const bounce = -0.65;
        let bounces = 0;
        
        const animate = () => {
            vy += gravity;
            vx *= friction;
            x += vx;
            y += vy;
            
            // Floor bounce
            if (y + 64 > window.innerHeight) {
                y = window.innerHeight - 64;
                vy *= bounce;
                bounces++;
                if (Math.abs(vy) > 2) spawnParticles(x + 22, y + 64, 4);
            }
            
            el.style.left = x + 'px';
            el.style.top = y + 'px';
            el.style.transform = `rotate(${x * 0.2}deg)`;
            
            // Remove after 4 bounces or if way off screen
            if (bounces > 4 || x < -200 || x > window.innerWidth + 200 || y > window.innerHeight + 100) {
                el.style.opacity = '0';
                el.style.transition = 'opacity 0.5s';
                setTimeout(() => el.remove(), 500);
            } else {
                requestAnimationFrame(animate);
            }
        };
        requestAnimationFrame(animate);
    }

    updateUI() {
        document.getElementById('solitaire-score').textContent = this.score;
        
        // Stock
        const stockEl = document.getElementById('solitaire-stock');
        stockEl.innerHTML = '';
        if (this.stock.length > 0) {
            const card = document.createElement('div');
            card.className = 'playing-card back';
            stockEl.appendChild(card);
        } else if (this.waste.length > 0) {
            // "Reset" icon or empty indicator
            stockEl.innerHTML = '<div class="card-slot" style="display:flex;align-items:center;justify-content:center;opacity:0.5;font-size:1.5rem">🔄</div>';
        }

        // Waste
        const wasteEl = document.getElementById('solitaire-waste');
        wasteEl.innerHTML = '';
        if (this.waste.length > 0) {
            const cardObj = this.waste[this.waste.length - 1];
            wasteEl.appendChild(this.renderCard(cardObj, { type: 'waste' }));
        }

        // Foundations
        ['h','d','c','s'].forEach(suit => {
            const el = document.getElementById(`foundation-${suit}`);
            el.innerHTML = '';
            el.setAttribute('data-suit', suit);
            if (this.foundations[suit].length > 0) {
                const cardObj = this.foundations[suit][this.foundations[suit].length - 1];
                el.appendChild(this.renderCard(cardObj, { type: 'foundation', suit }));
            }
        });

        // Tableau
        for (let i = 0; i < 7; i++) {
            const colEl = document.getElementById(`tableau-${i}`);
            colEl.innerHTML = '';
            
            this.tableau[i].forEach((cardObj, idx) => {
                const cardEl = this.renderCard(cardObj, { type: 'tableau', colIndex: i, cardIndex: idx });
                cardEl.style.top = `${idx * 16}px`;
                colEl.appendChild(cardEl);
            });

            // Empty slot indicator (K-only)
            if (this.tableau[i].length === 0) {
                const drop = document.createElement('div');
                drop.className = 'card-slot empty-tableau';
                drop.innerHTML = '<span style="opacity:0.2; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:1.5rem; font-weight:800;">K</span>';
                drop.addEventListener('click', () => {
                    if (this.selectedCard) {
                        this.tryMoveToTableau(this.selectedCard, this.selectedLocation, { type: 'tableau', colIndex: i });
                        this.selectedCard = null;
                        this.updateUI();
                    }
                });
                colEl.appendChild(drop);
            }
        }
    }

    renderCard(card, location) {
        const div = document.createElement('div');
        div.className = 'playing-card' + (card.isFaceUp ? '' : ' back');
        
        if (this.selectedCard === card) {
            div.style.border = '2px solid var(--gold)';
            div.style.boxShadow = '0 0 15px var(--gold)';
            div.style.transform = 'translateY(-5px)';
        }
        
        div.setAttribute('data-suit', card.suit);
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; width:100%;">
                <span class="card-rank">${card.rank}</span>
                <span style="font-size:0.7rem">${this.getSuitIcon(card.suit)}</span>
            </div>
            <div style="flex:1; display:flex; align-items:center; justify-content:center; font-size:1.8rem;">
                ${this.getSuitIcon(card.suit)}
            </div>
        `;
        
        div.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleCardClick(card, location);
        });

        // Double click to foundation
        div.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.tryMoveToFoundation(card, location);
        });

        return div;
    }

    getSuitIcon(s) {
        switch(s) {
            case 'h': return '♥';
            case 'd': return '♦';
            case 'c': return '♣';
            case 's': return '♠';
            default: return '';
        }
    }
}
