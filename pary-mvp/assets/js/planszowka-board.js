import { boardFields, finishIndex } from './board-data.js';

const params = new URLSearchParams(window.location.search);
const roomKey = (params.get('room_key') || '').toUpperCase();
const localPlayerId = params.get('pid') || '';
const localPlayerName = (params.get('name') || '').trim() || 'Ty';

if (!roomKey || !localPlayerId) {
  window.location.replace('planszowa.html');
}

const colorPalette = ['rose', 'mint', 'violet', 'sun', 'sea'];
const fallbackStorageKey = `momenty.planszowka.state.${roomKey}`;

const elements = {
  roomCode: document.getElementById('planszowka-room-code'),
  turnLabel: document.getElementById('planszowka-turn-label'),
  waitHint: document.getElementById('planszowka-wait-hint'),
  players: document.getElementById('planszowka-players'),
  diceButton: document.getElementById('planszowka-roll'),
  lastRoll: document.getElementById('planszowka-last-roll'),
  taskTitle: document.getElementById('planszowka-task-title'),
  taskBody: document.getElementById('planszowka-task-body'),
  taskActions: document.getElementById('planszowka-task-actions'),
  board: document.getElementById('planszowka-board'),
  finishPanel: document.getElementById('planszowka-finish'),
  finishScores: document.getElementById('planszowka-finish-scores'),
  resetButton: document.getElementById('planszowka-reset'),
  infoBanner: document.getElementById('planszowka-info'),
  taskNotice: document.getElementById('planszowka-task-notice'),
};

let gameState = createEmptyState();
let toastTimer = null;

init();

function init() {
  if (elements.roomCode) {
    elements.roomCode.textContent = roomKey;
  }

  renderBoardSkeleton();
  bindEvents();
  setupRealtimeBridge();

  const stored = loadFallbackState();
  if (stored) {
    applyState(stored, { skipBroadcast: true });
  }

  ensureLocalPlayer();
  render();
}

function createEmptyState() {
  return {
    players: {},
    turnOrder: [],
    positions: {},
    hearts: {},
    jail: {},
    notice: '',
    currentTurn: null,
    awaitingConfirmation: null,
    nextTurn: null,
    lastRoll: null,
    focusField: 0,
    finished: false,
    winnerId: null,
    version: 0,
    history: [],
  };
}

function bindEvents() {
  elements.diceButton?.addEventListener('click', handleRollRequest);
  elements.resetButton?.addEventListener('click', () => {
    if (!confirm('Zresetować planszę i zacząć od nowa?')) {
      return;
    }
    updateState((draft) => {
      draft.positions = {};
      draft.hearts = {};
      draft.jail = {};
      draft.notice = '';
      draft.currentTurn = draft.turnOrder[0] || null;
      draft.awaitingConfirmation = null;
      draft.nextTurn = null;
      draft.lastRoll = null;
      draft.focusField = 0;
      draft.finished = false;
      draft.winnerId = null;
      draft.history = [];
      draft.turnOrder.forEach((id) => {
        draft.positions[id] = 0;
        draft.hearts[id] = 0;
        draft.jail[id] = 0;
      });
    });
  });

  elements.taskActions?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest('button[data-action]');
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const action = button.dataset.action;
    if (action === 'confirm') {
      resolveTaskResult(true);
    } else if (action === 'skip') {
      resolveTaskResult(false);
    }
  });
}

function setupRealtimeBridge() {
  onGameStateFromServer((incoming) => {
    if (!incoming) {
      return;
    }
    applyState(incoming, { skipBroadcast: true });
  });
}

function ensureLocalPlayer() {
  const existing = gameState.players[localPlayerId];
  if (existing) {
    if (existing.name !== localPlayerName) {
      updateState((draft) => {
        const player = draft.players[localPlayerId];
        if (player) {
          player.name = localPlayerName;
        }
      });
    }
    return;
  }

  updateState((draft) => {
    const usedColors = new Set(Object.values(draft.players).map((player) => player.color));
    const color = colorPalette.find((item) => !usedColors.has(item)) || colorPalette[0];
    draft.players[localPlayerId] = {
      id: localPlayerId,
      name: localPlayerName,
      color,
    };
    draft.turnOrder.push(localPlayerId);
    draft.positions[localPlayerId] = 0;
    draft.hearts[localPlayerId] = 0;
    draft.jail[localPlayerId] = 0;
    if (!draft.currentTurn) {
      draft.currentTurn = localPlayerId;
    }
  });
}

