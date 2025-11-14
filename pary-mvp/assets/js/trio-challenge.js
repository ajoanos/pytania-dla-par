import { postJson, getJson } from './app.js';

const params = new URLSearchParams(window.location.search);
const roomKey = (params.get('room_key') || '').toUpperCase();
const localPlayerId = params.get('pid') || '';

if (!roomKey || !localPlayerId) {
  window.location.replace('trio-challenge.html');
}

const EMAIL_ENDPOINT = 'api/send_positions_email.php';
const SHARE_EMAIL_SUBJECT = 'TRIO Challenge – dołącz do mnie';

const elements = {
  roomLabel: document.getElementById('trio-room-label'),
  playersList: document.getElementById('trio-players'),
  waitingHint: document.getElementById('trio-waiting'),
  turnLabel: document.getElementById('trio-turn'),
  board: document.getElementById('trio-board'),
  moveHint: document.getElementById('trio-move-hint'),
  resultSection: document.getElementById('trio-result'),
  resultTitle: document.getElementById('trio-result-title'),
  resultText: document.getElementById('trio-result-text'),
  challengesList: document.getElementById('trio-challenges'),
  resetButton: document.getElementById('trio-reset'),
  modeCard: document.getElementById('trio-mode-card'),
  modeLabel: document.getElementById('trio-mode-label'),
  modeHint: document.getElementById('trio-mode-hint'),
  modeActions: document.getElementById('trio-mode-actions'),
};

const shareElements = {
  bar: document.getElementById('share-bar'),
  openButton: document.getElementById('share-open'),
  layer: document.getElementById('share-layer'),
  card: document.getElementById('share-card'),
  closeButton: document.getElementById('share-close'),
  backdrop: document.getElementById('share-backdrop'),
  hint: document.getElementById('share-hint'),
  feedback: document.getElementById('share-feedback'),
  linksContainer: document.getElementById('share-links'),
  copyButton: document.getElementById('share-copy'),
  qrButton: document.getElementById('share-show-qr'),
  modal: document.getElementById('share-qr-modal'),
  modalImage: document.getElementById('share-qr-image'),
  modalUrl: document.getElementById('share-qr-url'),
  modalClose: document.getElementById('share-qr-close'),
  emailForm: document.getElementById('share-email'),
  emailInput: document.getElementById('share-email-input'),
  emailFeedback: document.getElementById('share-email-feedback'),
};

const TRIO_SIZE = 4;
const WIN_LENGTH = 3;
const BOARD_CELLS = TRIO_SIZE * TRIO_SIZE;
const WINNING_COMBOS = buildWinningCombos();
const SOFT_TASKS = [
  'Zrób partnerowi/partnerce 30-sekundowy masaż karku.',
  'Powiedz partnerowi/partnerce 3 rzeczy, które w nim/niej uwielbiasz.',
  'Przytul partnera/partnerkę przez pełne 20 sekund.',
  'Pocałuj partnera/partnerkę w szyję.',
  'Usiądź na kolanach partnera/partnerki przez 30 sekund.',
  'Zrób partnerowi/partnerce delikatny masaż dłoni.',
  'Szepnij partnerowi/partnerce coś miłego do ucha.',
  'Pocałuj partnera/partnerkę w usta tak, jak chcesz.',
  'Połóż dłoń na miejscu ciała partnera/partnerki, które on/ona wybierze.',
  'Powiedz jedną fantazję, którą chciał(a)byś kiedyś spróbować.',
  'Pogłaszcz partnera/partnerkę po plecach przez 20 sekund.',
  'Powiedz partnerowi/partnerce, co najbardziej Cię w nim/niej pociąga.',
  'Daj partnerowi/partnerce „pocałunek w ciemno” — gdziekolwiek wybierze.',
  'Patrzcie sobie w oczy przez 15 sekund bez słów.',
  'Zrób partnerowi/partnerce masaż głowy.',
  'Zadaj partnerowi/partnerce jedno pytanie, które zawsze bałeś/aś się zadać.',
  'Przytul partnera/partnerkę od tyłu przez 15 sekund.',
  'Powiedz partnerowi/partnerce, co najbardziej lubisz w jego/jej dotyku.',
  'Pocałuj dłoń partnera/partnerki.',
  'Ułóżcie dłonie na sobie i nie odrywajcie ich przez 20 sekund.',
];

