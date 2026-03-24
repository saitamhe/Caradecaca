// Google Analytics 4 - Custom event tracking for Cara de Caca
// All events flow to G-P12JZY6FH1

function gta(eventName, params = {}) {
  if (typeof gtag === 'undefined') return;
  gtag('event', eventName, params);
}

// ─── Acquisition ──────────────────────────────────────────────────────────

// Track where the player came from (shared link vs direct)
(function trackSource() {
  const params = new URLSearchParams(window.location.search);
  const source = params.get('room') ? 'shared_link' : 'direct';
  gta('player_source', { source });
})();

// ─── Lobby events ─────────────────────────────────────────────────────────

function trackRoomCreated() {
  gta('room_created');
}

function trackRoomJoined() {
  gta('room_joined', { source: new URLSearchParams(location.search).get('room') ? 'link' : 'code' });
}

function trackBotAdded(totalBots) {
  gta('bot_added', { total_bots: totalBots });
}

function trackGameStarted(playerCount, botCount) {
  gta('game_started', {
    player_count: playerCount,
    bot_count: botCount,
    human_count: playerCount - botCount
  });
}

function trackLinkCopied() {
  gta('invite_link_copied');
}

// ─── Game events ──────────────────────────────────────────────────────────

function trackSwapConfirmed(swapsCount) {
  gta('swap_confirmed', { swaps_made: swapsCount });
}

function trackCardsPlayed(cardValue, cardCount, source) {
  const labelMap = { 0: 'joker', 2: 'dos', 7: 'siete', 10: 'diez', 11: 'jota', 14: 'as' };
  gta('cards_played', {
    card_value: cardValue,
    card_label: labelMap[cardValue] || String(cardValue),
    card_count: cardCount,
    from_source: source // hand | faceUp | faceDown
  });
}

function trackAteCaca(reason) {
  // reason: 'no_cards' | 'joker' | 'facedown_fail'
  gta('ate_caca', { reason });
}

function trackPileBurned(method) {
  // method: 'ten' | 'four_of_kind'
  gta('pile_burned', { method });
}

function trackGameOver(isLoser, playerCount, durationSec) {
  gta('game_over', {
    result: isLoser ? 'lost' : 'won',
    player_count: playerCount,
    duration_sec: Math.round(durationSec)
  });
}

function trackShareClicked(result) {
  gta('share_clicked', { player_result: result }); // 'won' | 'lost'
}

function trackShareCompleted(method) {
  gta('share_completed', { method }); // 'web_share' | 'download'
}

function trackLeaveGame(phase) {
  // phase: 'swapping' | 'playing'
  gta('leave_game', { phase });
}

function trackFacedownFlip(success) {
  gta('facedown_flip', { success });
}

// ─── PWA ──────────────────────────────────────────────────────────────────

window.addEventListener('beforeinstallprompt', (e) => {
  gta('pwa_install_prompt_shown');
  e.userChoice.then(choice => {
    gta('pwa_install_choice', { choice: choice.outcome }); // 'accepted' | 'dismissed'
  });
});

window.addEventListener('appinstalled', () => {
  gta('pwa_installed');
});

// ─── Session timing ───────────────────────────────────────────────────────

const _sessionStart = Date.now();
window.addEventListener('beforeunload', () => {
  const sec = Math.round((Date.now() - _sessionStart) / 1000);
  // Use sendBeacon so it fires even on page close
  if (typeof gtag !== 'undefined') {
    gtag('event', 'session_duration', { duration_sec: sec });
  }
});

// Export for use in other scripts
window.Analytics = {
  trackRoomCreated, trackRoomJoined, trackBotAdded, trackGameStarted,
  trackLinkCopied, trackSwapConfirmed, trackCardsPlayed, trackAteCaca,
  trackPileBurned, trackGameOver, trackShareClicked, trackShareCompleted,
  trackLeaveGame, trackFacedownFlip
};
