'use strict';

const { canPlay, RANK, getTopRun } = require('./gameEngine');

const BOT_NAMES = [
  'CacaBot', 'Robocaca', 'Bot Fecal', 'MáquinaCaca',
  'TermiCaca', 'CacaGPT', 'AlphaCaca', 'Bot Cochino'
];

let botNameIdx = 0;
function nextBotName() {
  return BOT_NAMES[botNameIdx++ % BOT_NAMES.length];
}

/**
 * Decides the bot's next action.
 * Returns one of:
 *  { action: 'play', cardIds: [...], source: 'hand'|'faceUp' }
 *  { action: 'flip', index: number }
 *  { action: 'take' }
 */
function chooseBotPlay(player, discardPile, mustLeOrEq7, jokerPending) {
  // Determine phase
  let source, available;
  if (player.hand.length > 0) {
    source = 'hand';
    available = player.hand;
  } else if (player.faceUp.length > 0) {
    source = 'faceUp';
    available = player.faceUp;
  } else if (player.faceDown.length > 0) {
    return { action: 'flip', index: 0 };
  } else {
    return { action: 'take' };
  }

  // Joker pending: play joker if available, else take
  if (jokerPending) {
    const joker = available.find(c => c.value === 0);
    if (joker) return { action: 'play', cardIds: [joker.id], source };
    return { action: 'take' };
  }

  // Group cards by value
  const groups = {};
  for (const c of available) {
    if (!groups[c.value]) groups[c.value] = [];
    groups[c.value].push(c);
  }

  // Find valid groups
  const validGroups = Object.entries(groups).filter(([val]) => {
    const sample = available.find(c => c.value === parseInt(val));
    return canPlay([sample], discardPile, mustLeOrEq7, false);
  });

  if (validGroups.length === 0) return { action: 'take' };

  // Check for out-of-turn 4-of-a-kind opportunity (handled by server separately)
  // Here we just pick best valid group for our turn

  const pileSize = discardPile.length;
  const topCard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;

  // Score each valid group
  let best = null;
  let bestScore = -Infinity;

  for (const [valStr, cards] of validGroups) {
    const val = parseInt(valStr);
    const rank = RANK[val];
    const count = cards.length;

    // Check if playing these would complete 4-of-a-kind
    const topRun = getTopRun(discardPile, val);
    const willBurn = (topRun + count >= 4) || val === 10;

    let score = 0;

    // Prefer larger groups (play more cards at once)
    score += count * 3;

    // Burns are very valuable when pile is large
    if (willBurn) score += 10 + pileSize;

    // 10 always good (burns)
    if (val === 10) score += 8;

    // 2 is useful but save for emergencies - slight penalty if pile is small
    if (val === 2) score += pileSize > 3 ? 2 : -2;

    // Joker: play when pile is big (>5 cards), otherwise save
    if (val === 0) score += pileSize > 5 ? 15 : -5;

    // 7: only play if opponents likely have high cards (moderate value)
    if (val === 7) score += 2;

    // Jack: useful if direction change helps (moderate)
    if (val === 11) score += 1;

    // When must play ≤7: play highest valid (to not waste too low)
    if (mustLeOrEq7) {
      score += rank * 0.5;
    } else {
      // Normal: prefer lower cards to save high ones
      score -= rank * 0.3;
    }

    if (score > bestScore) {
      bestScore = score;
      best = { cards, val };
    }
  }

  if (!best) return { action: 'take' };

  // Play best group (up to 4, prefer all of same value)
  const toPlay = best.cards;
  return { action: 'play', cardIds: toPlay.map(c => c.id), source };
}

/**
 * Check if bot can make an out-of-turn 4-of-a-kind play.
 * Returns cardIds if possible, null otherwise.
 */
function checkOutOfTurnBurn(player, discardPile) {
  if (discardPile.length === 0) return null;
  const topVal = discardPile[discardPile.length - 1].value;
  const topRun = getTopRun(discardPile, topVal);
  if (topRun === 0) return null;

  // Source: hand first, then faceUp
  const available = [...player.hand, ...player.faceUp];
  const matching = available.filter(c => c.value === topVal);
  const needed = 4 - topRun;

  if (matching.length >= needed) {
    return {
      cardIds: matching.slice(0, needed).map(c => c.id),
      source: player.hand.some(c => c.value === topVal) ? 'hand' : 'faceUp'
    };
  }
  return null;
}

module.exports = { chooseBotPlay, checkOutOfTurnBurn, nextBotName };
