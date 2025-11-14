import { getJson, initThemeToggle } from './app.js';

const ACCESS_KEY = 'momenty.timer.access';
const ACCESS_PAGE = 'pozycje-na-czas.html';
const LIST_ENDPOINT = 'api/list_scratchcards.php';
const DEFAULT_DURATION = 60;
const ALERT_THRESHOLD = 10; // seconds
const FINAL_COUNTDOWN_START = 10; // seconds
const CELEBRATION_DURATION = 3000; // ms
const CELEBRATION_DELAY = 400; // ms to briefly show "0"

function ensureAccess() {
  const params = new URLSearchParams(window.location.search);

  if (params.has('auto')) {
    sessionStorage.setItem(ACCESS_KEY, 'true');
    if (window.history.replaceState) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('auto');
      window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    }
  }

  if (sessionStorage.getItem(ACCESS_KEY) === 'true') {
    return true;
  }

  window.location.replace(ACCESS_PAGE);
  return false;
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, '0');
  const remaining = (safeSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remaining}`;
}

function selectRandomIndex(list, currentIndex) {
  if (!Array.isArray(list) || list.length === 0) {
    return -1;
  }
  if (list.length === 1) {
    return 0;
  }
  let index = Math.floor(Math.random() * list.length);
  if (index === currentIndex) {
    index = (index + 1) % list.length;
  }
  return index;
}

function initTimerGame() {
  const timerCard = document.getElementById('timer-card');
  const timerStatus = document.getElementById('timer-status');
  const timerImage = document.getElementById('timer-image');
  const timerMedia = document.getElementById('timer-media');
  const progressBar = document.getElementById('timer-progress');
  const timerRemaining = document.getElementById('timer-remaining');
  const startButton = document.getElementById('start-timer');
  const skipButton = document.getElementById('skip-position');
  const durationRadios = document.querySelectorAll('input[name="timer_duration"]');
  const overlay = document.getElementById('timer-overlay');
  const countdownOverlay = document.getElementById('timer-countdown');

  const hasOverlaySupport = overlay && countdownOverlay;

  if (!timerCard || !timerStatus || !timerImage || !timerMedia || !progressBar || !timerRemaining || !startButton || !skipButton) {
    return;
  }

  let availableCards = [];
  let currentIndex = -1;
  let timerId = null;
  let timerEndsAt = 0;
  let timerTotal = DEFAULT_DURATION;
  let countdownActive = false;
  let lastFinalCountdownValue = null;
  let celebrationTimeoutId = null;
  let celebrationDelayId = null;

  function clearCelebrationDelay() {
    if (celebrationDelayId) {
      window.clearTimeout(celebrationDelayId);
      celebrationDelayId = null;
    }
  }

  function hideCelebration() {
    if (celebrationTimeoutId) {
      window.clearTimeout(celebrationTimeoutId);
      celebrationTimeoutId = null;
    }
    if (overlay?.dataset?.mode === 'celebration') {
      overlay.dataset.mode = 'hidden';
    }
  }

  function hideFinalCountdown() {
    lastFinalCountdownValue = null;
    if (overlay?.dataset?.mode === 'countdown') {
      overlay.dataset.mode = 'hidden';
    }
    if (countdownOverlay) {
      countdownOverlay.textContent = '';
    }
  }

  function showFinalCountdown(value) {
    if (!hasOverlaySupport) {
      return;
    }
    overlay.dataset.mode = 'countdown';
    countdownOverlay.textContent = String(value);
  }

  function triggerCelebration() {
    if (!overlay) {
      return;
    }
    hideFinalCountdown();
    hideCelebration();
    overlay.dataset.mode = 'celebration';
    celebrationTimeoutId = window.setTimeout(() => {
      if (overlay.dataset.mode === 'celebration') {
        overlay.dataset.mode = 'hidden';
      }
      celebrationTimeoutId = null;
    }, CELEBRATION_DURATION);
  }

  function getSelectedDuration() {
    for (const radio of durationRadios) {
      if (radio instanceof HTMLInputElement && radio.checked) {
        const value = Number(radio.value) || DEFAULT_DURATION;
        return Math.min(600, Math.max(10, value));
      }
    }
    return DEFAULT_DURATION;
  }

  function stopCountdown({ silent = false, preserveCountdownOverlay = false } = {}) {
    if (timerId) {
      window.clearInterval(timerId);
      timerId = null;
    }
    countdownActive = false;
    timerEndsAt = 0;
    progressBar.value = 0;
    progressBar.max = timerTotal;
    timerRemaining.textContent = formatTime(0);
    document.body.classList.remove('timer-alert');
    clearCelebrationDelay();
    hideCelebration();
    if (!preserveCountdownOverlay) {
      hideFinalCountdown();
    }
    if (!silent) {
      startButton.textContent = 'Zaczynamy zabawę';
    }
  }

  function updateCountdown() {
    if (!countdownActive || !timerEndsAt) {
      return;
    }
    const now = Date.now();
    const remainingMs = Math.max(0, timerEndsAt - now);
    const remainingSeconds = remainingMs / 1000;
    const elapsed = timerTotal - remainingSeconds;
    progressBar.max = timerTotal;
    progressBar.value = Math.min(timerTotal, Math.max(0, elapsed));
    timerRemaining.textContent = formatTime(Math.ceil(remainingSeconds));

    if (remainingSeconds <= ALERT_THRESHOLD) {
      document.body.classList.add('timer-alert');
    } else {
      document.body.classList.remove('timer-alert');
    }

    if (remainingSeconds > 0 && remainingSeconds <= FINAL_COUNTDOWN_START) {
      const displayValue = Math.ceil(remainingSeconds);
      if (displayValue !== lastFinalCountdownValue) {
        lastFinalCountdownValue = displayValue;
        showFinalCountdown(displayValue);
      }
    } else if (lastFinalCountdownValue !== null) {
      hideFinalCountdown();
    }

    if (remainingMs <= 0) {
      stopCountdown({ silent: true, preserveCountdownOverlay: true });
      timerRemaining.textContent = '00:00';
      timerStatus.textContent = 'Czas minął!';
      startButton.textContent = 'Uruchom ponownie';
      document.body.classList.remove('timer-alert');
      countdownActive = false;
      lastFinalCountdownValue = 0;
      showFinalCountdown(0);
      clearCelebrationDelay();
      celebrationDelayId = window.setTimeout(() => {
        triggerCelebration();
      }, CELEBRATION_DELAY);
    }
  }

  function startCountdown() {
    if (!availableCards.length) {
      return;
    }
    clearCelebrationDelay();
    hideCelebration();
    hideFinalCountdown();
    timerTotal = getSelectedDuration();
    progressBar.value = 0;
    progressBar.max = timerTotal;
    timerRemaining.textContent = formatTime(timerTotal);
    timerEndsAt = Date.now() + timerTotal * 1000;
    countdownActive = true;
    document.body.classList.remove('timer-alert');
    timerStatus.textContent = 'Odliczanie w toku...';
    startButton.textContent = 'Restartuj odliczanie';
    if (timerId) {
      window.clearInterval(timerId);
    }
    timerId = window.setInterval(updateCountdown, 100);
    updateCountdown();
  }

  async function loadCards() {
    timerStatus.textContent = 'Ładuję pozycję...';
    startButton.disabled = true;
    skipButton.disabled = true;
    try {
      const payload = await getJson(LIST_ENDPOINT);
      if (!payload?.ok) {
        throw new Error(payload?.error || 'Nie udało się wczytać pozycji.');
      }
      if (!Array.isArray(payload.files) || payload.files.length === 0) {
        timerStatus.textContent = 'Dodaj obrazy do folderu obrazy/zdrapki i spróbuj ponownie.';
        return;
      }
      availableCards = payload.files;
      timerStatus.textContent = 'Pozycja gotowa. Naciśnij start lub pomiń, aby wylosować inną.';
      showRandomCard();
      startButton.disabled = false;
      skipButton.disabled = false;
    } catch (error) {
      console.error(error);
      timerStatus.textContent = error.message || 'Nie udało się pobrać pozycji. Odśwież stronę i spróbuj ponownie.';
    }
  }

  function showRandomCard() {
    if (!availableCards.length) {
      return;
    }
    const nextIndex = selectRandomIndex(availableCards, currentIndex);
    if (nextIndex < 0) {
      timerStatus.textContent = 'Brak dostępnych pozycji.';
      return;
    }
    currentIndex = nextIndex;
    const source = availableCards[nextIndex];
    timerMedia.dataset.ready = 'false';
    timerImage.src = source;
    timerImage.alt = 'Losowa pozycja';
  }

  function handleSkip() {
    showRandomCard();
    timerStatus.textContent = 'Pozycja zmieniona. Startujcie, gdy będziecie gotowi!';
    if (countdownActive) {
      startCountdown();
    }
  }

  timerImage.addEventListener('load', () => {
    timerMedia.dataset.ready = 'true';
  });

  timerImage.addEventListener('error', () => {
    timerStatus.textContent = 'Nie udało się wczytać tej pozycji. Sprawdź obrazy i spróbuj ponownie.';
    timerMedia.dataset.ready = 'true';
  });

  startButton.addEventListener('click', () => {
    if (!availableCards.length) {
      return;
    }
    if (countdownActive) {
      startCountdown();
    } else {
      startCountdown();
    }
  });

  skipButton.addEventListener('click', handleSkip);

  durationRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      timerTotal = getSelectedDuration();
      progressBar.max = timerTotal;
      if (!countdownActive) {
        timerRemaining.textContent = formatTime(timerTotal);
      }
    });
  });

  progressBar.max = DEFAULT_DURATION;
  timerRemaining.textContent = formatTime(DEFAULT_DURATION);
  loadCards();
}

document.addEventListener('DOMContentLoaded', () => {
  if (!ensureAccess()) {
    return;
  }
  initThemeToggle(document.getElementById('theme-toggle'));
  initTimerGame();
});
