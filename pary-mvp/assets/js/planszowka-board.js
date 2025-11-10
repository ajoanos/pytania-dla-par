import { postJson, getJson } from './app.js';
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
const shareLinkUrl = buildShareUrl();

const rollButtons = Array.from(document.querySelectorAll('[data-role="roll-button"]'));

const elements = {
  turnLabel: document.getElementById('planszowka-turn-label'),
  waitHint: document.getElementById('planszowka-wait-hint'),
  players: document.getElementById('planszowka-players'),
  diceButtons: rollButtons,
  diceButton: rollButtons[0] || null,
  lastRoll: document.getElementById('planszowka-last-roll'),
  taskTitle: document.getElementById('planszowka-task-title'),
  taskBody: document.getElementById('planszowka-task-body'),
  taskActions: document.getElementById('planszowka-task-actions'),
  taskRollButton: document.getElementById('planszowka-roll-inline'),
  board: document.getElementById('planszowka-board'),
  boardWrapper: document.getElementById('planszowka-board-wrapper'),
  finishPanel: document.getElementById('planszowka-finish'),
  finishScores: document.getElementById('planszowka-finish-scores'),
  resetButton: document.getElementById('planszowka-reset'),
  infoBanner: document.getElementById('planszowka-info'),
  taskNotice: document.getElementById('planszowka-task-notice'),
};

const shareElements = {
  copyButton: document.getElementById('planszowka-share-copy'),
  qrButton: document.getElementById('planszowka-share-qr'),
  feedback: document.getElementById('planszowka-share-feedback'),
  modal: document.getElementById('planszowka-qr-modal'),
  modalImage: document.getElementById('planszowka-qr-image'),
  modalUrl: document.getElementById('planszowka-qr-url'),
  modalClose: document.getElementById('planszowka-qr-close'),
};

let gameState = createEmptyState();
let toastTimer = null;
let shareFeedbackTimer = null;

let currentParticipants = [];
let pollHandle = null;
let lastSnapshotSignature = '';
let lastParticipantsSignature = '';

init();

