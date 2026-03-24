'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const roomManager = require('./src/roomManager');
const engine = require('./src/gameEngine');
const bot = require('./src/bot');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ─── Helpers ───────────────────────────────────────────────────────────────

function broadcastState(state) {
  io.to(state.roomId).emit('game-state', engine.getPublicState(state));
  for (const p of state.players) {
    if (p.isBot) continue;
    const s = io.sockets.sockets.get(p.id);
    if (s) s.emit('your-hand', { hand: p.hand });
  }
}

function notifyCurrentPlayer(state) {
  const cp = state.players[state.currentPlayerIdx];
  if (!cp || cp.finished) return;
  if (cp.isBot) {
    scheduleBotTurn(state, cp);
    return;
  }
  const s = io.sockets.sockets.get(cp.id);
  if (s) s.emit('your-turn', {
    mustLeOrEq7: state.mustLeOrEq7,
    jokerPending: state.jokerPending,
    topCard: state.discardPile.length > 0 ? state.discardPile[state.discardPile.length - 1] : null
  });
}

function checkAndEndGame(state) {
  const loser = engine.checkGameOver(state);
  if (loser) {
    state.status = 'finished';
    state.loser = loser.id;
    if (!state.rankings.includes(loser.id)) state.rankings.push(loser.id);
    io.to(state.roomId).emit('game-over', {
      loserId: loser.id,
      loserName: loser.name,
      rankings: state.rankings.map(id => {
        const p = state.players.find(x => x.id === id);
        return { id, name: p ? p.name : '?' };
      })
    });
    return true;
  }
  return false;
}

function handleFlip(state, player, index) {
  const card = player.faceDown[index];
  if (!card) return;
  player.faceDown.splice(index, 1);

  const valid = engine.canPlay([card], state.discardPile, state.mustLeOrEq7, state.jokerPending);
  if (valid) {
    state.discardPile.push(card);
    io.to(state.roomId).emit('facedown-flipped', { playerId: player.id, card, success: true });
    if (card.value === 10) {
      engine.burnPile(state);
      io.to(state.roomId).emit('pile-burned', { by: player.id });
    } else if (card.value === 11) {
      state.direction *= -1; state.mustLeOrEq7 = false;
    } else if (card.value === 7) {
      state.mustLeOrEq7 = true;
    } else if (card.value === 0) {
      state.jokerPending = true;
    } else if (card.value !== 2) {
      state.mustLeOrEq7 = false;
    }
    const topRun = engine.getTopRun(state.discardPile, card.value);
    if (topRun >= 4) {
      engine.burnPile(state); io.to(state.roomId).emit('pile-burned', { by: player.id });
    } else if (card.value !== 10) {
      engine.advanceTurn(state);
    }
  } else {
    player.hand.push(...state.discardPile, card);
    state.discardPile = [];
    state.mustLeOrEq7 = false;
    state.jokerPending = false;
    io.to(state.roomId).emit('facedown-flipped', { playerId: player.id, card, success: false });
    io.to(state.roomId).emit('player-ate', { playerId: player.id, playerName: player.name });
    const s = io.sockets.sockets.get(player.id);
    if (s) s.emit('your-hand', { hand: player.hand });
    engine.advanceTurn(state);
  }

  if (engine.checkPlayerFinished(player) && !player.finished) {
    player.finished = true;
    state.rankings.push(player.id);
  }
}

// ─── Bot turn scheduler ────────────────────────────────────────────────────

function scheduleBotTurn(state, botPlayer) {
  if (state.status !== 'playing') return;
  const delay = 800 + Math.random() * 700; // 0.8–1.5s feels natural
  setTimeout(() => {
    if (state.status !== 'playing') return;
    if (state.players[state.currentPlayerIdx]?.id !== botPlayer.id) return;
    executeBotTurn(state, botPlayer);
  }, delay);
}

