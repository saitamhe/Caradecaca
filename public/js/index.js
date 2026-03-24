// Landing page logic
const inputName = document.getElementById('input-name');
const inputRoom = document.getElementById('input-room');
const btnCreate = document.getElementById('btn-create');
const btnJoinToggle = document.getElementById('btn-join-toggle');
const btnJoin = document.getElementById('btn-join');
const btnCancelJoin = document.getElementById('btn-cancel-join');
const panelName = document.getElementById('panel-name');
const panelJoin = document.getElementById('panel-join');
const errorMsg = document.getElementById('error-msg');

// Pre-fill room code from URL
const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room');
if (roomFromUrl) {
  inputRoom.value = roomFromUrl.toUpperCase();
  panelName.querySelector('h2').textContent = 'Unirse a partida';
  showPanel('join');
}

function showPanel(panel) {
  panelName.classList.toggle('hidden', panel === 'join');
  panelJoin.classList.toggle('hidden', panel !== 'join');
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove('hidden');
  setTimeout(() => errorMsg.classList.add('hidden'), 4000);
}

function getName() {
  return inputName.value.trim();
}

btnJoinToggle.addEventListener('click', () => {
  if (!getName()) return showError('Primero escribe tu nombre');
  showPanel('join');
  inputRoom.focus();
});

btnCancelJoin.addEventListener('click', () => showPanel('name'));

btnCreate.addEventListener('click', () => {
  const name = getName();
  if (!name) return showError('Escribe tu nombre');
  sessionStorage.setItem('playerName', name);
  sessionStorage.setItem('isCreating', '1');
  window.location.href = '/lobby.html';
});

btnJoin.addEventListener('click', doJoin);
inputRoom.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });

function doJoin() {
  const name = getName();
  const room = inputRoom.value.toUpperCase().trim();
  if (!name) return showError('Escribe tu nombre');
  if (!room || room.length < 4) return showError('Código de sala inválido');
  sessionStorage.setItem('playerName', name);
  sessionStorage.setItem('joiningRoom', room);
  sessionStorage.removeItem('isCreating');
  window.location.href = '/lobby.html';
}

inputName.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (!panelJoin.classList.contains('hidden')) doJoin();
    else btnCreate.click();
  }
});
