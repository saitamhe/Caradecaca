'use strict';

const { dealCards, findStartingPlayer, shuffle } = require('./gameEngine');

const rooms = new Map(); // roomId -> GameState
const socketToRoom = new Map(); // socketId -> roomId

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function createRoom(socketId, playerName) {
  let roomId;
  do { roomId = generateRoomId(); } while (rooms.has(roomId));

  const player = {
    id: socketId,
    name: playerName,
    hand: [],
    faceUp: [],
    faceDown: [],
    finished: false,
    connected: true,
    swapConfirmed: false
  };

  const state = {
    roomId,
    status: 'waiting', // waiting | swapping | playing | finished
    hostId: socketId,
    players: [player],
    deck: [],
    discardPile: [],
    currentPlayerIdx: 0,
    direction: 1,
    mustLeOrEq7: false,
    jokerPending: false,
    loser: null,
    rankings: [], // players in order of finishing
    burnedCount: 0,
    createdAt: Date.now(),
    lastActivity: Date.now()
  };

  rooms.set(roomId, state);
  socketToRoom.set(socketId, roomId);
  return { roomId, state };
}

function joinRoom(roomId, socketId, playerName) {
  const state = rooms.get(roomId);
  if (!state) return { error: 'Sala no encontrada' };
  if (state.status !== 'waiting') return { error: 'La partida ya comenzó' };
  if (state.players.length >= 9) return { error: 'Sala llena (máximo 9 jugadores)' };

  // Prevent duplicate names
  const dupName = state.players.find(p => p.name.toLowerCase() === playerName.toLowerCase());
  if (dupName) return { error: 'Ya hay un jugador con ese nombre' };

  const player = {
    id: socketId,
    name: playerName,
    hand: [],
    faceUp: [],
    faceDown: [],
    finished: false,
    connected: true,
    swapConfirmed: false
  };

  state.players.push(player);
  socketToRoom.set(socketId, roomId);
  state.lastActivity = Date.now();
  return { state, player };
}

function rejoinRoom(roomId, socketId, playerName) {
  const state = rooms.get(roomId);
  if (!state) return { error: 'Sala no encontrada' };

  const existing = state.players.find(p => p.name.toLowerCase() === playerName.toLowerCase());
  if (!existing) return { error: 'Jugador no encontrado en esta sala' };

  // Update socket id
  socketToRoom.delete(existing.id);
  existing.id = socketId;
  existing.connected = true;
  socketToRoom.set(socketId, roomId);
  state.lastActivity = Date.now();
  return { state, player: existing };
}

function removePlayer(socketId) {
  const roomId = socketToRoom.get(socketId);
  if (!roomId) return null;

  const state = rooms.get(roomId);
  if (!state) return null;

  socketToRoom.delete(socketId);
  const player = state.players.find(p => p.id === socketId);
  if (player) {
    player.connected = false;
    state.lastActivity = Date.now();
  }

  // If all disconnected and waiting, clean up
  if (state.status === 'waiting' && state.players.every(p => !p.connected)) {
    rooms.delete(roomId);
    return { roomId, cleaned: true };
  }

  return { roomId, state, player };
}

function startGame(roomId, socketId) {
  const state = rooms.get(roomId);
  if (!state) return { error: 'Sala no encontrada' };
  if (state.hostId !== socketId) return { error: 'Solo el anfitrión puede iniciar' };
  if (state.status !== 'waiting') return { error: 'El juego ya inició' };
  if (state.players.length < 2) return { error: 'Se necesitan al menos 2 jugadores' };

  // Deal cards
  state.deck = dealCards(state.players);
  state.status = 'swapping';
  state.lastActivity = Date.now();
  return { state };
}

function confirmSwap(roomId, socketId) {
  const state = rooms.get(roomId);
  if (!state) return { error: 'Sala no encontrada' };
  if (state.status !== 'swapping') return { error: 'No estás en fase de intercambio' };

  const player = state.players.find(p => p.id === socketId);
  if (!player) return { error: 'Jugador no encontrado' };
  player.swapConfirmed = true;

  // Check if all human players confirmed (bots auto-confirm on deal)
  const allConfirmed = state.players.every(p => p.swapConfirmed);
  if (allConfirmed) {
    state.lastActivity = Date.now();
    return { state, started: true };
  }

  return { state, started: false };
}

function getRoom(roomId) {
  return rooms.get(roomId);
}

function getRoomBySocket(socketId) {
  const roomId = socketToRoom.get(socketId);
  if (!roomId) return null;
  return rooms.get(roomId);
}

function getRoomIdBySocket(socketId) {
  return socketToRoom.get(socketId);
}

// Periodic cleanup of old rooms (call every 30 min)
function cleanup() {
  const now = Date.now();
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  for (const [roomId, state] of rooms.entries()) {
    if (now - state.lastActivity > TWO_HOURS) {
      // Remove socket mappings
      for (const p of state.players) {
        socketToRoom.delete(p.id);
      }
      rooms.delete(roomId);
    }
  }
}

setInterval(cleanup, 30 * 60 * 1000);

module.exports = {
  createRoom, joinRoom, rejoinRoom, removePlayer,
  startGame, confirmSwap, getRoom, getRoomBySocket,
  getRoomIdBySocket
};