function executeBotTurn(state, botPlayer) {
  const phase = engine.getPlayerPhase(botPlayer);
  let action;

  if (phase === 'faceDown') {
    action = { action: 'flip', index: 0 };
  } else {
    action = bot.chooseBotPlay(botPlayer, state.discardPile, state.mustLeOrEq7, state.jokerPending);
  }

  if (action.action === 'flip') {
    handleFlip(state, botPlayer, action.index);
  } else if (action.action === 'play') {
    const source = action.source;
    const srcArr = source === 'hand' ? botPlayer.hand : botPlayer.faceUp;
    const cards = action.cardIds.map(id => srcArr.find(c => c.id === id)).filter(Boolean);
    if (!cards.length) { engine.takePile(state, botPlayer.id); }
    else {
      const effects = engine.applyPlay(state, botPlayer.id, action.cardIds, source);
      if (effects.error) { engine.takePile(state, botPlayer.id); }
      else if (effects.burned) {
        io.to(state.roomId).emit('pile-burned', { by: botPlayer.id });
      } else if (effects.forceEat) {
        io.to(state.roomId).emit('player-ate', { playerId: null, playerName: '(joker pendiente)' });
      }
    }
    if (engine.checkPlayerFinished(botPlayer) && !botPlayer.finished) {
      botPlayer.finished = true;
      state.rankings.push(botPlayer.id);
    }
  } else {
    // take
    engine.takePile(state, botPlayer.id);
    io.to(state.roomId).emit('player-ate', { playerId: botPlayer.id, playerName: botPlayer.name });
  }

  if (checkAndEndGame(state)) return;
  broadcastState(state);
  notifyCurrentPlayer(state);
}