function handleRollRequest() {
  if (!canCurrentPlayerRoll()) {
    displayInfo('Teraz ruch partnera 😉');
    return;
  }

  updateState((draft) => {
    const roll = Math.floor(Math.random() * 6) + 1;
    const playerId = localPlayerId;
    const startIndex = draft.positions[playerId] ?? 0;
    let targetIndex = Math.min(startIndex + roll, finishIndex);
    const steps = [];

    const playerName = draft.players[playerId]?.name || 'Gracz';
    steps.push(`${playerName} wyrzucił(a) ${roll}.`);

    const specialResult = resolveSpecialTiles(draft, playerId, targetIndex);
    targetIndex = specialResult.index;
    steps.push(...specialResult.messages);

    draft.positions[playerId] = targetIndex;
    draft.focusField = targetIndex;
    draft.lastRoll = {
      value: roll,
      playerId,
      from: startIndex,
      to: targetIndex,
    };

    if (specialResult.notice) {
      draft.notice = specialResult.notice;
    } else {
      draft.notice = '';
    }

    if (targetIndex >= finishIndex) {
      draft.finished = true;
      draft.winnerId = playerId;
      draft.currentTurn = null;
      draft.awaitingConfirmation = null;
      draft.nextTurn = null;
      draft.notice = '';
      steps.push(`${playerName} dotarł(a) na metę!`);
    } else {
      const field = boardFields[targetIndex];
      if (field?.type === 'task') {
        draft.awaitingConfirmation = {
          playerId,
          fieldIndex: targetIndex,
        };
        draft.nextTurn = determineNextTurn(draft, playerId);
      } else {
        draft.awaitingConfirmation = null;
        draft.currentTurn = determineNextTurn(draft, playerId);
        draft.nextTurn = null;
      }
    }

    steps.forEach((message) => addHistoryEntry(draft, message));
  });
}

function resolveSpecialTiles(draft, playerId, startIndex) {
  let index = startIndex;
  const messages = [];
  let notice = '';
  const maxLoops = 5;
  let loopGuard = 0;

  while (loopGuard < maxLoops) {
    const field = boardFields[index];
    if (!field) {
      break;
    }
    if (field.type === 'moveForward') {
      index = Math.min(index + 5, finishIndex);
      messages.push('Przemieszczasz się 5 pól do przodu.');
      loopGuard += 1;
      continue;
    }
    if (field.type === 'moveBack') {
      index = Math.max(index - 4, 0);
      messages.push('Cofasz się o 4 pola.');
      loopGuard += 1;
      continue;
    }
    if (field.type === 'gotoNearestSafe') {
      const safeIndex = findPreviousSafeField(index);
      if (safeIndex !== index) {
        index = safeIndex;
        messages.push('Wracasz na najbliższe bezpieczne pole.');
        loopGuard += 1;
        continue;
      }
    }
    if (field.type === 'jail') {
      draft.jail[playerId] = 2;
      messages.push('Lądujesz w więzieniu – pauzujesz dwie kolejne tury.');
    }
    if (field.type === 'safe') {
      notice = 'Bezpieczne pole – chwilka oddechu 😌';
    }
    break;
  }

  return { index, messages, notice };
}

function findPreviousSafeField(startIndex) {
  for (let i = startIndex; i >= 0; i -= 1) {
    const field = boardFields[i];
    if (field?.type === 'safe') {
      return i;
    }
  }
  return startIndex;
}