const EXTREME_TASKS = [
  'Szepcz erotyczną historię do ucha partnera/partnerki przez 15 sekund.',
  'Przyciśnij ciało do partnera/partnerki i poruszaj biodrami rytmicznie przez 30 sekund.',
  'Delikatnie masuj sutki partnera/partnerki palcami przez 20 sekund.',
  'Namiętnie całuj szyję partnera/partnerki, ssąc lekko przez 30 sekund.',
  'Prowadź językiem po dekolcie partnera/partnerki, schodząc niżej przez 15 sekund.',
  'Wsuń dłoń pod koszulkę i pieść sutek partnera/partnerki okrężnymi ruchami.',
  'Całuj dekolt partnera/partnerki, schodząc niżej z każdym pocałunkiem przez 25 sekund.',
  'Całuj wewnętrzne uda partnera/partnerki, zbliżając się do intymnych miejsc.',
  'Ssij delikatnie palec partnera/partnerki, patrząc mu w oczy przez 20 sekund.',
  'Masuj pośladki partnera/partnerki z czułością przez 25 sekund.',
  'Pocieraj krocze partnera/partnerki dłonią przez materiał 15 sekund.',
  'Gryź lekko dolną wargę partnera/partnerki, ciągnąc ją zębami z namiętnością.',
  'Liż ucha partnera, szepcząc mu miłosne słowa przez 20 sekund.',
  'Włóż rękę do bielizny i delikatnie dotykaj najczulszych miejsc partnera/partnerki.',
  'Masuj jądra lub łechtaczkę partnera/partnerki powoli i kusząco przez 20 sekund.',
  'Rozsuń nogi partnera/partnerki i całuj wewnętrzną stronę ud przez 25 sekund.',
  'Prowadź palcem po kręgosłupie partnera/partnerki w dół, aż do pośladków przez 20 sekund.',
  'Namiętnie całuj usta partnera/partnerki, wsuwając język przez 20 sekund.',
  'Delikatnie szczyp sutki partnera/partnerki, zwiększając intensywność stopniowo.',
  'Liż okolice pępka partnera, schodząc coraz niżej przez 15 sekund.',
  'Masuj krocze partnera/partnerki przez spodnie, budując napięcie powolnymi ruchami.',
  'Wsuń palec do ust partnera/partnerki i pozwól mu/jej ssać go z pasją.',
  'Klep lekko pośladki partnera/partnerki, mieszając z masażem przez 20 sekund.',
  'Całuj krocze partnera/partnerki przez bieliznę przez 20 sekund.',
  'Pieść ramiona partnera/partnerki, schodząc dłońmi do piersi lub pośladków.',
  'Liż szyję partnera/partnerki od ucha do obojczyka.',
  'Delikatnie pociągnij za włosy partnera podczas namiętnego pocałunku.',
  'Masuj całe ciało partnera skupiając się na intymnych strefach przez 30 sekund.',
];

const shareLinkUrl = buildShareUrl();

let currentParticipants = [];
let gameState = null;
let pollHandle = null;
let lastSnapshotSignature = '';
let shareSheetController = null;
let shareFeedbackTimer = null;
let isCurrentUserHost = false;

renderBoardSkeleton();
bindEvents();

shareSheetController = initializeShareSheet(shareElements);
initializeShareChannels();
initializeShareEmailForm();
updateShareVisibility();

init();

async function init() {
  await loadInitialState();
  startRealtimeBridge();
}

async function loadInitialState() {
  const snapshot = await requestBoardSnapshot();
  if (snapshot) {
    applySnapshot(snapshot);
  }
}

function applySnapshot(snapshot) {
  const participants = normalizeParticipants(snapshot.participants);
  currentParticipants = participants;
  isCurrentUserHost = Boolean(snapshot.self?.is_host);
  elements.roomLabel.textContent = roomKey ? `Pokój ${roomKey}` : '';

  const state = snapshot.state && typeof snapshot.state === 'object' ? snapshot.state : {};
  ensureTrioState(state);
  gameState = state;

  ensureAssignments();
  render();

  lastSnapshotSignature = JSON.stringify({
    state: gameState,
    participants: currentParticipants.map((p) => p.id),
  });
}

