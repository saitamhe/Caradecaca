// Lobby page logic
const socket = io();
const playerName = sessionStorage.getItem('playerName');
const isCreating = sessionStorage.getItem('isCreating');
const joiningRoom = sessionStorage.getItem('joiningRoom');

const roomCodeEl     = document.getElementById('room-code');
const playerCountEl  = document.getElementById('player-count');
const playerListEl   = document.getElementById('player-list');
const btnStart       = document.getElementById('btn-start');
const btnExpress     = document.getElementById('btn-express');
const btnAddBot      = document.getElementById('btn-add-bot');
const btnBack        = document.getElementById('btn-back');
const waitingMsg     = document.getElementById('waiting-msg');
const btnCopyLink    = document.getElementById('btn-copy-link');
const errorMsg       = document.getElementById('error-msg');
const inviteSection  = document.getElementById('invite-section');
const btnInvite      = document.getElementById('btn-invite');
const inviteBackdrop = document.getElementById('invite-backdrop');
const btnShareInvite = document.getElementById('btn-share-invite');
const btnCloseInvite = document.getElementById('btn-close-invite');
const inviteLoading  = document.getElementById('invite-loading');
const invitePreviewCanvas = document.getElementById('invite-preview-canvas');

let myRoomId = null;
let isHost = false;
let players = [];
let inviteCanvas = null; // generated full-res canvas

if (!playerName) window.location.href = '/';

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove('hidden');
  setTimeout(() => errorMsg.classList.add('hidden'), 4000);
}

function renderPlayers(list) {
  playerListEl.innerHTML = '';
  playerCountEl.textContent = list.length;
  list.forEach((p, idx) => {
    const li = document.createElement('li');
    const isSelf = p.id === socket.id;
    const isHostPlayer = idx === 0;
    li.className = 'player-item' + (isHostPlayer ? ' host' : '') + (p.connected === false ? ' disconnected' : '');
    const initials = p.name.slice(0, 2).toUpperCase();
    li.innerHTML = `
      <div class="player-avatar">${p.isBot ? '🤖' : initials}</div>
      <span>${p.name}${isSelf ? ' (tú)' : ''}${p.isBot ? ' <em style="color:#aaa;font-size:0.8em">bot</em>' : ''}</span>
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
  btnExpress.classList.remove('hidden');
  btnAddBot.classList.remove('hidden');
  inviteSection.classList.remove('hidden');
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

socket.on('bot-added', (player) => {
  players.push(player);
  renderPlayers(players);
  Analytics.trackBotAdded(players.filter(p => p.isBot).length);
});

socket.on('player-disconnected', ({ playerId }) => {
  players = players.map(p => p.id === playerId ? { ...p, connected: false } : p);
  renderPlayers(players);
});

socket.on('game-started', (data) => {
  if (data && data.hand) {
    sessionStorage.setItem('initialHand', JSON.stringify(data.hand));
    sessionStorage.setItem('initialFaceDown', JSON.stringify(data.faceDown));
  }
  const bots = players.filter(p => p.isBot).length;
  Analytics.trackGameStarted(players.length, bots);
  sessionStorage.setItem('gameStartTime', Date.now());
  window.location.href = '/game.html';
});

socket.on('error', ({ message }) => showError(message));

// ── Button handlers ──────────────────────────────────────────────────────────

btnStart.addEventListener('click', () => {
  if (players.filter(p => !p.isBot).length < 1) return showError('Necesitas al menos 1 jugador humano');
  if (players.length < 2) return showError('Se necesitan al menos 2 jugadores (agrega un bot o espera)');
  socket.emit('start-game');
});

btnExpress.addEventListener('click', () => {
  if (players.filter(p => !p.isBot).length < 1) return showError('Necesitas al menos 1 jugador humano');
  if (players.length < 2) return showError('Se necesitan al menos 2 jugadores (agrega un bot o espera)');
  socket.emit('start-game', { express: true });
});

btnAddBot.addEventListener('click', () => {
  if (players.length >= 9) return showError('Sala llena (máximo 9 jugadores)');
  socket.emit('add-bot');
});

btnBack.addEventListener('click', () => {
  sessionStorage.removeItem('roomId');
  sessionStorage.removeItem('isCreating');
  sessionStorage.removeItem('joiningRoom');
  window.location.href = '/';
});

btnCopyLink.addEventListener('click', () => {
  const url = `${window.location.origin}/?room=${myRoomId}`;
  Analytics.trackLinkCopied();
  navigator.clipboard.writeText(url).then(() => {
    btnCopyLink.textContent = '✅ Copiado!';
    setTimeout(() => btnCopyLink.textContent = '📋 Copiar enlace', 2000);
  }).catch(() => {
    prompt('Copia este enlace:', url);
  });
});

// ── Instagram invite flow ─────────────────────────────────────────────────────

btnInvite.addEventListener('click', async () => {
  if (!myRoomId) return;
  inviteBackdrop.classList.remove('hidden');
  inviteLoading.style.display = 'block';
  invitePreviewCanvas.style.display = 'none';

  const joinUrl = `${window.location.origin}/?room=${myRoomId}`;
  try {
    // Generate full-res image
    inviteCanvas = await ShareModule.generateInviteImage({
      roomCode: myRoomId,
      joinUrl,
      hostName: playerName
    });

    // Show tiny preview (scaled thumbnail)
    const previewCtx = invitePreviewCanvas.getContext('2d');
    invitePreviewCanvas.width = 108;
    invitePreviewCanvas.height = 192;
    previewCtx.drawImage(inviteCanvas, 0, 0, 108, 192);
    inviteLoading.style.display = 'none';
    invitePreviewCanvas.style.display = 'block';
  } catch (e) {
    inviteLoading.textContent = 'Error generando imagen 😢';
  }
});

btnShareInvite.addEventListener('click', async () => {
  if (!inviteCanvas) return;
  try {
    const result = await ShareModule.shareToInstagram(
      inviteCanvas,
      'invitacion-caradecaca.png',
      `💩 ¡${playerName} te reta a jugar Cara de Caca! Únete con el código ${myRoomId} en ${window.location.origin}`
    );
    if (result === 'downloaded') {
      btnShareInvite.textContent = '✅ Imagen descargada';
      setTimeout(() => { btnShareInvite.textContent = '📤 Compartir imagen'; }, 2500);
    }
  } catch (e) {
    showError('No se pudo compartir la imagen');
  }
});

btnCloseInvite.addEventListener('click', () => {
  inviteBackdrop.classList.add('hidden');
});
