'use strict';

// Card ranks: 3=0, 4=1, 5=2, 6=3, 7=4, 8=5, 9=6, 10=7, J=8, Q=9, K=10, A=11
// Special: 2=12 (wild), Joker=13
const RANK = { 3:0, 4:1, 5:2, 6:3, 7:4, 8:5, 9:6, 10:7, 11:8, 12:9, 13:10, 14:11, 2:12, 0:13 };
// value: 2-10 numeric, J=11, Q=12, K=13, A=14, Joker=0
const SUITS = ['spades','hearts','diamonds','clubs'];
const VALUES = [2,3,4,5,6,7,8,9,10,11,12,13,14]; // 11=J, 12=Q, 13=K, 14=A

function createDeck() {
  const cards = [];
  let id = 0;
  for (const suit of SUITS) {
    for (const value of VALUES) {
      cards.push({ id: id++, suit, value, rank: RANK[value] });
    }
  }
  // 2 jokers per deck
  cards.push({ id: id++, suit: 'joker', value: 0, rank: 13 });
  cards.push({ id: id++, suit: 'joker', value: 0, rank: 13 });
  return cards; // 54 cards
}

function createDoubleDeck() {
  const d1 = createDeck();
  const d2 = createDeck().map(c => ({ ...c, id: c.id + 100 }));
  return [...d1, ...d2]; // 108 cards
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dealCards(players) {
  const deck = shuffle(createDoubleDeck());
  let idx = 0;
  for (const p of players) {
    p.faceDown = deck.slice(idx, idx + 3); idx += 3;
    p.faceUp   = deck.slice(idx, idx + 3); idx += 3;
    p.hand     = deck.slice(idx, idx + 3); idx += 3;
  }
  return deck.slice(idx); // remaining deck
}

function getCardLabel(value) {
  if (value === 0) return 'Joker';
  if (value === 11) return 'J';
  if (value === 12) return 'Q';
  if (value === 13) return 'K';
  if (value === 14) return 'A';
  return String(value);
}

// Swap handIndices with faceUpIndices (same length arrays)
function swapCards(player, handIndices, faceUpIndices) {
  if (handIndices.length !== faceUpIndices.length) return false;
  for (let i = 0; i < handIndices.length; i++) {
    const hi = handIndices[i], fi = faceUpIndices[i];
    if (hi >= player.hand.length || fi >= player.faceUp.length) return false;
    [player.hand[hi], player.faceUp[fi]] = [player.faceUp[fi], player.hand[hi]];
  }
  return true;
}

// Find player index who should go first (lowest non-special card, prefer 3)
function findStartingPlayer(players) {
  let bestIdx = 0;
  let bestRank = Infinity;
  players.forEach((p, i) => {
    const allCards = [...p.hand, ...p.faceUp];
    for (const c of allCards) {
      // Only non-special cards start (not 2, not Joker)
      if (c.value !== 2 && c.value !== 0) {
        if (c.rank < bestRank) {
          bestRank = c.rank;
          bestIdx = i;
        }
      }
    }
  });
  return bestIdx;
}

// Get effective top card rank (ignoring 2s stacked on top)
function getEffectiveTop(discardPile) {
  if (discardPile.length === 0) return null;
  for (let i = discardPile.length - 1; i >= 0; i--) {
    if (discardPile[i].value !== 2) return discardPile[i];
  }
  return null; // all 2s
}

// Check if playing these cards is valid
// cards: array of Card (must all have same value)
// discardPile: current pile
// mustLeOrEq7: boolean (active 7 constraint)
// jokerPending: boolean
function canPlay(cards, discardPile, mustLeOrEq7, jokerPending) {
  if (!cards || cards.length === 0) return false;
  // All must be same value
  if (cards.some(c => c.value !== cards[0].value)) return false;

  const val = cards[0].value;
  const rank = RANK[val];

  // Joker: can always be played (stops joker chain or starts one)
  if (val === 0) return true;

  // Under joker pending, only Joker can be played
  if (jokerPending) return false;

  // 2: wild, can always be played (except during joker)
  if (val === 2) return true;

  // 10: can always be played UNLESS 7 constraint active (can't burn on 7)
  if (val === 10) return !mustLeOrEq7;

  const top = getEffectiveTop(discardPile);

  if (mustLeOrEq7) {
    // Must play rank <= 7's rank (rank 4)
    return rank <= RANK[7];
  }

  if (top === null) return true; // empty pile, anything goes

  return rank >= top.rank;
}

// Apply a play, mutates gameState, returns effects object
// cardIds: array of card IDs being played
// source: 'hand' | 'faceUp' | 'faceDown'
// faceDownIndex: index if source is faceDown
function applyPlay(state, playerId, cardIds, source, faceDownIndex) {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return { error: 'Player not found' };

  let cards;
  if (source === 'faceDown') {
    const card = player.faceDown[faceDownIndex];
    if (!card) return { error: 'Invalid face-down index' };
    cards = [card];
    // Remove from faceDown
    player.faceDown.splice(faceDownIndex, 1);
  } else {
    const sourceArr = source === 'hand' ? player.hand : player.faceUp;
    cards = cardIds.map(id => sourceArr.find(c => c.id === id)).filter(Boolean);
    if (cards.length !== cardIds.length) return { error: 'Cards not found' };
    // Remove from source
    for (const c of cards) {
      const idx = sourceArr.indexOf(c);
      if (idx !== -1) sourceArr.splice(idx, 1);
    }
  }

  const val = cards[0].value;
  const effects = {
    burned: false,
    reversed: false,
    jokerChain: false,
    jokerEaten: false,
    extraTurn: false,
    forceEat: false,
    cards,
    playerId
  };

  // Check out-of-turn 4-of-a-kind burn
  const isOutOfTurn = state.players[state.currentPlayerIdx].id !== playerId;
  const allSameOnPile = state.discardPile.length > 0 &&
    state.discardPile[state.discardPile.length - 1].value === val;

  if (isOutOfTurn) {
    // Count how many of this value are on TOP of pile consecutively
    const topRun = getTopRun(state.discardPile, val);
    const total = topRun + cards.length;
    if (total === 4) {
      // Burn!
      state.discardPile.push(...cards);
      burnPile(state);
      effects.burned = true;
      effects.extraTurn = true;
      // Give turn to this player
      state.currentPlayerIdx = state.players.findIndex(p => p.id === playerId);
      // Draw cards for this player
      drawToFill(state, player);
      state.mustLeOrEq7 = false;
      state.jokerPending = false;
      return effects;
    }
    return { error: 'Not your turn' };
  }

  // Joker handling
  if (val === 0) {
    if (state.jokerPending) {
      // Deflect joker to next player
      state.discardPile.push(...cards);
      effects.jokerChain = true;
      // Joker stays pending for next player
      advanceTurn(state);
      return effects;
    } else {
      // New joker: next player must eat or deflect
      state.discardPile.push(...cards);
      state.jokerPending = true;
      effects.forceEat = true;
      advanceTurn(state);
      return effects;
    }
  }

  // Add to pile
  state.discardPile.push(...cards);

  // Special card effects
  if (val === 10) {
    burnPile(state);
    effects.burned = true;
    effects.extraTurn = true;
    state.mustLeOrEq7 = false;
    state.jokerPending = false;
    drawToFill(state, player);
    // Player goes again (currentPlayerIdx stays same)
    return effects;
  }

  if (val === 11) { // Jack
    state.direction *= -1;
    effects.reversed = true;
  }

  if (val === 7) {
    state.mustLeOrEq7 = true;
  } else if (val !== 2) {
    state.mustLeOrEq7 = false;
  }
  // 2 leaves mustLeOrEq7 as-is? No: after a 2, constraint is cleared
  if (val === 2) state.mustLeOrEq7 = false;

  // Check 4-of-a-kind burn (in-turn)
  const topRun = getTopRun(state.discardPile, val);
  if (topRun >= 4) {
    burnPile(state);
    effects.burned = true;
    effects.extraTurn = true;
    state.mustLeOrEq7 = false;
    drawToFill(state, player);
    return effects;
  }

  drawToFill(state, player);
  advanceTurn(state);
  return effects;
}

// Count consecutive cards of value at top of pile
function getTopRun(pile, value) {
  let count = 0;
  for (let i = pile.length - 1; i >= 0; i--) {
    if (pile[i].value === value) count++;
    else break;
  }
  return count;
}

function burnPile(state) {
  state.burnedCount = (state.burnedCount || 0) + state.discardPile.length;
  state.discardPile = [];
}

// Player takes the pile
function takePile(state, playerId) {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return { error: 'Player not found' };
  if (state.players[state.currentPlayerIdx].id !== playerId) {
    return { error: 'Not your turn' };
  }

  if (state.jokerPending) {
    // Eat pile + jokers are burned
    const jokers = state.discardPile.filter(c => c.value === 0);
    const rest = state.discardPile.filter(c => c.value !== 0);
    player.hand.push(...rest);
    state.discardPile = [];
    state.jokerPending = false;
    state.burnedCount = (state.burnedCount || 0) + jokers.length;
    advanceTurn(state);
    return { ate: true, jokerBurned: jokers.length };
  }

  player.hand.push(...state.discardPile);
  state.discardPile = [];
  state.mustLeOrEq7 = false;
  advanceTurn(state);
  return { ate: true };
}

// Draw cards from deck to fill player hand to 3 (while deck has cards)
function drawToFill(state, player) {
  while (player.hand.length < 3 && state.deck.length > 0) {
    player.hand.push(state.deck.pop());
  }
}

function advanceTurn(state) {
  const n = state.players.length;
  let next = (state.currentPlayerIdx + state.direction + n) % n;
  // Skip finished players
  let attempts = 0;
  while (state.players[next].finished && attempts < n) {
    next = (next + state.direction + n) % n;
    attempts++;
  }
  state.currentPlayerIdx = next;
}

// Check if a player has finished (no cards anywhere)
function checkPlayerFinished(player) {
  return player.hand.length === 0 &&
         player.faceUp.length === 0 &&
         player.faceDown.length === 0;
}

// Returns loser (last player with cards), or null if game ongoing
function checkGameOver(state) {
  const active = state.players.filter(p => !p.finished);
  if (active.length === 1) {
    return active[0]; // loser
  }
  return null;
}

// Get current play phase for a player
function getPlayerPhase(player, deckEmpty) {
  if (player.hand.length > 0) return 'hand';
  if (player.faceUp.length > 0) return 'faceUp';
  if (player.faceDown.length > 0) return 'faceDown';
  return 'finished';
}

// Public state (safe to send to all players - hides hand contents)
function getPublicState(state) {
  return {
    status: state.status,
    currentPlayerIdx: state.currentPlayerIdx,
    direction: state.direction,
    deckCount: state.deck.length,
    discardPile: state.discardPile,
    topCard: state.discardPile.length > 0 ? state.discardPile[state.discardPile.length - 1] : null,
    mustLeOrEq7: state.mustLeOrEq7,
    jokerPending: state.jokerPending,
    players: state.players.map(p => ({
      id: p.id,
      name: p.name,
      handCount: p.hand.length,
      faceUp: p.faceUp,
      faceDownCount: p.faceDown.length,
      finished: p.finished,
      connected: p.connected
    })),
    loser: state.loser,
    rankings: state.rankings
  };
}

module.exports = {
  createDoubleDeck, shuffle, dealCards, swapCards,
  findStartingPlayer, canPlay, applyPlay, takePile,
  drawToFill, advanceTurn, checkPlayerFinished, checkGameOver,
  getPlayerPhase, getPublicState, getCardLabel, RANK, burnPile, getTopRun
};