function ensureTrioState(state) {
  if (!state.trioChallenge || typeof state.trioChallenge !== 'object') {
    state.trioChallenge = defaultTrioState();
    return;
  }
  const trio = state.trioChallenge;
  if (!Array.isArray(trio.board)) {
    trio.board = Array.from({ length: BOARD_CELLS }, () => '');
  } else if (trio.board.length !== BOARD_CELLS) {
    trio.board = Array.from({ length: BOARD_CELLS }, (_, index) => String(trio.board[index] || ''));
  }
  trio.board = trio.board.map((value) => (value === 'X' || value === 'O' ? value : ''));
  if (trio.currentSymbol !== 'O') {
    trio.currentSymbol = 'X';
  }
  if (!trio.assignments || typeof trio.assignments !== 'object') {
    trio.assignments = { x: '', o: '' };
  } else {
    trio.assignments.x = validParticipantId(trio.assignments.x);
    trio.assignments.o = validParticipantId(trio.assignments.o);
  }
  trio.winningLine = Array.isArray(trio.winningLine) ? trio.winningLine.map((value) => clampIndex(value)) : [];
  trio.challenge = normalizeChallenge(trio.challenge);
  trio.drawChallenges = Array.isArray(trio.drawChallenges)
    ? trio.drawChallenges.map((text) => String(text || '')).filter(Boolean).slice(0, 2)
    : [];
  trio.mode = trio.mode === 'extreme' ? 'extreme' : 'soft';
  trio.round = Number.isInteger(trio.round) && trio.round > 0 ? trio.round : 1;
  trio.lastMoveBy = validParticipantId(trio.lastMoveBy);
  trio.updatedAt = String(trio.updatedAt || '');
}

function defaultTrioState() {
  return {
    board: Array.from({ length: BOARD_CELLS }, () => ''),
    currentSymbol: 'X',
    assignments: { x: '', o: '' },
    winner: null,
    winningLine: [],
    challenge: null,
    drawChallenges: [],
    mode: 'soft',
    round: 1,
    lastMoveBy: '',
    updatedAt: '',
  };
}

function normalizeChallenge(challenge) {
  if (!challenge || typeof challenge !== 'object') {
    return null;
  }
  const type = challenge.type === 'draw' ? 'draw' : 'single';
  const assignedSymbol = challenge.assignedSymbol === 'O' ? 'O' : 'X';
  const tasks = Array.isArray(challenge.tasks)
    ? challenge.tasks.map((text) => String(text || '')).filter(Boolean)
    : [];
  if (!tasks.length) {
    return null;
  }
  return {
    type,
    assignedSymbol,
    tasks: tasks.slice(0, type === 'draw' ? 2 : 1),
  };
}

function render() {
  renderPlayers();
  renderBoard();
  renderMode();
  renderResult();
  updateShareVisibility();
}

function renderPlayers() {
  if (!elements.playersList) {
    return;
  }
  const trio = getTrioState();
  const assignments = trio.assignments || { x: '', o: '' };
  const items = [
    { symbol: 'X', label: 'Partner 1 (X)', playerId: assignments.x },
    { symbol: 'O', label: 'Partner 2 (O)', playerId: assignments.o },
  ];

  elements.playersList.innerHTML = '';
  items.forEach((slot) => {
    const li = document.createElement('li');
    li.className = 'trio-player';
    const player = currentParticipants.find((entry) => entry.id === slot.playerId);
    const name = player ? player.name : 'Puste miejsce';
    li.innerHTML = `
      <div class="trio-player__symbol" data-symbol="${slot.symbol}">${slot.symbol}</div>
      <div>
        <p class="trio-player__label">${slot.label}</p>
        <p class="trio-player__name">${name}</p>
      </div>
    `;
    elements.playersList.appendChild(li);
  });

  const activeCount = currentParticipants.length;
  if (elements.waitingHint) {
    elements.waitingHint.hidden = activeCount >= 2;
  }
  if (elements.turnLabel) {
    if (trio.winner) {
      const winnerName = symbolName(trio.winner);
      elements.turnLabel.textContent = winnerName ? `${winnerName} wygrał(a)!` : 'Gra zakończona.';
    } else if (activeCount < 2) {
      elements.turnLabel.textContent = 'Czekamy na graczy…';
    } else {
      const symbolOwner = symbolName(trio.currentSymbol);
      elements.turnLabel.textContent = symbolOwner
        ? `Teraz ruch: ${symbolOwner} (${trio.currentSymbol})`
        : 'Kto zaczyna?';
    }
  }
}

