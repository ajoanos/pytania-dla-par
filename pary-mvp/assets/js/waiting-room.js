import { appendTokenToUrl, getJson } from './app.js';
import { showLoader, hideLoader } from './loader.js';

const params = new URLSearchParams(window.location.search);
const roomKey = (params.get('room_key') || '').toUpperCase();
const participantId = params.get('pid');
const token = params.get('token') || '';

const waitingTitle = document.getElementById('waiting-title');
const waitingMessage = document.getElementById('waiting-message');
const waitingLabel = document.getElementById('waiting-room-label');
const waitingLeave = document.getElementById('waiting-leave');
const hostSetupPage = appendTokenToUrl(document.body?.dataset.hostPage || 'pytania-dla-par-room.html', token);
const backToGames = appendTokenToUrl(document.body?.dataset.homePage || 'pytania-dla-par.html', token);
const activeRoomPage = appendTokenToUrl(document.body?.dataset.roomPage || 'room.html', token);
const datasetDeck = (document.body?.dataset.deck || '').toLowerCase();
const deckParam = (params.get('deck') || datasetDeck || '').toLowerCase();

if (deckParam) {
  document.body.dataset.deck = deckParam;
}

if (waitingLabel && roomKey) {
  waitingLabel.textContent = `Pokój ${roomKey}`;
}

if (!roomKey || !participantId) {
  window.location.replace(hostSetupPage);
} else {
  waitingLeave?.addEventListener('click', () => {
    window.location.href = backToGames;
  });

  const VISIBLE_POLL_INTERVAL_MS = 5000;
  const HIDDEN_POLL_INTERVAL_MS = 20000;
  const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

  let pollTimer = null;
  let idleTimer = null;
  let pollingStopped = false;
  let pausedForIdle = false;
  let lastStatus = '';
  let hasCompletedInitialRefresh = false;

  function getPollInterval() {
    return document.visibilityState === 'hidden' ? HIDDEN_POLL_INTERVAL_MS : VISIBLE_POLL_INTERVAL_MS;
  }

  function scheduleNextPoll() {
    if (pollTimer) {
      clearTimeout(pollTimer);
    }
    if (pollingStopped || pausedForIdle) {
      return;
    }
    pollTimer = setTimeout(startPolling, getPollInterval());
  }

  function resetIdleTimer() {
    if (pollingStopped) {
      return;
    }
    if (idleTimer) {
      clearTimeout(idleTimer);
    }
    idleTimer = setTimeout(pauseForIdle, IDLE_TIMEOUT_MS);
  }

  async function refreshStatus() {
    try {
      const payload = await getJson(
        `api/state.php?room_key=${encodeURIComponent(roomKey)}&participant_id=${encodeURIComponent(participantId)}`,
      );
      if (!payload.ok) {
        throw new Error(payload.error || 'Nie udało się pobrać stanu pokoju.');
      }
      const participant = payload.self || null;
      if (!participant) {
        showErrorState(
          'Nie znaleziono zgłoszenia',
          'Twoje zgłoszenie nie jest już dostępne. Wróć i spróbuj dołączyć ponownie.',
        );
        stopPolling();
        return;
      }

      if (participant.is_host || participant.status === 'active') {
        redirectToRoom();
        return;
      }

      if (participant.status === 'rejected') {
        showErrorState(
          'Prośba została odrzucona',
          'Gospodarz odrzucił Twoją prośbę. Możesz wrócić i spróbować ponownie później.',
        );
        stopPolling();
        return;
      }

      if (participant.status !== lastStatus) {
        lastStatus = participant.status || '';
        showWaitingState();
      }
    } catch (error) {
      console.error(error);
    }
  }

  function showWaitingState() {
    if (waitingTitle) {
      waitingTitle.textContent = 'Oczekiwanie na dołączenie';
    }
    if (waitingMessage) {
      waitingMessage.textContent =
        'Twoja prośba została wysłana do gospodarza. Gdy tylko zaakceptuje zgłoszenie, od razu otrzymasz dostęp do pokoju.';
    }
  }

  function showErrorState(title, message) {
    if (waitingTitle) {
      waitingTitle.textContent = title;
    }
    if (waitingMessage) {
      waitingMessage.textContent = message;
    }
  }

  function redirectToRoom() {
    stopPolling();
    const targetUrl = new URL(activeRoomPage, window.location.href);
    targetUrl.searchParams.set('room_key', roomKey);
    targetUrl.searchParams.set('pid', participantId);
    if (deckParam) {
      targetUrl.searchParams.set('deck', deckParam);
    }
    if (token) {
      targetUrl.searchParams.set('token', token);
    }
    window.location.replace(targetUrl.toString());
  }

  async function startPolling() {
    if (pollingStopped || pausedForIdle) {
      return;
    }

    const shouldShowLoader = !hasCompletedInitialRefresh;

    if (shouldShowLoader) {
      showLoader();
    }

    try {
      await refreshStatus();
      hasCompletedInitialRefresh = true;
    } finally {
      if (shouldShowLoader) {
        hideLoader();
      }
      if (!pollingStopped && !pausedForIdle) {
        scheduleNextPoll();
      }
    }
  }

  function stopPolling() {
    pollingStopped = true;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function pauseForIdle() {
    if (pausedForIdle || pollingStopped) {
      return;
    }
    pausedForIdle = true;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    if (waitingMessage) {
      waitingMessage.textContent =
        'Wstrzymaliśmy sprawdzanie stanu po dłuższej bezczynności. Wróć do karty, aby wznowić.';
    }
  }

  function resumeAfterIdle() {
    if (!pausedForIdle || pollingStopped) {
      return;
    }
    pausedForIdle = false;
    showWaitingState();
    resetIdleTimer();
    startPolling();
  }

  // Initial start
  pollTimer = setTimeout(startPolling, 0);
  resetIdleTimer();

  document.addEventListener('visibilitychange', () => {
    if (pollingStopped) {
      return;
    }
    if (pausedForIdle && document.visibilityState === 'visible') {
      resumeAfterIdle();
      return;
    }
    scheduleNextPoll();
  });

  ['pointerdown', 'keydown', 'touchstart', 'visibilitychange'].forEach((eventName) => {
    document.addEventListener(eventName, () => {
      if (pollingStopped) {
        return;
      }
      if (pausedForIdle) {
        resumeAfterIdle();
        return;
      }
      resetIdleTimer();
    });
  });

  window.addEventListener('beforeunload', () => {
    stopPolling();
  });
}