function determineNextTurn(draft, currentId) {
  if (!Array.isArray(draft.turnOrder) || draft.turnOrder.length === 0) {
    return null;
  }
  if (draft.turnOrder.length === 1) {
    return currentId;
  }
  const order = draft.turnOrder;
  const startIndex = Math.max(order.indexOf(currentId), 0);
  for (let offset = 1; offset <= order.length; offset += 1) {
    const candidate = order[(startIndex + offset) % order.length];
    if (!candidate) {
      continue;
    }
    const jailTurns = draft.jail[candidate] ?? 0;
    if (jailTurns > 0) {
      draft.jail[candidate] = Math.max(0, jailTurns - 1);
      const name = draft.players[candidate]?.name || 'Gracz';
      addHistoryEntry(draft, `${name} pauzuje jeszcze ${draft.jail[candidate]} tur(y).`);
      continue;
    }
    return candidate;
  }
  return currentId;
}

function resolveTaskResult(completed) {
  const awaiting = gameState.awaitingConfirmation;
  if (!awaiting) {
    return;
  }
  if (awaiting.playerId === localPlayerId) {
    displayInfo('Poczekaj, aż partner zatwierdzi zadanie.');
    return;
  }

  updateState((draft) => {
    const { playerId, fieldIndex } = draft.awaitingConfirmation || {};
    if (!playerId) {
      return;
    }
    draft.awaitingConfirmation = null;
    const playerName = draft.players[playerId]?.name || 'Gracz';
    const field = boardFields[fieldIndex];
    if (completed) {
      draft.hearts[playerId] = (draft.hearts[playerId] ?? 0) + 1;
      addHistoryEntry(draft, `${playerName} zdobywa serduszko za zadanie "${field?.label || 'zadanie'}".`);
    } else {
      addHistoryEntry(draft, `${playerName} nie zdobywa serduszka za zadanie "${field?.label || 'zadanie'}".`);
    }
    draft.notice = '';
    const next = draft.nextTurn || determineNextTurn(draft, playerId);
    draft.currentTurn = next;
    draft.nextTurn = null;
  });
}

function addHistoryEntry(draft, message) {
  if (!draft.history) {
    draft.history = [];
  }
  draft.history.push({ message, timestamp: new Date().toISOString() });
  if (draft.history.length > 50) {
    draft.history = draft.history.slice(-50);
  }
}

function canCurrentPlayerRoll() {
  if (gameState.finished) {
    return false;
  }
  if (!gameState.currentTurn) {
    return false;
  }
  if (gameState.awaitingConfirmation) {
    return false;
  }
  if (gameState.turnOrder.length < 2) {
    return false;
  }
  return gameState.currentTurn === localPlayerId;
}

function applyState(newState, options = {}) {
  gameState = sanitizeState(newState);
  render();
  if (!options.skipBroadcast) {
    persistState(gameState);
  }
}

function updateState(mutator, options = {}) {
  const draft = sanitizeState(JSON.parse(JSON.stringify(gameState)));
  mutator(draft);
  draft.version = (draft.version || 0) + 1;
  gameState = sanitizeState(draft);
  render();
  if (options.broadcast !== false) {
    persistState(gameState);
  }
}

function sanitizeState(state) {
  const next = createEmptyState();
  if (state && typeof state === 'object') {
    next.players = { ...state.players };
    next.turnOrder = Array.isArray(state.turnOrder) ? [...state.turnOrder] : [];
    next.positions = { ...state.positions };
    next.hearts = { ...state.hearts };
    next.jail = { ...state.jail };
    next.notice = typeof state.notice === 'string' ? state.notice : '';
    next.currentTurn = state.currentTurn || null;
    next.awaitingConfirmation = state.awaitingConfirmation || null;
    next.nextTurn = state.nextTurn || null;
    next.lastRoll = state.lastRoll || null;
    next.focusField = typeof state.focusField === 'number' ? state.focusField : 0;
    next.finished = Boolean(state.finished);
    next.winnerId = state.winnerId || null;
    next.version = state.version || 0;
    next.history = Array.isArray(state.history) ? [...state.history] : [];
  }

  Object.values(next.players).forEach((player) => {
    if (!player.color) {
      player.color = colorPalette[0];
    }
    next.positions[player.id] = Math.max(0, next.positions[player.id] ?? 0);
    next.hearts[player.id] = Math.max(0, next.hearts[player.id] ?? 0);
    next.jail[player.id] = Math.max(0, next.jail[player.id] ?? 0);
  });

  next.turnOrder = next.turnOrder.filter((id) => Boolean(next.players[id]));
  Object.keys(next.positions).forEach((key) => {
    if (!next.players[key]) {
      delete next.positions[key];
    }
  });
  Object.keys(next.hearts).forEach((key) => {
    if (!next.players[key]) {
      delete next.hearts[key];
    }
  });
  Object.keys(next.jail).forEach((key) => {
    if (!next.players[key]) {
      delete next.jail[key];
    }
  });

  if (!next.currentTurn && next.turnOrder.length) {
    next.currentTurn = next.turnOrder[0];
  }

  return next;
}