// ─── Socket handlers ───────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  // CREATE ROOM
  socket.on('create-room', ({ name }) => {
    if (!name?.trim()) return socket.emit('error', { message: 'Nombre inválido' });
    const { roomId, state } = roomManager.createRoom(socket.id, name.trim());
    socket.join(roomId);
    socket.emit('room-created', {
      roomId,
      players: state.players.map(p => ({ id: p.id, name: p.name, isBot: false, connected: true }))
    });
  });

  // JOIN ROOM
  socket.on('join-room', ({ roomId, name }) => {
    if (!name?.trim()) return socket.emit('error', { message: 'Nombre inválido' });
    const upperRoom = (roomId || '').toUpperCase().trim();

    const existing = roomManager.getRoom(upperRoom);
    if (existing) {
      const existingPlayer = existing.players.find(
        p => !p.isBot && p.name.toLowerCase() === name.trim().toLowerCase()
      );
      if (existingPlayer && (existing.status === 'swapping' || existing.status === 'playing')) {
        const result = roomManager.rejoinRoom(upperRoom, socket.id, name.trim());
        if (result.error) return socket.emit('error', { message: result.error });
        socket.join(upperRoom);
        socket.emit('rejoined', {
          roomId: upperRoom,
          publicState: engine.getPublicState(result.state),
          hand: result.player.hand,
          faceDown: result.player.faceDown,
          isHost: result.state.hostId === socket.id
        });
        io.to(upperRoom).emit('player-reconnected', { playerId: socket.id, name: result.player.name });
        return;
      }
    }

    const result = roomManager.joinRoom(upperRoom, socket.id, name.trim());
    if (result.error) return socket.emit('error', { message: result.error });
    socket.join(upperRoom);
    socket.emit('room-joined', {
      roomId: upperRoom,
      players: result.state.players.map(p => ({ id: p.id, name: p.name, isBot: p.isBot || false, connected: p.connected })),
      isHost: false
    });
    socket.to(upperRoom).emit('player-joined', { id: socket.id, name: name.trim(), isBot: false });
  });

  // ADD BOT
  socket.on('add-bot', () => {
    const roomId = roomManager.getRoomIdBySocket(socket.id);
    if (!roomId) return socket.emit('error', { message: 'No estás en ninguna sala' });
    const state = roomManager.getRoom(roomId);
    if (!state) return socket.emit('error', { message: 'Sala no encontrada' });
    if (state.hostId !== socket.id) return socket.emit('error', { message: 'Solo el anfitrión puede agregar bots' });
    if (state.status !== 'waiting') return socket.emit('error', { message: 'Solo en sala de espera' });
    if (state.players.length >= 9) return socket.emit('error', { message: 'Sala llena' });

    const botName = bot.nextBotName();
    const botPlayer = {
      id: 'bot-' + Date.now(),
      name: botName,
      hand: [], faceUp: [], faceDown: [],
      finished: false, connected: true,
      isBot: true, swapConfirmed: true
    };
    state.players.push(botPlayer);
    io.to(roomId).emit('bot-added', { id: botPlayer.id, name: botPlayer.name, isBot: true });
  });

  // START GAME
  socket.on('start-game', (data) => {
    const express = !!(data && data.express);
    const roomId = roomManager.getRoomIdBySocket(socket.id);
    if (!roomId) return socket.emit('error', { message: 'No estás en ninguna sala' });
    const result = roomManager.startGame(roomId, socket.id, { express });
    if (result.error) return socket.emit('error', { message: result.error });

    for (const p of result.state.players) {
      if (p.isBot) continue;
      const s = io.sockets.sockets.get(p.id);
      if (s) s.emit('game-started', {
        hand: p.hand,
        faceDown: p.faceDown,
        publicState: engine.getPublicState(result.state)
      });
    }
    // Bots auto-confirm swap
    const allConfirmed = result.state.players.every(p => p.swapConfirmed);
    if (allConfirmed) startPlaying(result.state);
  });

  // SWAP CARDS
  socket.on('swap-cards', ({ handIndices, faceUpIndices }) => {
    const state = roomManager.getRoomBySocket(socket.id);
    if (!state || state.status !== 'swapping') return;
    const player = state.players.find(p => p.id === socket.id);
    if (!player) return;
    if (handIndices?.length > 0) {
      const ok = engine.swapCards(player, handIndices, faceUpIndices);
      if (!ok) return socket.emit('error', { message: 'Intercambio inválido' });
    }
    socket.emit('swap-done', { hand: player.hand, faceUp: player.faceUp });
    broadcastState(state);
  });

  // CONFIRM SWAP
  socket.on('confirm-swap', () => {
    const roomId = roomManager.getRoomIdBySocket(socket.id);
    if (!roomId) return;
    const result = roomManager.confirmSwap(roomId, socket.id);
    if (result.error) return socket.emit('error', { message: result.error });
    broadcastState(result.state);
    if (result.started) startPlaying(result.state);
  });

  // PLAY CARDS
  socket.on('play-cards', ({ cardIds, source, faceDownIndex }) => {
    const state = roomManager.getRoomBySocket(socket.id);
    if (!state || state.status !== 'playing') return;

    const currentPlayer = state.players[state.currentPlayerIdx];
    const player = state.players.find(p => p.id === socket.id);
    if (!player) return;

    const srcArr = source === 'hand' ? player.hand : source === 'faceUp' ? player.faceUp : null;
    const cardsToPlay = source === 'faceDown'
      ? [player.faceDown[faceDownIndex]].filter(Boolean)
      : cardIds.map(id => srcArr?.find(c => c.id === id)).filter(Boolean);

    if (!cardsToPlay.length) return socket.emit('error', { message: 'Cartas no encontradas' });

    const isCurrentTurn = currentPlayer.id === socket.id;
    if (!isCurrentTurn) {
      const val = cardsToPlay[0].value;
      const topRun = engine.getTopRun(state.discardPile, val);
      if (topRun + cardsToPlay.length !== 4 || cardsToPlay.some(c => c.value !== val))
        return socket.emit('error', { message: 'No es tu turno' });
    }

    if (isCurrentTurn) {
      if (!engine.canPlay(cardsToPlay, state.discardPile, state.mustLeOrEq7, state.jokerPending))
        return socket.emit('error', { message: 'Jugada inválida' });
    }

    const effects = engine.applyPlay(state, socket.id, cardIds, source, faceDownIndex);
    if (effects.error) return socket.emit('error', { message: effects.error });

    if (effects.burned) io.to(state.roomId).emit('pile-burned', { by: socket.id });
    state.lastActivity = Date.now();

    if (engine.checkPlayerFinished(player) && !player.finished) {
      player.finished = true;
      state.rankings.push(player.id);
    }

    if (checkAndEndGame(state)) return;
    broadcastState(state);
    notifyCurrentPlayer(state);
  });

  // TAKE PILE
  socket.on('take-pile', () => {
    const state = roomManager.getRoomBySocket(socket.id);
    if (!state || state.status !== 'playing') return;
    const result = engine.takePile(state, socket.id);
    if (result.error) return socket.emit('error', { message: result.error });
    state.lastActivity = Date.now();
    io.to(state.roomId).emit('player-ate', {
      playerId: socket.id,
      playerName: state.players.find(p => p.id === socket.id)?.name
    });
    broadcastState(state);
    notifyCurrentPlayer(state);
  });

  // FLIP FACE DOWN
  socket.on('flip-facedown', ({ index }) => {
    const state = roomManager.getRoomBySocket(socket.id);
    if (!state || state.status !== 'playing') return;
    const currentPlayer = state.players[state.currentPlayerIdx];
    if (currentPlayer.id !== socket.id) return socket.emit('error', { message: 'No es tu turno' });
    const player = state.players.find(p => p.id === socket.id);
    if (!player) return;
    if (player.hand.length > 0 || player.faceUp.length > 0)
      return socket.emit('error', { message: 'Usa tus cartas de mano/boca-arriba primero' });

    handleFlip(state, player, index);
    if (checkAndEndGame(state)) return;
    broadcastState(state);
    notifyCurrentPlayer(state);
  });

  // SEND REACTION (💩 cacas, zumbidos, emotes, gases)
  socket.on('send-reaction', ({ type } = {}) => {
    const roomId = roomManager.getRoomIdBySocket(socket.id);
    if (!roomId) return;
    const state = roomManager.getRoom(roomId);
    if (!state) return;
    const player = state.players.find(p => p.id === socket.id);
    if (!player) return;
    // Rate limit: max 1 reaction per 2 seconds per player
    const now = Date.now();
    if (player._lastReaction && now - player._lastReaction < 2000) return;
    player._lastReaction = now;
    const allowed = ['poop','buzz','gas','laugh','skull','fire','kiss','ok','no','shock','clap'];
    if (!allowed.includes(type)) return;
    io.to(roomId).emit('reaction', { from: player.name, type });
  });

  // LEAVE GAME
  socket.on('leave-game', () => {
    const state = roomManager.getRoomBySocket(socket.id);
    if (!state) return;
    const player = state.players.find(p => p.id === socket.id);
    if (!player) return;

    io.to(state.roomId).emit('player-left', { playerId: socket.id, name: player.name });

    if (state.status === 'waiting' || state.status === 'swapping') {
      // Remove from room
      state.players = state.players.filter(p => p.id !== socket.id);
      roomManager.removePlayer(socket.id);
      broadcastState(state);
    } else if (state.status === 'playing') {
      // Mark as finished (they forfeit - counted as loser if last)
      player.finished = true;
      player.connected = false;
      if (!state.rankings.includes(player.id)) state.rankings.push(player.id);
      roomManager.removePlayer(socket.id);

      // Advance turn if it was their turn
      if (state.players[state.currentPlayerIdx]?.id === socket.id) {
        engine.advanceTurn(state);
      }

      if (!checkAndEndGame(state)) {
        broadcastState(state);
        notifyCurrentPlayer(state);
      }
    }
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    const result = roomManager.removePlayer(socket.id);
    if (result?.roomId && !result.cleaned) {
      io.to(result.roomId).emit('player-disconnected', { playerId: socket.id, name: result.player?.name });
      if (result.state) broadcastState(result.state);
    }
  });
});

function startPlaying(state) {
  state.status = 'playing';
  state.currentPlayerIdx = engine.findStartingPlayer(state.players);
  io.to(state.roomId).emit('play-started', {
    currentPlayerIdx: state.currentPlayerIdx,
    currentPlayerName: state.players[state.currentPlayerIdx].name
  });
  broadcastState(state);
  notifyCurrentPlayer(state);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Care Caca server on http://localhost:${PORT}`));