function renderBoard() {
  if (!elements.board) {
    return;
  }
  const trio = getTrioState();
  const cells = elements.board.querySelectorAll('[data-index]');
  cells.forEach((cell) => {
    const index = Number(cell.dataset.index);
    const value = trio.board[index] || '';
    const symbol = cell.querySelector('.trio-cell__symbol');
    if (symbol) {
      symbol.textContent = value;
    }
    cell.setAttribute('aria-label', value ? `Pole z symbolem ${value}` : 'Puste pole planszy');
    cell.dataset.filled = value ? 'true' : 'false';
    cell.classList.toggle('trio-cell--x', value === 'X');
    cell.classList.toggle('trio-cell--o', value === 'O');
    cell.classList.toggle('trio-cell--winner', Array.isArray(trio.winningLine) && trio.winningLine.includes(index));
  });

  const canMove = canCurrentUserMove();
  if (elements.moveHint) {
    if (trio.winner) {
      elements.moveHint.textContent = 'Kliknij „Zacznij nową grę”, żeby rozpocząć kolejną rundę.';
    } else if (canMove) {
      elements.moveHint.textContent = 'Wybierz dowolne wolne pole i postaw swój symbol.';
    } else if (currentParticipants.length < 2) {
      elements.moveHint.textContent = 'Poczekaj, aż partner dołączy do pokoju.';
    } else {
      const owner = symbolName(trio.currentSymbol);
      elements.moveHint.textContent = owner ? `Ruch: ${owner}.` : 'Czekamy na kolejny ruch.';
    }
  }

  if (elements.resetButton) {
    elements.resetButton.disabled = !trio.winner;
  }
}

function renderMode() {
  if (!elements.modeCard) {
    return;
  }
  const trio = getTrioState();
  if (isCurrentUserHost) {
    elements.modeCard.hidden = false;
    if (elements.modeActions) {
      elements.modeActions.hidden = false;
    }
    if (elements.modeLabel) {
      elements.modeLabel.textContent = trio.mode === 'extreme' ? 'Wybrano: Extreme 😈' : 'Wybrano: Soft 😌';
    }
    if (elements.modeHint) {
      elements.modeHint.textContent = 'Możesz zmienić tryb do czasu pierwszego ruchu w rundzie.';
    }
    elements.modeActions?.querySelectorAll('button').forEach((button) => {
      const { mode } = button.dataset;
      const isActive = mode === trio.mode;
      button.classList.toggle('btn--primary', isActive);
      button.classList.toggle('btn--ghost', !isActive);
      button.disabled = Boolean(trio.winner) ? false : Boolean(trio.board.some((value) => value));
    });
  } else {
    elements.modeCard.hidden = false;
    if (elements.modeLabel) {
      elements.modeLabel.textContent = 'Tryb ukryty';
    }
    if (elements.modeHint) {
      elements.modeHint.textContent = 'Gospodarz wybrał tryb. Poznasz go po zakończeniu rundy.';
    }
    if (elements.modeActions) {
      elements.modeActions.hidden = true;
    }
  }
}