function renderBoardSkeleton() {
  if (!elements.board) {
    return;
  }
  elements.board.innerHTML = '';
  boardFields.forEach((field) => {
    const numberLabel = field.type === 'start' ? 'Start' : field.type === 'finish' ? 'Meta' : field.index;
    const item = document.createElement('li');
    item.className = `board-field board-field--${field.type}`;
    item.dataset.index = String(field.index);
    item.innerHTML = `
      <div class="board-field__number">${numberLabel}</div>
      <div class="board-field__label">${field.label}</div>
      <div class="board-field__tokens" aria-hidden="true"></div>
    `;
    item.title = field.label;
    elements.board.appendChild(item);
  });
}

function render() {
  renderTurn();
  renderPlayers();
  renderDice();
  renderTaskCard();
  renderBoard();
  renderFinishPanel();
  renderInfo();
}

function renderTurn() {
  if (!elements.turnLabel || !elements.waitHint) {
    return;
  }
  if (gameState.finished) {
    elements.turnLabel.textContent = 'Gra zakończona';
    elements.waitHint.textContent = 'Rozpocznij nową rozgrywkę lub ustal zadanie dla przegranego.';
    return;
  }
  if (!gameState.currentTurn) {
    elements.turnLabel.textContent = 'Czekamy na graczy';
    elements.waitHint.textContent = 'Dołączcie w dwójkę, aby zacząć zabawę.';
    return;
  }
  const active = gameState.players[gameState.currentTurn];
  const viewer = gameState.players[localPlayerId];
  elements.turnLabel.textContent = active ? `Teraz ruch: ${active.name}` : 'Trwa ustalanie kolejki';
  if (gameState.awaitingConfirmation) {
    const confirmer = gameState.players[gameState.awaitingConfirmation.playerId];
    if (gameState.awaitingConfirmation.playerId === localPlayerId) {
      elements.waitHint.textContent = 'Poczekaj na potwierdzenie zadania przez partnera.';
    } else {
      elements.waitHint.textContent = `Zatwierdź zadanie dla ${confirmer?.name || 'partnera'}.`;
    }
    return;
  }
  if (viewer && viewer.id === gameState.currentTurn) {
    elements.waitHint.textContent = 'To Twoja kolej – rzuć kostką!';
  } else {
    elements.waitHint.textContent = 'Czekaj na ruch partnera.';
  }
}

function renderPlayers() {
  if (!elements.players) {
    return;
  }
  elements.players.innerHTML = '';
  const entries = gameState.turnOrder.map((id) => gameState.players[id]).filter(Boolean);
  if (!entries.length) {
    const info = document.createElement('p');
    info.className = 'players-empty';
    info.textContent = 'Zaproszenie partnera znajdziesz w poprzednim kroku gry.';
    elements.players.appendChild(info);
    return;
  }

  entries.forEach((player) => {
    const card = document.createElement('article');
    const isActive = gameState.currentTurn === player.id;
    card.className = `player-card player-card--${player.color}`;
    if (isActive) {
      card.classList.add('player-card--active');
    }
    const hearts = gameState.hearts[player.id] ?? 0;
    const position = gameState.positions[player.id] ?? 0;
    const jail = gameState.jail[player.id] ?? 0;
    card.innerHTML = `
      <header class="player-card__header">
        <span class="player-card__token">${player.name.slice(0, 1).toUpperCase()}</span>
        <div class="player-card__meta">
          <h3>${player.name}</h3>
          <p>Pole ${position}</p>
        </div>
        <span class="player-card__hearts" aria-label="Serduszka">❤️ ${hearts}</span>
      </header>
      <footer class="player-card__footer">
        ${jail > 0 ? `<span class="player-card__status">Pauzuje ${jail} tur</span>` : '<span class="player-card__status">Gotowy do gry</span>'}
      </footer>
    `;
    elements.players.appendChild(card);
  });
}