async function init() {
  renderBoardSkeleton();
  bindEvents();

  await loadInitialState();

  ensureParticipantRecord(localPlayerId, localPlayerName);
  ensureLocalPlayer();
  render();

  setupRealtimeBridge();
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

async function loadInitialState() {
  const remoteLoaded = await loadRemoteState();
  if (remoteLoaded) {
    return;
  }

  const stored = loadFallbackState();
  if (stored) {
    currentParticipants = deriveParticipantsFromState(stored);
    applyState(stored, { skipBroadcast: true });
  } else {
    applyState(createEmptyState(), { skipBroadcast: true });
  }

}

async function loadRemoteState() {
  try {
    const snapshot = await requestBoardSnapshot();
    if (!snapshot) {
      return false;
    }
    currentParticipants = snapshot.participants;
    applyState(snapshot.state, { skipBroadcast: true });
    updateSnapshotSignature(snapshot.state, snapshot.participants);
    return true;
  } catch (error) {
    console.error('Nie udało się pobrać stanu planszówki z serwera.', error);
    return false;
  }
}

function deriveParticipantsFromState(state) {
  if (!state || typeof state !== 'object') {
    return [];
  }
  if (state.players && typeof state.players === 'object') {
    return Object.values(state.players)
      .map((player) => ({
        id: String(player?.id ?? ''),
        name: String(player?.name ?? '').trim() || 'Gracz',
      }))
      .filter((entry) => entry.id);
  }
  return [];
}

function ensureParticipantRecord(participantId, participantName) {
  const id = String(participantId || '').trim();
  if (!id) {
    return;
  }
  const name = (participantName || '').trim() || 'Ty';
  const existing = currentParticipants.find((entry) => String(entry.id) === id);
  if (existing) {
    existing.name = name;
  } else {
    currentParticipants.push({ id, name });
  }
}

async function requestBoardSnapshot() {
  if (!roomKey || !localPlayerId) {
    return null;
  }
  const query = new URLSearchParams({
    room_key: roomKey,
    participant_id: localPlayerId,
  });
  const url = `api/board_state.php?${query.toString()}`;
  const payload = await getJson(url);
  if (!payload || !payload.ok) {
    if (payload?.error) {
      console.warn(payload.error);
    }
    return null;
  }
  const participants = normalizeParticipants(payload.participants);
  const state = payload.board_state && typeof payload.board_state === 'object'
    ? payload.board_state
    : createEmptyState();
  return { state, participants, updatedAt: payload.updated_at || '' };
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

function bindEvents() {
  elements.diceButtons?.forEach((button) => {
    button.addEventListener('click', handleRollRequest);
  });
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

  shareElements.copyButton?.addEventListener('click', () => {
    copyShareLink();
  });

  shareElements.qrButton?.addEventListener('click', () => {
    openQrModal();
  });

  shareElements.modalClose?.addEventListener('click', () => {
    closeQrModal();
  });

  shareElements.modal?.addEventListener('click', (event) => {
    if (event.target === shareElements.modal) {
      closeQrModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeQrModal();
    }
  });
}

function setupRealtimeBridge() {
  if (pollHandle) {
    window.clearTimeout(pollHandle);
    pollHandle = null;
  }
  onGameStateFromServer((incoming, participants) => {
    if (!incoming) {
      return;
    }
    currentParticipants = participants;
    applyState(incoming, { skipBroadcast: true });
  });
}

function ensureLocalPlayer() {
  const id = String(localPlayerId);
  ensureParticipantRecord(id, localPlayerName);
  const existing = gameState.players[id];
  if (existing) {
    if (existing.name !== localPlayerName) {
      updateState((draft) => {
        const player = draft.players[id];
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
    draft.players[id] = {
      id,
      name: localPlayerName,
      color,
    };
    draft.turnOrder.push(id);
    draft.positions[id] = 0;
    draft.hearts[id] = 0;
    draft.jail[id] = 0;
    if (!draft.currentTurn) {
      draft.currentTurn = id;
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
    const playerId = String(localPlayerId);
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
        const reviewerCandidate = determineNextTurn(draft, playerId);
        const reviewerId = reviewerCandidate && reviewerCandidate !== playerId
          ? reviewerCandidate
          : null;
        draft.awaitingConfirmation = {
          playerId,
          fieldIndex: targetIndex,
          reviewerId,
        };
        draft.nextTurn = reviewerId;
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

  const reviewerId = awaiting.reviewerId ? String(awaiting.reviewerId) : null;
  const performerId = awaiting.playerId ? String(awaiting.playerId) : null;
  const localId = String(localPlayerId);

  if (reviewerId) {
    if (reviewerId !== localId) {
      const reviewerName = gameState.players[reviewerId]?.name || 'partner';
      displayInfo(`Na decyzję czeka ${reviewerName}.`);
      return;
    }
  } else if (performerId === localId) {
    displayInfo('Poczekaj, aż partner zatwierdzi zadanie.');
    return;
  }

  updateState((draft) => {
    const record = draft.awaitingConfirmation;
    if (!record || !record.playerId) {
      return;
    }

    const field = boardFields[record.fieldIndex];
    const performer = draft.players[record.playerId];
    const reviewer = record.reviewerId ? draft.players[record.reviewerId] : null;
    const performerName = performer?.name || 'Gracz';
    const reviewerName = reviewer?.name || 'Partner';
    const taskLabel = field?.label || 'zadanie';

    draft.awaitingConfirmation = null;

    if (completed) {
      draft.hearts[record.playerId] = (draft.hearts[record.playerId] ?? 0) + 1;
      addHistoryEntry(draft, `${reviewerName} przyznaje ${performerName} serduszko za "${taskLabel}".`);
      draft.notice = `${performerName} zdobywa serduszko ❤️.`;
    } else {
      addHistoryEntry(draft, `${reviewerName} nie przyznaje serduszka ${performerName} za "${taskLabel}".`);
      draft.notice = `${performerName} nie zdobywa serduszka tym razem.`;
    }

    const next = draft.nextTurn || determineNextTurn(draft, record.playerId);
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
  return gameState.currentTurn === String(localPlayerId);
}

function applyState(newState, options = {}) {
  gameState = sanitizeState(newState, currentParticipants);
  render();
  updateSnapshotSignature(gameState, currentParticipants);
  if (!options.skipBroadcast) {
    persistState(gameState);
  }
}

function updateState(mutator, options = {}) {
  const draft = sanitizeState(JSON.parse(JSON.stringify(gameState)), currentParticipants);
  mutator(draft);
  const baseVersion = Number.isFinite(draft.version) ? Number(draft.version) : 0;
  draft.version = baseVersion + 1;
  gameState = sanitizeState(draft, currentParticipants);
  render();
  updateSnapshotSignature(gameState, currentParticipants);
  if (options.broadcast !== false) {
    persistState(gameState);
  }
}

function sanitizeState(state, participants = []) {
  const next = createEmptyState();
  const source = state && typeof state === 'object' ? state : {};

  const participantList = Array.isArray(participants)
    ? participants
        .map((entry) => ({
          id: String(entry?.id ?? ''),
          name: String(entry?.name ?? '').trim() || 'Gracz',
        }))
        .filter((entry) => entry.id)
    : [];

  const incomingPlayers = {};
  if (source.players && typeof source.players === 'object') {
    Object.entries(source.players).forEach(([key, value]) => {
      const id = String(value?.id ?? key);
      if (!id) {
        return;
      }
      incomingPlayers[id] = {
        id,
        name: String(value?.name ?? '').trim() || 'Gracz',
        color: String(value?.color ?? '').trim(),
      };
    });
  }

  const usedColors = new Set(
    Object.values(incomingPlayers)
      .map((player) => player.color)
      .filter((color) => Boolean(color)),
  );

  const players = {};
  participantList.forEach((participant) => {
    const id = participant.id;
    const existing = incomingPlayers[id] || {};
    const color = existing.color || pickColor(usedColors);
    usedColors.add(color);
    players[id] = {
      id,
      name: participant.name,
      color,
    };
  });

  Object.values(incomingPlayers).forEach((player) => {
    if (!players[player.id]) {
      const color = player.color || pickColor(usedColors);
      usedColors.add(color);
      players[player.id] = {
        id: player.id,
        name: player.name,
        color,
      };
    }
  });

  next.players = players;

  const desiredOrder = Array.isArray(source.turnOrder)
    ? source.turnOrder.map((id) => String(id))
    : [];
  const turnOrder = [];
  desiredOrder.forEach((id) => {
    if (players[id] && !turnOrder.includes(id)) {
      turnOrder.push(id);
    }
  });
  Object.keys(players).forEach((id) => {
    if (!turnOrder.includes(id)) {
      turnOrder.push(id);
    }
  });
  next.turnOrder = turnOrder;

  const rawPositions = source.positions && typeof source.positions === 'object' ? source.positions : {};
  const rawHearts = source.hearts && typeof source.hearts === 'object' ? source.hearts : {};
  const rawJail = source.jail && typeof source.jail === 'object' ? source.jail : {};

  next.positions = {};
  next.hearts = {};
  next.jail = {};

  next.turnOrder.forEach((id) => {
    next.positions[id] = clampFieldIndex(rawPositions[id]);
    next.hearts[id] = clampNonNegative(rawHearts[id]);
    next.jail[id] = clampNonNegative(rawJail[id]);
  });

  next.notice = typeof source.notice === 'string' ? source.notice : '';
  next.focusField = clampFieldIndex(source.focusField);
  next.finished = Boolean(source.finished);
  next.version = Number.isFinite(source.version) ? Number(source.version) : Number(next.version || 0);

  let currentTurn = source.currentTurn ? String(source.currentTurn) : null;
  if (currentTurn && !players[currentTurn]) {
    currentTurn = null;
  }
  next.currentTurn = currentTurn || (next.turnOrder[0] || null);

  const nextTurnCandidate = source.nextTurn ? String(source.nextTurn) : null;
  next.nextTurn = nextTurnCandidate && players[nextTurnCandidate] ? nextTurnCandidate : null;

  if (source.awaitingConfirmation && typeof source.awaitingConfirmation === 'object') {
    const awaiting = {
      playerId: String(source.awaitingConfirmation.playerId || ''),
      fieldIndex: clampFieldIndex(source.awaitingConfirmation.fieldIndex),
    };
    const reviewerId = source.awaitingConfirmation.reviewerId
      ? String(source.awaitingConfirmation.reviewerId)
      : '';
    if (reviewerId && players[reviewerId]) {
      awaiting.reviewerId = reviewerId;
    }
    if (awaiting.playerId && players[awaiting.playerId]) {
      next.awaitingConfirmation = awaiting;
    }
  }

  if (source.lastRoll && typeof source.lastRoll === 'object') {
    const rollPlayerId = String(source.lastRoll.playerId || source.lastRoll.rolled_by || '');
    if (rollPlayerId) {
      const rollValue = clampDiceValue(source.lastRoll.value ?? source.lastRoll.roll);
      next.lastRoll = {
        playerId: rollPlayerId,
        value: rollValue,
        from: clampFieldIndex(source.lastRoll.from ?? source.lastRoll.previous_position),
        to: clampFieldIndex(source.lastRoll.to ?? source.lastRoll.new_position),
      };
    }
  }

  next.winnerId = source.winnerId ? String(source.winnerId) : null;
  if (next.winnerId && !players[next.winnerId]) {
    next.winnerId = null;
  }

  next.history = Array.isArray(source.history)
    ? source.history
        .map((entry) => ({
          message: String(entry?.message ?? '').trim(),
          timestamp: String(entry?.timestamp ?? ''),
        }))
        .filter((entry) => entry.message)
    : [];

  return next;
}

function updateSnapshotSignature(state, participants = []) {
  try {
    lastSnapshotSignature = JSON.stringify(state ?? {});
    lastParticipantsSignature = JSON.stringify(participantsSignature(participants));
  } catch (error) {
    console.warn('Nie udało się zapisać podpisu stanu planszówki.', error);
  }
}

function participantsSignature(participants) {
  if (!Array.isArray(participants)) {
    return [];
  }
  return participants.map((entry) => ({
    id: String(entry?.id ?? ''),
    name: String(entry?.name ?? '').trim(),
  }));
}

function clampFieldIndex(value) {
  const numeric = Number.isFinite(value) ? Number(value) : Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const bounded = Math.min(Math.max(0, Math.trunc(numeric)), finishIndex);
  return bounded;
}

function clampNonNegative(value) {
  const numeric = Number.isFinite(value) ? Number(value) : Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.trunc(numeric));
}

function clampDiceValue(value) {
  const numeric = Number.isFinite(value) ? Number(value) : Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const bounded = Math.min(Math.max(1, Math.trunc(numeric)), 6);
  return bounded;
}

function pickColor(usedColors) {
  const palette = colorPalette;
  for (let index = 0; index < palette.length; index += 1) {
    const candidate = palette[index];
    if (!usedColors.has(candidate)) {
      return candidate;
    }
  }
  return palette[palette.length - 1];
}

window.addEventListener('beforeunload', () => {
  if (pollHandle) {
    window.clearTimeout(pollHandle);
    pollHandle = null;
  }
});

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
  const viewer = gameState.players[String(localPlayerId)];

  if (gameState.awaitingConfirmation) {
    const awaiting = gameState.awaitingConfirmation;
    const performer = awaiting.playerId ? gameState.players[awaiting.playerId] : null;
    const reviewer = awaiting.reviewerId ? gameState.players[awaiting.reviewerId] : null;
    const performerName = performer?.name || 'partner';

    if (reviewer) {
      elements.turnLabel.textContent = `Decyzja: ${reviewer.name}`;
      if (reviewer.id === String(localPlayerId)) {
        elements.waitHint.textContent = `Zdecyduj, czy ${performerName} zdobywa serduszko.`;
      } else if (awaiting.playerId === String(localPlayerId)) {
        elements.waitHint.textContent = `Czekaj, aż ${reviewer.name} zdecyduje o serduszku.`;
      } else {
        elements.waitHint.textContent = `Czekamy na decyzję ${reviewer.name}.`;
      }
    } else {
      elements.turnLabel.textContent = performer
        ? `Czekamy na decyzję partnera ${performer.name}`
        : 'Czekamy na potwierdzenie zadania';
      if (awaiting.playerId === String(localPlayerId)) {
        elements.waitHint.textContent = 'Poczekaj na potwierdzenie zadania przez partnera.';
      } else {
        elements.waitHint.textContent = `Pomóż ${performerName} – dodaj serduszko lub pomiń.`;
      }
    }
    return;
  }

  const active = gameState.players[gameState.currentTurn];
  elements.turnLabel.textContent = active ? `Teraz ruch: ${active.name}` : 'Trwa ustalanie kolejki';
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
  if (!elements.lastRoll) {
    return;
  }
  const canRoll = canCurrentPlayerRoll();
  if (Array.isArray(elements.diceButtons)) {
    elements.diceButtons.forEach((button) => {
      if (button instanceof HTMLButtonElement) {
        button.disabled = !canRoll;
      }
    });
  } else if (elements.diceButton instanceof HTMLButtonElement) {
    elements.diceButton.disabled = !canRoll;
  }
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
  const performer = awaiting ? gameState.players[awaiting.playerId] : null;
  const reviewer = awaiting?.reviewerId ? gameState.players[awaiting.reviewerId] : null;
  const confirmButton = elements.taskActions.querySelector('[data-action="confirm"]');
  const skipButton = elements.taskActions.querySelector('[data-action="skip"]');
  const inlineRollButton = elements.taskRollButton instanceof HTMLButtonElement
    ? elements.taskRollButton
    : elements.taskActions.querySelector('#planszowka-roll-inline');
  const canRoll = canCurrentPlayerRoll();

  elements.taskActions.hidden = false;

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

  if (inlineRollButton) {
    inlineRollButton.hidden = false;
    inlineRollButton.disabled = !canRoll;
  }

  if (awaiting) {
    const localId = String(localPlayerId);
    const isPerformer = awaiting.playerId === localId;
    const isReviewer = reviewer ? reviewer.id === localId : !isPerformer;
    const performerName = performer?.name || 'partner';

    if (confirmButton) {
      confirmButton.textContent = 'Dodaj serduszko ❤️';
      confirmButton.hidden = !isReviewer;
      confirmButton.disabled = !isReviewer;
    }
    if (skipButton) {
      skipButton.textContent = 'Nie wykonał';
      skipButton.hidden = !isReviewer;
      skipButton.disabled = !isReviewer;
    }
    if (inlineRollButton) {
      inlineRollButton.disabled = !canRoll;
    }

    elements.taskNotice.hidden = false;

    if (isReviewer) {
      elements.taskNotice.textContent = `${performerName} czeka na Twoją decyzję.`;
    } else if (isPerformer) {
      elements.taskNotice.textContent = reviewer
        ? `Czekaj, aż ${reviewer.name} zdecyduje o serduszku.`
        : 'Czekaj na potwierdzenie zadania przez partnera.';
    } else {
      elements.taskNotice.textContent = reviewer
        ? `Czekamy na decyzję ${reviewer.name}.`
        : 'Czekamy na decyzję partnera.';
    }
  } else {
    if (confirmButton) {
      confirmButton.hidden = true;
      confirmButton.disabled = true;
    }
    if (skipButton) {
      skipButton.hidden = true;
      skipButton.disabled = true;
    }
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
  if (!tile || !elements.boardWrapper) {
    return;
  }
  const { scrollWidth, clientWidth, scrollHeight, clientHeight } = elements.boardWrapper;
  const hasHorizontalOverflow = scrollWidth - clientWidth > 4;
  const hasVerticalOverflow = scrollHeight - clientHeight > 4;
  if (!hasHorizontalOverflow && !hasVerticalOverflow) {
    return;
  }
  tile.scrollIntoView({
    behavior: 'smooth',
    inline: hasHorizontalOverflow ? 'center' : 'nearest',
    block: hasVerticalOverflow ? 'center' : 'nearest',
  });
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

function buildShareUrl() {
  if (!roomKey) {
    return '';
  }
  const url = new URL('planszowa-invite.html', window.location.href);
  url.searchParams.set('room_key', roomKey);
  return url.toString();
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

function openQrModal() {
  if (!shareLinkUrl || !shareElements.modal || !shareElements.modalImage || !shareElements.modalUrl) {
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

function showShareFeedback(message, isError = false) {
  if (!shareElements.feedback) {
    return;
  }

  shareElements.feedback.textContent = message;
  shareElements.feedback.classList.toggle('share__feedback--error', isError);

  if (shareFeedbackTimer) {
    clearTimeout(shareFeedbackTimer);
  }

  shareFeedbackTimer = window.setTimeout(() => {
    resetShareFeedback();
  }, 4000);
}

function resetShareFeedback() {
  if (!shareElements.feedback) {
    return;
  }

  if (shareFeedbackTimer) {
    clearTimeout(shareFeedbackTimer);
    shareFeedbackTimer = null;
  }

  shareElements.feedback.textContent = '';
  shareElements.feedback.classList.remove('share__feedback--error');
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
  if (!roomKey || !localPlayerId) {
    return;
  }
  postJson('api/board_sync.php', {
    room_key: roomKey,
    participant_id: localPlayerId,
    state,
  })
    .then((response) => {
      if (!response || !response.ok) {
        throw new Error(response?.error || 'Nie udało się zsynchronizować planszówki.');
      }
      if (response.board_state && typeof response.board_state === 'object') {
        updateSnapshotSignature(response.board_state, currentParticipants);
      }
    })
    .catch((error) => {
      console.error('Nie udało się wysłać stanu planszówki.', error);
    });
}

function onGameStateFromServer(callback) {
  async function poll() {
    try {
      const snapshot = await requestBoardSnapshot();
      if (snapshot) {
        currentParticipants = snapshot.participants;
        const stateSignature = JSON.stringify(snapshot.state ?? {});
        const participantsSig = JSON.stringify(participantsSignature(snapshot.participants));
        const shouldUpdate =
          stateSignature !== lastSnapshotSignature || participantsSig !== lastParticipantsSignature;
        if (shouldUpdate) {
          updateSnapshotSignature(snapshot.state, snapshot.participants);
          callback(snapshot.state, snapshot.participants);
        }
      }
    } catch (error) {
      console.error('Nie udało się pobrać aktualnego stanu planszówki.', error);
    } finally {
      pollHandle = window.setTimeout(poll, 2500);
    }
  }

  poll();
}