function renderResult() {
  if (!elements.resultSection || !gameState) {
    return;
  }
  const trio = getTrioState();
  if (!trio.winner) {
    elements.resultSection.hidden = true;
    elements.challengesList.innerHTML = '';
    return;
  }
  elements.resultSection.hidden = false;
  const winnerName = symbolName(trio.winner);
  if (trio.winner === 'draw') {
    elements.resultTitle.textContent = 'Remis!';
    elements.resultText.textContent = 'Plansza jest pełna. Wykonajcie po jednym zadaniu.';
    renderChallenges(trio.drawChallenges || []);
  } else {
    elements.resultTitle.textContent = winnerName ? `${winnerName} wygrał(a)!` : 'Wygrana';
    const loserSymbol = trio.winner === 'X' ? 'O' : 'X';
    const loserName = symbolName(loserSymbol);
    elements.resultText.textContent = loserName
      ? `${loserName} losuje mini-wyzwanie.`
      : 'Przegrany losuje mini-wyzwanie.';
    const tasks = trio.challenge?.tasks || [];
    renderChallenges(tasks);
  }
}

function renderChallenges(tasks) {
  if (!elements.challengesList) {
    return;
  }
  elements.challengesList.innerHTML = '';
  tasks.forEach((task) => {
    const item = document.createElement('li');
    item.textContent = task;
    elements.challengesList.appendChild(item);
  });
}

function renderBoardSkeleton() {
  if (!elements.board) {
    return;
  }
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < BOARD_CELLS; index += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'trio-cell';
    button.dataset.index = String(index);
    button.setAttribute('aria-label', 'Puste pole planszy');
    button.innerHTML = '<span class="trio-cell__symbol" aria-hidden="true"></span>';
    fragment.appendChild(button);
  }
  elements.board.innerHTML = '';
  elements.board.appendChild(fragment);
}

function bindEvents() {
  elements.board?.addEventListener('click', handleCellClick);
  elements.resetButton?.addEventListener('click', handleReset);
  elements.modeActions?.addEventListener('click', handleModeChange);
  shareElements.copyButton?.addEventListener('click', copyShareLink);
  shareElements.qrButton?.addEventListener('click', openQrModal);
  shareElements.modalClose?.addEventListener('click', closeQrModal);
}

function handleCellClick(event) {
  const target = event.target instanceof HTMLElement ? event.target.closest('.trio-cell') : null;
  if (!target) {
    return;
  }
  const index = Number(target.dataset.index);
  if (!Number.isInteger(index)) {
    return;
  }
  if (!canCurrentUserMove()) {
    return;
  }
  const trio = getTrioState();
  if (trio.board[index]) {
    return;
  }
  const nextState = cloneState(gameState);
  const nextTrio = nextState.trioChallenge;
  nextTrio.board[index] = nextTrio.currentSymbol;
  nextTrio.lastMoveBy = localPlayerId;
  nextTrio.updatedAt = new Date().toISOString();
  const victory = detectVictory(nextTrio.board, nextTrio.currentSymbol);
  if (victory) {
    nextTrio.winner = nextTrio.currentSymbol;
    nextTrio.winningLine = victory;
    nextTrio.challenge = {
      type: 'single',
      assignedSymbol: nextTrio.currentSymbol === 'X' ? 'O' : 'X',
      tasks: [drawTask(nextTrio.mode)],
    };
    nextTrio.drawChallenges = [];
  } else if (nextTrio.board.every(Boolean)) {
    nextTrio.winner = 'draw';
    nextTrio.winningLine = [];
    nextTrio.challenge = null;
    nextTrio.drawChallenges = [drawTask(nextTrio.mode), drawTask(nextTrio.mode, true)];
  } else {
    nextTrio.currentSymbol = nextTrio.currentSymbol === 'X' ? 'O' : 'X';
  }
  persistState(nextState);
  applySnapshot({ state: nextState, participants: currentParticipants, self: { is_host: isCurrentUserHost } });
}

function handleReset() {
  if (!gameState) {
    return;
  }
  const nextState = cloneState(gameState);
  nextState.trioChallenge.board = Array.from({ length: BOARD_CELLS }, () => '');
  nextState.trioChallenge.currentSymbol = 'X';
  nextState.trioChallenge.winner = null;
  nextState.trioChallenge.winningLine = [];
  nextState.trioChallenge.challenge = null;
  nextState.trioChallenge.drawChallenges = [];
  nextState.trioChallenge.round += 1;
  nextState.trioChallenge.updatedAt = new Date().toISOString();
  persistState(nextState);
  applySnapshot({ state: nextState, participants: currentParticipants, self: { is_host: isCurrentUserHost } });
}