function renderDice() {
  if (!elements.diceButton || !elements.lastRoll) {
    return;
  }
  elements.diceButton.disabled = !canCurrentPlayerRoll();
  const roll = gameState.lastRoll;
  if (roll && roll.value) {
    const name = gameState.players[roll.playerId]?.name || 'Gracz';
    elements.lastRoll.textContent = `${name} wyrzucił(a) ${roll.value} i stoi na polu ${roll.to}.`;
  } else {
    elements.lastRoll.textContent = 'Jeszcze nikt nie rzucał kostką.';
  }
}

function renderTaskCard() {
  if (!elements.taskTitle || !elements.taskBody || !elements.taskActions || !elements.taskNotice) {
    return;
  }
  const awaiting = gameState.awaitingConfirmation;
  const focusIndex = awaiting?.fieldIndex ?? gameState.focusField ?? 0;
  const field = boardFields[focusIndex] || boardFields[0];
  const player = awaiting ? gameState.players[awaiting.playerId] : null;

  if (field) {
    elements.taskTitle.textContent = field.label;
  } else {
    elements.taskTitle.textContent = 'Wybierz pole na planszy';
  }

  if (field?.type === 'task') {
    elements.taskBody.textContent = 'Wykonajcie zadanie, a partner może nagrodzić Cię serduszkiem.';
  } else if (field?.type === 'safe') {
    elements.taskBody.textContent = 'Bezpieczne pole – złapcie oddech i przygotujcie się na kolejne wyzwanie.';
  } else if (field?.type === 'jail') {
    elements.taskBody.textContent = 'Pauzujesz dwie tury lub wykonujesz polecenia partnera przez minutę.';
  } else if (field?.type === 'moveForward') {
    elements.taskBody.textContent = 'Przesuń pionek o 5 pól do przodu i wykonaj nowe zadanie.';
  } else if (field?.type === 'moveBack') {
    elements.taskBody.textContent = 'Cofasz się o 4 pola i sprawdzasz nowe zadanie.';
  } else if (field?.type === 'gotoNearestSafe') {
    elements.taskBody.textContent = 'Wracasz na najbliższe bezpieczne pole.';
  } else if (field?.type === 'finish') {
    elements.taskBody.textContent = 'Meta! Wygrany wybiera zadanie dla przegranego.';
  } else {
    elements.taskBody.textContent = 'Rzućcie kostką i przesuwajcie pionki, aby odkryć kolejne zadania.';
  }

  if (awaiting) {
    const isReviewer = awaiting.playerId !== localPlayerId;
    elements.taskActions.hidden = !isReviewer;
    elements.taskNotice.hidden = isReviewer;
    elements.taskNotice.textContent = isReviewer
      ? ''
      : 'Czekamy na potwierdzenie zadania przez partnera.';
    if (isReviewer) {
      elements.taskNotice.textContent = '';
      const name = player?.name || 'Partner';
      elements.taskActions.querySelector('[data-action="confirm"]').textContent = `Zrobione – dodaj serduszko ❤️`;
      elements.taskActions.querySelector('[data-action="skip"]').textContent = 'Pomiń – bez punktu';
    }
  } else {
    elements.taskActions.hidden = true;
    elements.taskNotice.hidden = false;
    if (gameState.turnOrder.length < 2) {
      elements.taskNotice.textContent = 'Poczekajcie, aż dołączy druga osoba.';
    } else {
      elements.taskNotice.textContent = 'Rzuć kostką i zobacz, co czeka na kolejnym polu.';
    }
  }
}

