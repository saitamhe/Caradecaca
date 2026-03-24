'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const roomManager = require('./src/roomManager');
const engine = require('./src/gameEngine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

// Serve index for all unmatched routes (SPA-like)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  // --- CREATE ROOM ---
  socket.on('create-room', ({ name }) => {
    if (!name || name.trim().length < 1) {
      return socket.emit('error', { message: 'Nombre inválido' });
    }
    const { roomId, state } = roomManager.createRoom(socket.id, name.trim());
    socket.join(roomId);
    socket.emit('room-created', {
      roomId,
      players: state.players.map(p => ({ id: p.id, name: p.name, connected: p.connected }))
    });
  });

  // --- JOIN ROOM ---
  socket.on('join-room', ({ roomId, name }) => {
    if (!name || name.trim().length < 1) {
      return socket.emit('error', { message: 'Nombre inválido' });
    }
    const upperRoom = (roomId || '').toUpperCase().trim();

    // Try rejoin first
    const existing = roomManager.getRoom(upperRoom);
    if (existing) {
      const existingPlayer = existing.players.find(
        p => p.name.toLowerCase() === name.trim().toLowerCase()
      );
      if (existingPlayer && (existing.status === 'swapping' || existing.status === 'playing')) {
        const result = roomManager.rejoinRoom(upperRoom, socket.id, name.trim());
        if (result.error) return socket.emit('error', { message: result.error });
        socket.join(upperRoom);
        const pub = engine.getPublicState(result.state);
        socket.emit('rejoined', {
          roomId: upperRoom,
          publicState: pub,
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
      players: result.state.players.map(p => ({ id: p.id, name: p.name, connected: p.connected })),
      isHost: false
    });
    socket.to(upperRoom).emit('player-joined', { id: socket.id, name: name.trim() });
  });

  // --- START GAME ---
  socket.on('start-game', () => {
    const roomId = roomManager.getRoomIdBySocket(socket.id);
    if (!roomId) return socket.emit('error', { message: 'No estás en ninguna sala' });

    const result = roomManager.startGame(roomId, socket.id);
    if (result.error) return socket.emit('error', { message: result.error });

    // Send each player their private cards
    for (const p of result.state.players) {
      const playerSocket = io.sockets.sockets.get(p.id);
      if (playerSocket) {
        playerSocket.emit('game-started', {
          hand: p.hand,
          faceDown: p.faceDown, // count only shown in UI, but we send for swap phase
          publicState: engine.getPublicState(result.state)
        });
      }
    }
  });

  // --- SWAP CARDS ---
  socket.on('swap-cards', ({ handIndices, faceUpIndices }) => {
    const state = roomManager.getRoomBySocket(socket.id);
    if (!state) return socket.emit('error', { message: 'No estás en ninguna sala' });
    if (state.status !== 'swapping') return socket.emit('error', { message: 'No es fase de intercambio' });

    const player = state.players.find(p => p.id === socket.id);
    if (!player) return socket.emit('error', { message: 'Jugador no encontrado' });

    if (handIndices && handIndices.length > 0) {
      const ok = engine.swapCards(player, handIndices, faceUpIndices);
      if (!ok) return socket.emit('error', { message: 'Intercambio inválido' });
    }

    socket.emit('swap-done', { hand: player.hand, faceUp: player.faceUp });
    io.to(state.roomId).emit('game-state', engine.getPublicState(state));
  });

  // --- CONFIRM SWAP ---
  socket.on('confirm-swap', () => {
    const roomId = roomManager.getRoomIdBySocket(socket.id);
    if (!roomId) return socket.emit('error', { message: 'No estás en ninguna sala' });

    const result = roomManager.confirmSwap(roomId, socket.id);
    if (result.error) return socket.emit('error', { message: result.error });

    io.to(roomId).emit('game-state', engine.getPublicState(result.state));

    if (result.started) {
      io.to(roomId).emit('play-started', {
        currentPlayerIdx: result.state.currentPlayerIdx,
        currentPlayerName: result.state.players[result.state.currentPlayerIdx].name
      });
      notifyCurrentPlayer(result.state, io);
    }
  });

  // --- PLAY CARDS ---
  socket.on('play-cards', ({ cardIds, source, faceDownIndex }) => {
    const state = roomManager.getRoomBySocket(socket.id);
    if (!state) return socket.emit('error', { message: 'No estás en ninguna sala' });
    if (state.status !== 'playing') return socket.emit('error', { message: 'El juego no está en curso' });

    const currentPlayer = state.players[state.currentPlayerIdx];
    const player = state.players.find(p => p.id === socket.id);
    if (!player) return socket.emit('error', { message: 'Jugador no encontrado' });

    // Validate cards
    const srcArr = source === 'hand' ? player.hand :
                   source === 'faceUp' ? player.faceUp : null;
    let cardsToPlay;
    if (source === 'faceDown') {
      cardsToPlay = [player.faceDown[faceDownIndex]];
    } else {
      cardsToPlay = cardIds.map(id => srcArr && srcArr.find(c => c.id === id)).filter(Boolean);
    }

    if (!cardsToPlay || cardsToPlay.length === 0) {
      return socket.emit('error', { message: 'Cartas no encontradas' });
    }

    // Check if out-of-turn 4-of-a-kind is possible
    const isCurrentTurn = currentPlayer.id === socket.id;
    if (!isCurrentTurn) {
      // Only allow out-of-turn if completing 4-of-a-kind
      const val = cardsToPlay[0].value;
      const topRun = engine.getTopRun(state.discardPile, val);
      if (topRun + cardsToPlay.length !== 4) {
        return socket.emit('error', { message: 'No es tu turno' });
      }
      // All cards must be same value
      if (cardsToPlay.some(c => c.value !== val)) {
        return socket.emit('error', { message: 'Cartas deben ser del mismo valor' });
      }
    }

    // Validate play
    if (isCurrentTurn) {
      const valid = engine.canPlay(cardsToPlay, state.discardPile, state.mustLeOrEq7, state.jokerPending);
      if (!valid) return socket.emit('error', { message: 'Jugada inválida' });
    }

    const effects = engine.applyPlay(state, socket.id, cardIds, source, faceDownIndex);
    if (effects.error) return socket.emit('error', { message: effects.error });

    state.lastActivity = Date.now();

    // Check if face-down flip failed
    if (source === 'faceDown') {
      const card = effects.cards[0];
      const wasValid = engine.canPlay([card], state.discardPile.slice(0, -1),
        state.mustLeOrEq7Before, state.jokerPending);
      // Actually applyPlay already handled it - if it failed canPlay, the card gets returned
      // We handle this differently: check after apply
    }

    // Check player finished
    if (engine.checkPlayerFinished(player)) {
      player.finished = true;
      state.rankings.push(player.id);
    }

    // Check game over
    const loser = engine.checkGameOver(state);
    if (loser) {
      state.status = 'finished';
      state.loser = loser.id;
      state.rankings.push(loser.id); // last one is the loser
      io.to(state.roomId).emit('game-over', {
        loserId: loser.id,
        loserName: loser.name,
        rankings: state.rankings.map(id => {
          const p = state.players.find(x => x.id === id);
          return { id, name: p ? p.name : '?' };
        })
      });
      return;
    }

    // Broadcast state
    io.to(state.roomId).emit('game-state', engine.getPublicState(state));

    // Send private hand updates
    for (const p of state.players) {
      const ps = io.sockets.sockets.get(p.id);
      if (ps) ps.emit('your-hand', { hand: p.hand });
    }

    // Notify next player
    if (!effects.jokerChain) {
      notifyCurrentPlayer(state, io);
    } else {
      notifyCurrentPlayer(state, io); // still notify for joker chain
    }
  });

  // --- TAKE PILE ---
  socket.on('take-pile', () => {
    const state = roomManager.getRoomBySocket(socket.id);
    if (!state) return socket.emit('error', { message: 'No estás en ninguna sala' });
    if (state.status !== 'playing') return;

    const result = engine.takePile(state, socket.id);
    if (result.error) return socket.emit('error', { message: result.error });

    state.lastActivity = Date.now();

    io.to(state.roomId).emit('game-state', engine.getPublicState(state));
    io.to(state.roomId).emit('player-ate', {
      playerId: socket.id,
      playerName: state.players.find(p => p.id === socket.id)?.name
    });

    // Send private hand
    const player = state.players.find(p => p.id === socket.id);
    if (player) socket.emit('your-hand', { hand: player.hand });

    notifyCurrentPlayer(state, io);
  });

  // --- FLIP FACE DOWN ---
  socket.on('flip-facedown', ({ index }) => {
    const state = roomManager.getRoomBySocket(socket.id);
    if (!state) return socket.emit('error', { message: 'No estás en ninguna sala' });
    if (state.status !== 'playing') return;

    const currentPlayer = state.players[state.currentPlayerIdx];
    if (currentPlayer.id !== socket.id) return socket.emit('error', { message: 'No es tu turno' });

    const player = state.players.find(p => p.id === socket.id);
    if (!player) return;

    if (player.hand.length > 0 || player.faceUp.length > 0) {
      return socket.emit('error', { message: 'Debes usar tus cartas de mano/boca-arriba primero' });
    }

    const card = player.faceDown[index];
    if (!card) return socket.emit('error', { message: 'Índice inválido' });

    // Reveal card
    player.faceDown.splice(index, 1);

    // Can it be played?
    const valid = engine.canPlay([card], state.discardPile, state.mustLeOrEq7, state.jokerPending);

    if (valid) {
      state.discardPile.push(card);
      io.to(state.roomId).emit('facedown-flipped', {
        playerId: socket.id,
        card,
        success: true
      });

      // Handle special effects
      if (card.value === 10) {
        engine.burnPile(state);
        io.to(state.roomId).emit('pile-burned', { by: socket.id });
        // Player goes again
      } else if (card.value === 11) {
        state.direction *= -1;
        state.mustLeOrEq7 = false;
      } else if (card.value === 7) {
        state.mustLeOrEq7 = true;
      } else if (card.value === 0) {
        state.jokerPending = true;
      } else if (card.value !== 2) {
        state.mustLeOrEq7 = false;
      }

      // Check 4-of-a-kind
      const topRun = engine.getTopRun(state.discardPile, card.value);
      if (topRun >= 4) {
        engine.burnPile(state);
        io.to(state.roomId).emit('pile-burned', { by: socket.id });
      } else if (card.value !== 10) {
        engine.advanceTurn(state);
      }

    } else {
      // Failed flip: take pile + card
      player.hand.push(...state.discardPile, card);
      state.discardPile = [];
      state.mustLeOrEq7 = false;
      state.jokerPending = false;

      io.to(state.roomId).emit('facedown-flipped', {
        playerId: socket.id,
        card,
        success: false
      });
      socket.emit('your-hand', { hand: player.hand });
      io.to(state.roomId).emit('player-ate', {
        playerId: socket.id,
        playerName: player.name
      });
      engine.advanceTurn(state);
    }

    // Check finished
    if (engine.checkPlayerFinished(player)) {
      player.finished = true;
      state.rankings.push(player.id);
    }

    const loser = engine.checkGameOver(state);
    if (loser) {
      state.status = 'finished';
      state.loser = loser.id;
      state.rankings.push(loser.id);
      io.to(state.roomId).emit('game-over', {
        loserId: loser.id,
        loserName: loser.name,
        rankings: state.rankings.map(id => {
          const p = state.players.find(x => x.id === id);
          return { id, name: p ? p.name : '?' };
        })
      });
      return;
    }

    io.to(state.roomId).emit('game-state', engine.getPublicState(state));
    notifyCurrentPlayer(state, io);
  });

  // --- DISCONNECT ---
  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    const result = roomManager.removePlayer(socket.id);
    if (result && result.roomId && !result.cleaned) {
      io.to(result.roomId).emit('player-disconnected', {
        playerId: socket.id,
        name: result.player?.name
      });
      if (result.state) {
        io.to(result.roomId).emit('game-state', engine.getPublicState(result.state));
      }
    }
  });
});

function notifyCurrentPlayer(state, io) {
  const cp = state.players[state.currentPlayerIdx];
  if (!cp || cp.finished) return;
  const cpSocket = io.sockets.sockets.get(cp.id);
  if (cpSocket) {
    cpSocket.emit('your-turn', {
      mustLeOrEq7: state.mustLeOrEq7,
      jokerPending: state.jokerPending,
      topCard: state.discardPile.length > 0 ? state.discardPile[state.discardPile.length - 1] : null
    });
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Care Caca server running on http://localhost:${PORT}`);
});