function handleModeChange(event) {
  if (!isCurrentUserHost) {
    return;
  }
  const button = event.target instanceof HTMLElement ? event.target.closest('button[data-mode]') : null;
  if (!button) {
    return;
  }
  const mode = button.dataset.mode === 'extreme' ? 'extreme' : 'soft';
  const trio = getTrioState();
  if (trio.mode === mode) {
    return;
  }
  if (trio.board.some((value) => value)) {
    return;
  }
  const nextState = cloneState(gameState);
  nextState.trioChallenge.mode = mode;
  persistState(nextState);
  applySnapshot({ state: nextState, participants: currentParticipants, self: { is_host: isCurrentUserHost } });
}

function canCurrentUserMove() {
  const trio = getTrioState();
  if (!trio || trio.winner) {
    return false;
  }
  if (currentParticipants.length < 2) {
    return false;
  }
  const assignments = trio.assignments || {};
  const mySymbol = assignments.x === localPlayerId ? 'X' : assignments.o === localPlayerId ? 'O' : '';
  if (!mySymbol) {
    return false;
  }
  return mySymbol === trio.currentSymbol;
}

function detectVictory(board, symbol) {
  for (const combo of WINNING_COMBOS) {
    if (combo.every((index) => board[index] === symbol)) {
      return combo;
    }
  }
  return null;
}

function buildWinningCombos() {
  const combos = [];
  for (let row = 0; row < TRIO_SIZE; row += 1) {
    for (let col = 0; col <= TRIO_SIZE - WIN_LENGTH; col += 1) {
      combos.push([
        indexFromCoords(row, col),
        indexFromCoords(row, col + 1),
        indexFromCoords(row, col + 2),
      ]);
    }
  }
  for (let col = 0; col < TRIO_SIZE; col += 1) {
    for (let row = 0; row <= TRIO_SIZE - WIN_LENGTH; row += 1) {
      combos.push([
        indexFromCoords(row, col),
        indexFromCoords(row + 1, col),
        indexFromCoords(row + 2, col),
      ]);
    }
  }
  for (let row = 0; row <= TRIO_SIZE - WIN_LENGTH; row += 1) {
    for (let col = 0; col <= TRIO_SIZE - WIN_LENGTH; col += 1) {
      combos.push([
        indexFromCoords(row, col),
        indexFromCoords(row + 1, col + 1),
        indexFromCoords(row + 2, col + 2),
      ]);
      combos.push([
        indexFromCoords(row, col + WIN_LENGTH - 1),
        indexFromCoords(row + 1, col + WIN_LENGTH - 2),
        indexFromCoords(row + 2, col + WIN_LENGTH - 3),
      ]);
    }
  }
  return combos;
}

function indexFromCoords(row, col) {
  return row * TRIO_SIZE + col;
}

function drawTask(mode, allowDuplicate = false) {
  const pool = mode === 'extreme' ? EXTREME_TASKS : SOFT_TASKS;
  if (!pool.length) {
    return 'Wykonaj czułe zadanie dla partnera.';
  }
  const available = allowDuplicate ? pool : pool.filter(Boolean);
  const pick = Math.floor(Math.random() * available.length);
  return available[pick];
}

function symbolName(symbol) {
  const trio = getTrioState();
  const assignments = trio.assignments || {};
  if (symbol === 'X' && assignments.x) {
    return participantName(assignments.x);
  }
  if (symbol === 'O' && assignments.o) {
    return participantName(assignments.o);
  }
  return '';
}

function participantName(id) {
  const participant = currentParticipants.find((entry) => entry.id === id);
  return participant ? participant.name : '';
}