function renderBoard() {
  if (!elements.board) {
    return;
  }
  const tokens = new Map();
  Object.entries(gameState.positions).forEach(([id, index]) => {
    const fieldTokens = tokens.get(index) || [];
    fieldTokens.push(gameState.players[id]);
    tokens.set(index, fieldTokens);
  });

  elements.board.querySelectorAll('.board-field').forEach((tile) => {
    if (!(tile instanceof HTMLElement)) {
      return;
    }
    const index = Number(tile.dataset.index || '0');
    if (index === gameState.focusField) {
      tile.classList.add('board-field--active');
      scrollFieldIntoView(tile);
    } else {
      tile.classList.remove('board-field--active');
    }
    const holder = tile.querySelector('.board-field__tokens');
    if (!(holder instanceof HTMLElement)) {
      return;
    }
    holder.innerHTML = '';
    const occupantList = tokens.get(index) || [];
    occupantList.forEach((player) => {
      const chip = document.createElement('span');
      chip.className = `board-token board-token--${player.color}`;
      chip.textContent = player.name.slice(0, 1).toUpperCase();
      chip.title = player.name;
      holder.appendChild(chip);
    });
  });
}

function scrollFieldIntoView(tile) {
  if (!tile) {
    return;
  }
  tile.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}

function renderFinishPanel() {
  if (!elements.finishPanel || !elements.finishScores) {
    return;
  }
  if (!gameState.finished) {
    elements.finishPanel.hidden = true;
    elements.finishScores.innerHTML = '';
    return;
  }
  elements.finishPanel.hidden = false;
  const winner = gameState.players[gameState.winnerId || ''];
  const message = winner
    ? `${winner.name} dociera pierwszy/a na metę! Wybierz zadanie dla partnera.`
    : 'Gra zakończona. Ustalcie zadanie dla przegranego.';
  elements.finishPanel.querySelector('p').textContent = message;
  elements.finishScores.innerHTML = '';
  gameState.turnOrder.forEach((id) => {
    const player = gameState.players[id];
    if (!player) {
      return;
    }
    const row = document.createElement('div');
    row.className = 'finish-score';
    row.innerHTML = `
      <span class="finish-score__name">${player.name}</span>
      <span class="finish-score__value">❤️ ${gameState.hearts[id] ?? 0}</span>
    `;
    elements.finishScores.appendChild(row);
  });
}

function renderInfo() {
  if (!elements.infoBanner) {
    return;
  }
  const message = gameState.notice || '';
  if (!message) {
    elements.infoBanner.hidden = true;
    elements.infoBanner.textContent = '';
    return;
  }
  elements.infoBanner.hidden = false;
  elements.infoBanner.textContent = message;
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = window.setTimeout(() => {
    if (elements.infoBanner) {
      elements.infoBanner.hidden = true;
      elements.infoBanner.textContent = '';
    }
  }, 4000);
}

function displayInfo(message) {
  if (!elements.infoBanner) {
    return;
  }
  elements.infoBanner.hidden = false;
  elements.infoBanner.textContent = message;
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = window.setTimeout(() => {
    if (elements.infoBanner) {
      elements.infoBanner.hidden = true;
      elements.infoBanner.textContent = '';
    }
  }, 3500);
}

function persistState(state) {
  sendGameStateToServer(state);
  saveFallbackState(state);
}

function saveFallbackState(state) {
  try {
    const payload = JSON.stringify({ version: state.version, state });
    localStorage.setItem(fallbackStorageKey, payload);
  } catch (error) {
    console.error('Nie można zapisać stanu planszówki.', error);
  }
}

function loadFallbackState() {
  try {
    const stored = localStorage.getItem(fallbackStorageKey);
    if (!stored) {
      return null;
    }
    const parsed = JSON.parse(stored);
    return parsed.state || null;
  } catch (error) {
    console.error('Nie można odczytać stanu planszówki.', error);
    return null;
  }
}

function sendGameStateToServer(state) {
  // TODO: Wpiąć wysyłkę stanu gry do istniejącego mechanizmu realtime w Momentach.
  console.debug('Stan planszówki do wysłania', state);
}

function onGameStateFromServer(callback) {
  // TODO: Podłącz odbieranie stanu gry (np. websocket / SSE) i wywołuj callback z najnowszym stanem.
  window.addEventListener('storage', (event) => {
    if (event.key !== fallbackStorageKey || !event.newValue) {
      return;
    }
    try {
      const parsed = JSON.parse(event.newValue);
      if (parsed && parsed.state) {
        callback(parsed.state);
      }
    } catch (error) {
      console.error('Nie udało się sparsować stanu planszówki z magazynu.', error);
    }
  });
}
