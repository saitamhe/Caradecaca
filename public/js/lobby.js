// Lobby page logic
const socket = io();
const playerName = sessionStorage.getItem('playerName');
const isCreating = sessionStorage.getItem('isCreating');
const joiningRoom = sessionStorage.getItem('joiningRoom');

const roomCodeEl = document.getElementById('room-code');
const playerCountEl = document.getElementById('player-count');
const playerListEl = document.getElementById('player-list');
const btnStart = document.getElementById('btn-start');
const waitingMsg = document.getElementById('waiting-msg');
const btnCopyLink = document.getElementById('btn-copy-link');
const errorMsg = document.getElementById('error-msg');

let myRoomId = null;
let isHost = false;
let players = [];

if (!playerName) {
  window.location.href = '/';
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove('hidden');
}

function renderPlayers(list) {
  playerListEl.innerHTML = '';
  playerCountEl.textContent = list.length;
  list.forEach(p => {
    const li = document.createElement('li');
    li.className = 'player-item' + (p.id === socket.id || p.isHost ? ' host' : '') + (p.connected === false ? ' disconnected' : '');
    const initials = p.name.slice(0, 2).toUpperCase();
    li.innerHTML = `
      <div class="player-avatar">${initials}</div>
      <span>${p.name}${p.id === socket.id ? ' (tú)' : ''}</span>
    `;
    playerListEl.appendChild(li);
  });
}

socket.on('connect', () => {
  if (isCreating) {
    socket.emit('create-room', { name: playerName });
  } else if (joiningRoom) {
    socket.emit('join-room', { roomId: joiningRoom, name: playerName });
  } else {
    window.location.href = '/';
  }
});

socket.on('room-created', ({ roomId, players: list }) => {
  myRoomId = roomId;
  isHost = true;
  sessionStorage.setItem('roomId', roomId);
  roomCodeEl.textContent = roomId;
  players = list;
  renderPlayers(list.map(p => ({ ...p, isHost: true })));
  btnStart.classList.remove('hidden');
  waitingMsg.classList.add('hidden');
});

socket.on('room-joined', ({ roomId, players: list }) => {
  myRoomId = roomId;
  isHost = false;
  sessionStorage.setItem('roomId', roomId);
  roomCodeEl.textContent = roomId;
  players = list;
  renderPlayers(list);
  waitingMsg.textContent = 'Esperando que el anfitrión inicie la partida...';
});

socket.on('player-joined', (player) => {
  players.push(player);
  renderPlayers(players);
});

socket.on('player-disconnected', ({ playerId, name }) => {
  players = players.map(p => p.id === playerId ? { ...p, connected: false } : p);
  renderPlayers(players);
});

socket.on('game-started', (data) => {
  // Store initial card data before navigating (new socket will need to rejoin)
  if (data && data.hand) {
    sessionStorage.setItem('initialHand', JSON.stringify(data.hand));
    sessionStorage.setItem('initialFaceDown', JSON.stringify(data.faceDown));
  }
  window.location.href = '/game.html';
});

socket.on('error', ({ message }) => showError(message));

btnStart.addEventListener('click', () => {
  if (players.length < 2) return showError('Se necesitan al menos 2 jugadores');
  socket.emit('start-game');
});

btnCopyLink.addEventListener('click', () => {
  const url = `${window.location.origin}/?room=${myRoomId}`;
  navigator.clipboard.writeText(url).then(() => {
    btnCopyLink.textContent = '✅ Copiado!';
    setTimeout(() => btnCopyLink.textContent = '📋 Copiar enlace', 2000);
  }).catch(() => {
    prompt('Copia este enlace:', url);
  });
});
