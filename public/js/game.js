// Game client logic
const socket = io();
const playerName = sessionStorage.getItem('playerName');
const roomId = sessionStorage.getItem('roomId');

if (!playerName || !roomId) window.location.href = '/';

// State
let myHand = [];
let myFaceUp = [];
let myFaceDown = [];
let publicState = null;
let myId = null;
let selectedCards = []; // card ids
let selectedSwapHand = null; // index
let selectedSwapFaceUp = null; // index
let swapPending = []; // [{handIdx, faceUpIdx}]
let gameOverData = null;
let isMyTurn = false;

// DOM refs
const gameTable = document.getElementById('game-table');
const swapOverlay = document.getElementById('swap-overlay');
const gameoverOverlay = document.getElementById('gameover-overlay');
const swapHandEl = document.getElementById('swap-hand');
const swapFaceupEl = document.getElementById('swap-faceup');
const swapStatusEl = document.getElementById('swap-status');
const btnConfirmSwap = document.getElementById('btn-confirm-swap');
const btnPlay = document.getElementById('btn-play');
const btnTake = document.getElementById('btn-take');
const myHandEl = document.getElementById('my-hand');
const myFaceUpEl = document.getElementById('my-faceup');
const myFaceDownEl = document.getElementById('my-facedown');
const myNameEl = document.getElementById('my-name');
const myPhaseEl = document.getElementById('my-phase');
const opponentsEl = document.getElementById('opponents-area');
const pileDisplayEl = document.getElementById('pile-display');
const deckCountEl = document.getElementById('deck-count');
const turnIndicatorEl = document.getElementById('turn-indicator');
const gameLogEl = document.getElementById('game-log');