function ensureAssignments() {
  if (!gameState) {
    return;
  }
  const trio = getTrioState();
  const assignments = trio.assignments || { x: '', o: '' };
  let changed = false;
  if (isCurrentUserHost && localPlayerId && !assignments.x) {
    assignments.x = localPlayerId;
    changed = true;
  }
  if (!assignments.o) {
    const candidate = currentParticipants.find((entry) => entry.id !== assignments.x);
    if (candidate) {
      assignments.o = candidate.id;
      changed = true;
    }
  } else {
    const stillActive = currentParticipants.some((entry) => entry.id === assignments.o);
    if (!stillActive) {
      assignments.o = '';
      changed = true;
    }
  }
  trio.assignments = assignments;
  if (changed) {
    persistState(gameState);
  }
}

function getTrioState() {
  if (!gameState) {
    gameState = { trioChallenge: defaultTrioState() };
  }
  if (!gameState.trioChallenge) {
    gameState.trioChallenge = defaultTrioState();
  }
  return gameState.trioChallenge;
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state || {}));
}

function persistState(state) {
  if (!roomKey || !localPlayerId) {
    return;
  }
  postJson('api/board_sync.php', {
    room_key: roomKey,
    participant_id: localPlayerId,
    state,
  }).catch((error) => {
    console.error('Nie udało się zapisać stanu TRIO Challenge.', error);
  });
}

function requestBoardSnapshot() {
  if (!roomKey || !localPlayerId) {
    return null;
  }
  const query = new URLSearchParams({
    room_key: roomKey,
    participant_id: localPlayerId,
  });
  return getJson(`api/board_state.php?${query.toString()}`)
    .then((payload) => {
      if (!payload || !payload.ok) {
        return null;
      }
      return {
        state: payload.board_state || {},
        participants: payload.participants || [],
        self: payload.self || null,
      };
    })
    .catch((error) => {
      console.error('Nie udało się pobrać stanu TRIO Challenge.', error);
      return null;
    });
}

function startRealtimeBridge() {
  if (pollHandle) {
    window.clearTimeout(pollHandle);
    pollHandle = null;
  }
  const poll = async () => {
    try {
      const snapshot = await requestBoardSnapshot();
      if (snapshot) {
        const signature = JSON.stringify({
          state: snapshot.state,
          participants: (snapshot.participants || []).map((entry) => entry.id),
        });
        if (signature !== lastSnapshotSignature) {
          applySnapshot(snapshot);
        }
      }
    } finally {
      pollHandle = window.setTimeout(poll, 2500);
    }
  };
  poll();
}

function normalizeParticipants(list) {
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .map((item) => ({
      id: String(item?.id ?? item?.participant_id ?? ''),
      name: String(item?.display_name ?? item?.name ?? '').trim() || 'Gracz',
    }))
    .filter((entry) => entry.id);
}

function clampIndex(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) {
    return 0;
  }
  if (numeric < 0) {
    return 0;
  }
  if (numeric >= BOARD_CELLS) {
    return BOARD_CELLS - 1;
  }
  return numeric;
}

function validParticipantId(value) {
  const text = String(value || '').trim();
  return text && text !== '0' ? text : '';
}

function buildShareUrl() {
  if (!roomKey) {
    return '';
  }
  const url = new URL(window.location.href);
  url.searchParams.set('room_key', roomKey);
  url.searchParams.delete('pid');
  url.searchParams.delete('name');
  return url.toString();
}

function initializeShareSheet(elementsMap) {
  if (!elementsMap.bar || !elementsMap.openButton || !elementsMap.layer || !elementsMap.card) {
    return null;
  }
  function open() {
    elementsMap.layer.hidden = false;
    elementsMap.layer.dataset.open = 'true';
    elementsMap.layer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('share-layer-open');
    elementsMap.openButton.setAttribute('aria-expanded', 'true');
    elementsMap.card.focus();
  }
  function close() {
    elementsMap.layer.dataset.open = 'false';
    elementsMap.layer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('share-layer-open');
    elementsMap.openButton.setAttribute('aria-expanded', 'false');
    window.setTimeout(() => {
      elementsMap.layer.hidden = true;
    }, 300);
  }
  elementsMap.openButton.addEventListener('click', () => {
    elementsMap.layer.hidden = false;
    open();
  });
  elementsMap.closeButton?.addEventListener('click', close);
  elementsMap.backdrop?.addEventListener('click', close);
  return { open, close };
}