// Card helpers
const SUITS_SYMBOL = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣', joker: '🃏' };
const VALUE_LABEL = { 0: 'Joker', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const RED_SUITS = new Set(['hearts', 'diamonds']);

function cardColorClass(card) {
  if (card.value === 0) return '';
  return RED_SUITS.has(card.suit) ? 'red-card' : 'black-card';
}

function cardSpecialClass(card) {
  const map = { 2: 'special-2', 7: 'special-7', 10: 'special-10', 11: 'special-j', 0: 'special-joker' };
  return map[card.value] || '';
}

function renderCard(card, opts = {}) {
  const el = document.createElement('div');
  el.className = ['card', cardColorClass(card), cardSpecialClass(card), opts.extraClass || ''].filter(Boolean).join(' ');
  el.dataset.id = card.id;
  if (card.value === 0) {
    el.innerHTML = '<span class="card-value">🃏</span>';
  } else {
    el.innerHTML = `<span class="card-value">${VALUE_LABEL[card.value]}</span><span class="card-suit">${SUITS_SYMBOL[card.suit]}</span>`;
  }
  if (opts.onClick) el.addEventListener('click', opts.onClick);
  if (opts.disabled) el.classList.add('disabled');
  return el;
}

function renderBackCard(opts = {}) {
  const el = document.createElement('div');
  el.className = 'card card-back-mini' + (opts.extraClass ? ' ' + opts.extraClass : '');
  el.innerHTML = '🂠';
  if (opts.onClick) el.addEventListener('click', opts.onClick);
  return el;
}

function addLog(msg, type = '') {
  const div = document.createElement('div');
  div.className = 'log-entry' + (type ? ' ' + type : '');
  div.textContent = msg;
  gameLogEl.prepend(div);
  while (gameLogEl.children.length > 15) gameLogEl.lastChild.remove();
}

// ===== RENDER =====

function renderPublicState() {
  if (!publicState) return;

  // Deck
  deckCountEl.textContent = publicState.deckCount;

  // Pile
  pileDisplayEl.innerHTML = '';
  if (publicState.discardPile && publicState.discardPile.length > 0) {
    const top = publicState.discardPile[publicState.discardPile.length - 1];
    const cardEl = renderCard(top, { extraClass: 'disabled' });
    pileDisplayEl.appendChild(cardEl);
    if (publicState.discardPile.length > 1) {
      const countEl = document.createElement('div');
      countEl.className = 'pile-count';
      countEl.textContent = publicState.discardPile.length;
      pileDisplayEl.appendChild(countEl);
    }
  } else {
    pileDisplayEl.innerHTML = '<div class="empty-pile">Pila<br>vacía</div>';
  }

  // Turn indicator
  const cp = publicState.players[publicState.currentPlayerIdx];
  let turnText = cp ? `Turno: ${cp.name}` : '';
  if (publicState.mustLeOrEq7) turnText += ' (≤7)';
  if (publicState.jokerPending) turnText += ' ☠️ JOKER!';
  turnIndicatorEl.textContent = turnText;

  // Opponents
  renderOpponents();

  // My cards
  renderMyCards();

  // Action bar
  updateActionBar();
}

function renderOpponents() {
  opponentsEl.innerHTML = '';
  if (!publicState) return;
  publicState.players.forEach((p, idx) => {
    if (p.id === myId) return;
    const div = document.createElement('div');
    div.className = 'opponent-card' + (idx === publicState.currentPlayerIdx ? ' active-turn' : '') + (p.finished ? ' finished' : '');
    div.innerHTML = `<div class="opponent-name">${p.name}</div>`;

    const row = document.createElement('div');
    row.className = 'opp-cards-row';

    // Face down (back)
    for (let i = 0; i < p.faceDownCount; i++) {
      const mc = document.createElement('div');
      mc.className = 'mini-card back';
      mc.textContent = '';
      row.appendChild(mc);
    }
    // Face up
    (p.faceUp || []).forEach(c => {
      const mc = document.createElement('div');
      mc.className = 'mini-card face-up' + (RED_SUITS.has(c.suit) ? ' red' : '');
      mc.textContent = c.value === 0 ? '🃏' : VALUE_LABEL[c.value];
      row.appendChild(mc);
    });
    // Hand (back)
    for (let i = 0; i < p.handCount; i++) {
      const mc = document.createElement('div');
      mc.className = 'mini-card back';
      row.appendChild(mc);
    }

    div.appendChild(row);
    opponentsEl.appendChild(div);
  });
}

function renderMyCards() {
  // Face down
  myFaceDownEl.innerHTML = '';
  const fdLabel = document.createElement('div');
  fdLabel.className = 'zone-label';
  fdLabel.textContent = 'Boca abajo';
  myFaceDownEl.appendChild(fdLabel);

  const phase = getMyPhase();
  const canFlip = isMyTurn && phase === 'faceDown';

  myFaceDown.forEach((c, idx) => {
    const el = renderBackCard({
      onClick: canFlip ? () => doFlipFaceDown(idx) : undefined,
      extraClass: canFlip ? '' : 'disabled'
    });
    myFaceDownEl.appendChild(el);
  });

  // Face up
  myFaceUpEl.innerHTML = '';
  const fuLabel = document.createElement('div');
  fuLabel.className = 'zone-label';
  fuLabel.textContent = 'Boca arriba';
  myFaceUpEl.appendChild(fuLabel);

  const canPlayFaceUp = isMyTurn && phase === 'faceUp';
  myFaceUp.forEach(c => {
    const el = renderCard(c, {
      onClick: canPlayFaceUp ? () => toggleSelectCard(c.id, 'faceUp') : undefined,
      disabled: !canPlayFaceUp
    });
    if (selectedCards.includes(c.id)) el.classList.add('selected');
    myFaceUpEl.appendChild(el);
  });

  // Hand
  myHandEl.innerHTML = '';
  const hLabel = document.createElement('div');
  hLabel.className = 'zone-label';
  hLabel.textContent = 'Tu mano';
  myHandEl.appendChild(hLabel);

  const canPlayHand = isMyTurn && phase === 'hand';
  myHand.forEach(c => {
    const el = renderCard(c, {
      onClick: canPlayHand ? () => toggleSelectCard(c.id, 'hand') : undefined,
      disabled: !canPlayHand
    });
    if (selectedCards.includes(c.id)) el.classList.add('selected');
    myHandEl.appendChild(el);
  });

  myNameEl.textContent = playerName;
  const phaseLabels = { hand: 'Mano', faceUp: 'Boca arriba', faceDown: 'Boca abajo', finished: '✅ Terminado' };
  myPhaseEl.textContent = phaseLabels[phase] || '';
}

function getMyPhase() {
  if (!publicState) return 'hand';
  if (myHand.length > 0) return 'hand';
  const me = publicState.players.find(p => p.id === myId);
  if (!me) return 'hand';
  if (myFaceUp.length > 0) return 'faceUp';
  if (myFaceDown.length > 0) return 'faceDown';
  return 'finished';
}

function toggleSelectCard(cardId, source) {
  // All selected must be same value
  const allCards = [...myHand, ...myFaceUp];
  const card = allCards.find(c => c.id === cardId);
  if (!card) return;

  const idx = selectedCards.indexOf(cardId);
  if (idx !== -1) {
    selectedCards.splice(idx, 1);
  } else {
    // Must match value of already selected
    if (selectedCards.length > 0) {
      const firstCard = allCards.find(c => c.id === selectedCards[0]);
      if (firstCard && firstCard.value !== card.value) {
        // Different value - clear and select new
        selectedCards = [cardId];
      } else {
        selectedCards.push(cardId);
      }
    } else {
      selectedCards = [cardId];
    }
  }
  renderMyCards();
  updateActionBar();
}

function updateActionBar() {
  const phase = getMyPhase();
  const canAct = isMyTurn && phase !== 'finished';
  btnPlay.classList.toggle('hidden', !canAct || selectedCards.length === 0 || phase === 'faceDown');
  btnTake.classList.toggle('hidden', !canAct || phase === 'faceDown');
}

// ===== SWAP PHASE =====

function renderSwapPhase() {
  swapOverlay.classList.remove('hidden');
  gameTable.classList.add('hidden');
  renderSwapCards();
}

function renderSwapCards() {
  // Face up
  swapFaceupEl.innerHTML = '';
  myFaceUp.forEach((c, idx) => {
    const el = renderCard(c, { onClick: () => selectSwapFaceUp(idx) });
    if (selectedSwapFaceUp === idx) el.classList.add('swap-selected');
    swapFaceupEl.appendChild(el);
  });

  // Hand
  swapHandEl.innerHTML = '';
  myHand.forEach((c, idx) => {
    const el = renderCard(c, { onClick: () => selectSwapHand(idx) });
    if (selectedSwapHand === idx) el.classList.add('swap-selected');
    swapHandEl.appendChild(el);
  });

  swapStatusEl.textContent = swapPending.length > 0
    ? `${swapPending.length} intercambio(s) pendiente(s). Haz clic en una carta de mano, luego boca arriba.`
    : 'Haz clic en una carta de mano, luego en una boca arriba para intercambiar.';
}

function selectSwapHand(idx) {
  selectedSwapHand = selectedSwapHand === idx ? null : idx;
  tryCompleteSwap();
}

function selectSwapFaceUp(idx) {
  selectedSwapFaceUp = selectedSwapFaceUp === idx ? null : idx;
  tryCompleteSwap();
}

function tryCompleteSwap() {
  if (selectedSwapHand !== null && selectedSwapFaceUp !== null) {
    // Do local swap immediately for visual feedback
    const temp = myHand[selectedSwapHand];
    myHand[selectedSwapHand] = myFaceUp[selectedSwapFaceUp];
    myFaceUp[selectedSwapFaceUp] = temp;
    // Send to server
    socket.emit('swap-cards', {
      handIndices: [selectedSwapHand],
      faceUpIndices: [selectedSwapFaceUp]
    });
    selectedSwapHand = null;
    selectedSwapFaceUp = null;
  }
  renderSwapCards();
}

btnConfirmSwap.addEventListener('click', () => {
  Analytics.trackSwapConfirmed(swapPending.length);
  socket.emit('confirm-swap');
  swapOverlay.classList.add('hidden');
  gameTable.classList.remove('hidden');
});

// ===== ACTIONS =====

function doPlayCards() {
  if (selectedCards.length === 0) return;
  const phase = getMyPhase();
  const source = phase === 'faceUp' ? 'faceUp' : 'hand';
  const allCards = [...myHand, ...myFaceUp];
  const first = allCards.find(c => c.id === selectedCards[0]);
  if (first) Analytics.trackCardsPlayed(first.value, selectedCards.length, source);
  socket.emit('play-cards', { cardIds: selectedCards, source });
  selectedCards = [];
}

function doTakePile() {
  const reason = publicState?.jokerPending ? 'joker' : 'no_cards';
  Analytics.trackAteCaca(reason);
  socket.emit('take-pile');
}

function doFlipFaceDown(index) {
  socket.emit('flip-facedown', { index });
  Analytics.trackCardsPlayed(-1, 1, 'faceDown'); // -1 = unknown value (hidden)
}

btnPlay.addEventListener('click', doPlayCards);
btnTake.addEventListener('click', doTakePile);

// ===== REACTION BAR =====

const REACTION_EMOJIS = {
  poop: '💩', buzz: '📳', gas: '💨',
  laugh: '😂', skull: '💀', fire: '🔥',
  kiss: '😘', ok: '👍', no: '👎',
  shock: '😱', clap: '👏'
};

function playFartSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const duration = 0.55;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.28, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 0.4);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(280, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + duration);
    filter.Q.setValueAtTime(4, ctx.currentTime);

    noise.connect(filter);
    filter.connect(gain);
    noise.start();
    setTimeout(() => ctx.close(), (duration + 0.1) * 1000);
  } catch (e) { /* audio not supported */ }
}