function initializeShareChannels() {
  if (!shareElements.linksContainer) {
    return;
  }
  const list = [
    { label: 'Wyślij na WhatsApp', url: `https://wa.me/?text=${encodeURIComponent(shareLinkUrl)}` },
    { label: 'Wyślij na Messengerze', url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLinkUrl)}` },
    { label: 'Wyślij SMS', url: `sms:?body=${encodeURIComponent(shareLinkUrl)}` },
  ];
  shareElements.linksContainer.innerHTML = '';
  list.forEach((item) => {
    const link = document.createElement('a');
    link.className = 'btn btn--ghost share-channel';
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = item.label;
    shareElements.linksContainer.appendChild(link);
  });
}

function initializeShareEmailForm() {
  if (!shareElements.emailForm) {
    return;
  }
  shareElements.emailForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = shareElements.emailInput?.value.trim();
    if (!email) {
      showShareEmailFeedback('Podaj adres e-mail.', true);
      return;
    }
    try {
      const submitButton = shareElements.emailForm.querySelector('button[type="submit"]');
      if (submitButton) {
        submitButton.disabled = true;
      }
      const response = await postJson(EMAIL_ENDPOINT, {
        email,
        room_key: roomKey,
        subject: SHARE_EMAIL_SUBJECT,
        link: shareLinkUrl,
      });
      if (!response || !response.ok) {
        throw new Error(response?.error || 'Nie udało się wysłać wiadomości.');
      }
      showShareEmailFeedback('Wysłano wiadomość.');
      shareElements.emailInput.value = '';
    } catch (error) {
      console.error(error);
      showShareEmailFeedback(error.message || 'Nie udało się wysłać wiadomości.', true);
    } finally {
      const submitButton = shareElements.emailForm.querySelector('button[type="submit"]');
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}

function showShareEmailFeedback(message, isError = false) {
  if (!shareElements.emailFeedback) {
    return;
  }
  shareElements.emailFeedback.hidden = false;
  shareElements.emailFeedback.textContent = message;
  shareElements.emailFeedback.dataset.tone = isError ? 'error' : 'success';
  window.setTimeout(() => {
    shareElements.emailFeedback.hidden = true;
  }, 4000);
}

function updateShareVisibility() {
  if (!shareElements.bar) {
    return;
  }
  const shouldShow = currentParticipants.length < 2;
  shareElements.bar.hidden = !shouldShow;
}

async function copyShareLink() {
  if (!shareLinkUrl) {
    return;
  }
  let message = 'Skopiowano link do pokoju.';
  let isError = false;
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(shareLinkUrl);
    } else {
      throw new Error('Clipboard API unavailable');
    }
  } catch (error) {
    console.warn('Clipboard copy failed', error);
    isError = true;
    message = 'Skopiuj link ręcznie z wyświetlonego okna.';
    window.prompt('Skopiuj link do pokoju', shareLinkUrl);
  }
  showShareFeedback(message, isError);
}

function showShareFeedback(message, isError = false) {
  if (!shareElements.feedback) {
    return;
  }
  shareElements.feedback.hidden = false;
  shareElements.feedback.textContent = message;
  shareElements.feedback.dataset.tone = isError ? 'error' : 'success';
  if (shareFeedbackTimer) {
    window.clearTimeout(shareFeedbackTimer);
  }
  shareFeedbackTimer = window.setTimeout(() => {
    shareElements.feedback.hidden = true;
    shareElements.feedback.textContent = '';
    delete shareElements.feedback.dataset.tone;
  }, 4000);
}

function openQrModal() {
  if (!shareElements.modal || !shareElements.modalImage || !shareElements.modalUrl) {
    return;
  }
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(shareLinkUrl)}`;
  shareElements.modalImage.src = qrSrc;
  shareElements.modalUrl.href = shareLinkUrl;
  shareElements.modal.hidden = false;
  shareElements.modal.setAttribute('aria-hidden', 'false');
}

function closeQrModal() {
  if (!shareElements.modal) {
    return;
  }
  shareElements.modal.hidden = true;
  shareElements.modal.setAttribute('aria-hidden', 'true');
}