function showFloatingReaction(emoji, fromName) {
  const container = document.getElementById('floating-reactions');
  const el = document.createElement('div');
  el.className = 'floating-reaction';
  el.style.left = (10 + Math.random() * 75) + '%';
  el.innerHTML = `<span class="float-emoji">${emoji}</span><span class="float-name">${fromName}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function sendReaction(type) {
  socket.emit('send-reaction', { type });
  // Immediate local feedback
  if (type === 'buzz') {
    if (navigator.vibrate) navigator.vibrate([180, 60, 180]);
  } else if (type === 'gas') {
    playFartSound();
  }
  showFloatingReaction(REACTION_EMOJIS[type] || '💩', 'Tú');
}

// Home button
document.getElementById('btn-home').addEventListener('click', () => {
  if (confirm('¿Seguro que quieres salir? Perderás la partida.')) {
    Analytics.trackLeaveGame(publicState?.status || 'playing');
    socket.emit('leave-game');
    sessionStorage.removeItem('roomId');
    window.location.href = '/';
  }
});

// Toggle reacciones rápidas
document.getElementById('btn-reactions-toggle').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('emote-picker').classList.add('hidden');
  document.getElementById('reaction-picker').classList.toggle('hidden');
});

// Toggle emoticonos
document.getElementById('btn-emotes-toggle').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('reaction-picker').classList.add('hidden');
  document.getElementById('emote-picker').classList.toggle('hidden');
});

// Cualquier botón de reacción en ambos dropdowns
document.getElementById('top-right-controls').addEventListener('click', (e) => {
  e.stopPropagation();
  const btn = e.target.closest('[data-type]');
  if (btn) {
    sendReaction(btn.dataset.type);
    document.getElementById('reaction-picker').classList.add('hidden');
    document.getElementById('emote-picker').classList.add('hidden');
  }
});

// Cerrar dropdowns al tocar fuera
document.addEventListener('click', () => {
  document.getElementById('reaction-picker').classList.add('hidden');
  document.getElementById('emote-picker').classList.add('hidden');
});

// Incoming reactions from other players
socket.on('reaction', ({ from, type }) => {
  const emoji = REACTION_EMOJIS[type] || '💩';
  if (type === 'buzz' && navigator.vibrate) navigator.vibrate([180, 60, 180]);
  if (type === 'gas') playFartSound();
  showFloatingReaction(emoji, from);
  addLog(`${from}: ${emoji}`);
});

// ===== SOCKET EVENTS =====

socket.on('connect', () => {
  myId = socket.id;
  // Load initial deal data from sessionStorage (set by lobby before navigation)
  const storedHand = sessionStorage.getItem('initialHand');
  const storedFaceDown = sessionStorage.getItem('initialFaceDown');
  if (storedHand) {
    myHand = JSON.parse(storedHand);
    sessionStorage.removeItem('initialHand');
  }
  if (storedFaceDown) {
    myFaceDown = JSON.parse(storedFaceDown);
    sessionStorage.removeItem('initialFaceDown');
  }
  socket.emit('join-room', { roomId, name: playerName });
});

socket.on('game-started', ({ hand, faceDown, publicState: ps }) => {
  myHand = hand;
  myFaceDown = faceDown;
  myFaceUp = ps.players.find(p => p.id === socket.id)?.faceUp || [];
  publicState = ps;
  renderSwapPhase();
});

socket.on('rejoined', ({ publicState: ps, hand, faceDown, isHost }) => {
  myId = socket.id;
  publicState = ps;
  // Use server-provided hands (override sessionStorage-loaded ones if server has them)
  if (hand && hand.length >= 0) myHand = hand;
  if (faceDown && faceDown.length >= 0) myFaceDown = faceDown;
  const me = ps.players.find(p => p.id === socket.id);
  myFaceUp = me?.faceUp || [];

  if (ps.status === 'swapping') {
    renderSwapPhase();
  } else if (ps.status === 'playing') {
    gameTable.classList.remove('hidden');
    isMyTurn = ps.players[ps.currentPlayerIdx]?.id === socket.id;
    renderPublicState();
    if (isMyTurn) {
      renderMyCards();
      updateActionBar();
    }
  }
});

socket.on('swap-done', ({ hand, faceUp }) => {
  myHand = hand;
  myFaceUp = faceUp;
  renderSwapCards();
});

socket.on('play-started', ({ currentPlayerIdx, currentPlayerName }) => {
  addLog(`Empieza ${currentPlayerName}`, 'important');
  gameTable.classList.remove('hidden');
  if (publicState?.express) {
    addLog('⚡ Partida Express — mazo reducido', 'important');
  }
});

socket.on('game-state', (ps) => {
  publicState = ps;
  const me = ps.players.find(p => p.id === socket.id || p.id === myId);
  if (me) {
    myFaceUp = me.faceUp || [];
    myFaceDown = new Array(me.faceDownCount).fill(null).map((_, i) => myFaceDown[i] || { id: `fd-${i}`, value: -1 });
  }
  isMyTurn = ps.currentPlayerIdx !== undefined && ps.players[ps.currentPlayerIdx]?.id === (socket.id || myId);
  renderPublicState();
});

socket.on('your-hand', ({ hand }) => {
  myHand = hand;
  renderMyCards();
  updateActionBar();
});

socket.on('your-turn', ({ mustLeOrEq7, jokerPending, topCard }) => {
  isMyTurn = true;
  selectedCards = [];
  if (jokerPending) {
    addLog('☠️ ¡Joker! Juega otro Joker o come caca', 'important');
  } else if (mustLeOrEq7) {
    addLog('El turno anterior puso 7. Debes jugar ≤7', 'important');
  }
  renderMyCards();
  updateActionBar();
  // Visual cue
  gameTable.classList.add('my-turn-flash');
  setTimeout(() => gameTable.classList.remove('my-turn-flash'), 500);
});

socket.on('player-ate', ({ playerId, playerName: name }) => {
  addLog(`💩 ${name} se comió la caca!`, 'poop');
});

socket.on('facedown-flipped', ({ playerId, card, success }) => {
  const p = publicState?.players.find(x => x.id === playerId);
  const name = p?.name || '?';
  if ((playerId === socket.id || playerId === myId)) Analytics.trackFacedownFlip(success);
  if (success) {
    addLog(`${name} volteó ${VALUE_LABEL[card.value]}${card.suit !== 'joker' ? '' : ''}`);
  } else {
    addLog(`💩 ${name} no pudo con la boca abajo!`, 'poop');
    if (playerId === socket.id || playerId === myId) Analytics.trackAteCaca('facedown_fail');
    // Update local facedown if it was me
    if ((playerId === socket.id || playerId === myId) && myFaceDown.length > 0) {
      myFaceDown = myFaceDown.filter((_, i) => i !== 0);
    }
  }
});

socket.on('pile-burned', ({ by }) => {
  const p = publicState?.players.find(x => x.id === by);
  addLog(`🔥 ¡${p?.name || '?'} quemó la caca!`, 'important');
  if (by === socket.id || by === myId) Analytics.trackPileBurned('ten_or_four');
});

socket.on('player-left', ({ name }) => {
  addLog(`🚪 ${name || '?'} abandonó la partida`, 'important');
});

socket.on('player-reconnected', ({ name }) => {
  addLog(`${name} se reconectó`);
});

socket.on('player-disconnected', ({ name }) => {
  addLog(`${name || '?'} se desconectó`);
});

socket.on('game-over', ({ loserId, loserName, rankings }) => {
  gameOverData = { loserId, loserName, rankings };
  const isLoser = loserId === socket.id || loserId === myId;
  const startTime = parseInt(sessionStorage.getItem('gameStartTime') || Date.now());
  const durationSec = Math.round((Date.now() - startTime) / 1000);
  Analytics.trackGameOver(isLoser, rankings.length, durationSec);
  showGameOver(loserId, loserName, rankings);
});

socket.on('error', ({ message }) => {
  addLog(`⚠️ ${message}`);
});

// ===== GAME OVER =====

function showGameOver(loserId, loserName, rankings) {
  const isLoser = loserId === socket.id || loserId === myId;
  gameoverOverlay.classList.remove('hidden');

  document.getElementById('gameover-title').textContent = isLoser ? '😭 ¡Cara de Caca!' : '🏆 ¡Sobreviviste!';
  document.getElementById('gameover-msg').textContent = isLoser
    ? `¡${loserName} se comió TODA la caca!`
    : `${loserName} se quedó con toda la caca.`;

  const rankList = document.getElementById('rankings-list');
  rankList.innerHTML = '';
  const medals = ['🏆', '🥈', '🥉'];
  rankings.forEach((r, i) => {
    const div = document.createElement('div');
    div.className = 'ranking-item';
    const isLastLoser = i === rankings.length - 1;
    div.innerHTML = `
      <span class="ranking-pos">${isLastLoser ? '💩' : (medals[i] || `${i+1}`)}</span>
      <span class="ranking-name${isLastLoser ? ' loser' : ''}">${r.name}</span>
    `;
    rankList.appendChild(div);
  });

  document.getElementById('btn-share').onclick = async () => {
    Analytics.trackShareClicked(isLoser ? 'lost' : 'won');
    const canvas = ShareModule.generateShareImage({
      loserName,
      myName: playerName,
      isLoser,
      rankings,
      roomUrl: window.location.hostname
    });
    try {
      const result = await ShareModule.shareToInstagram(canvas);
      Analytics.trackShareCompleted(result);
      if (result === 'downloaded') {
        addLog('Imagen descargada. Sube la foto a Instagram Stories!');
      }
    } catch (e) {
      addLog('No se pudo compartir: ' + e.message);
    }
  };

  document.getElementById('btn-new-game').onclick = () => {
    sessionStorage.removeItem('roomId');
    window.location.href = '/';
  };
}

// Flash animation for my turn
const style = document.createElement('style');
style.textContent = `.my-turn-flash { animation: turnflash 0.5s; } @keyframes turnflash { 0%{background:rgba(240,192,64,0.15)} 100%{background:transparent} }`;
document.head.appendChild(style);
