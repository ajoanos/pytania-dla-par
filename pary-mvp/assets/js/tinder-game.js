import { appendTokenToUrl, getJson, postJson } from './app.js';
import { initShareSheet, initShareQrModal, initShareEmailForm, updateShareLinks } from './share.js';

const EMAIL_ENDPOINT = 'api/send_positions_email.php';
const SHARE_EMAIL_SUBJECT = 'Tinder z pozycjami – dołącz do mnie';

const params = new URLSearchParams(window.location.search);
const roomKey = (params.get('room_key') || '').toUpperCase();
const participantId = params.get('pid');
const participantNumericId = Number(participantId || 0);
const token = params.get('token') || '';

const stateEndpoint = 'api/tinder_state.php';
const startEndpoint = 'api/tinder_start.php';
const swipeEndpoint = 'api/tinder_swipe.php';
const replayVoteEndpoint = 'api/tinder_replay_vote.php';
const hostSetupCard = document.getElementById('host-setup');
const setupSlider = document.getElementById('setup-count');
const setupValue = document.getElementById('setup-count-value');
const setupHint = document.getElementById('setup-hint');
const startButton = document.getElementById('start-session');
const swipeCard = document.getElementById('swipe-card');
const swipeStatus = document.getElementById('swipe-status');
const swipePlaceholder = document.getElementById('swipe-placeholder');
const swipeMedia = document.getElementById('swipe-media');
const swipeImage = document.getElementById('swipe-image');
const swipeStage = document.getElementById('swipe-stage');
const swipeButtons = document.querySelectorAll('.swipe-button');
const partnerProgress = document.getElementById('partner-progress');
const progressLabel = document.getElementById('progress-label');
const progressBar = document.getElementById('progress-bar');
const summaryCard = document.getElementById('match-summary');
const summaryLead = document.getElementById('summary-lead');
const summaryEmpty = document.getElementById('summary-empty');
const matchList = document.getElementById('match-list');
const playAgainButton = document.getElementById('play-again');
const playAgainDefaultLabel = playAgainButton?.textContent?.trim() || 'Gramy jeszcze raz?';
if (playAgainButton) {
  playAgainButton.disabled = true;
}
const shareBar = document.getElementById('share-bar');
const shareLayer = document.getElementById('share-layer');
const shareCard = document.getElementById('share-card');
const shareOpen = document.getElementById('share-open');
const shareClose = document.getElementById('share-close');
const shareBackdrop = document.getElementById('share-backdrop');
const shareCopy = document.getElementById('share-copy');
const shareFeedback = document.getElementById('share-feedback');
const shareLinks = document.getElementById('share-links');
const shareQrButton = document.getElementById('share-show-qr');
const shareQrModal = document.getElementById('share-qr-modal');
const shareQrImage = document.getElementById('share-qr-image');
const shareQrUrl = document.getElementById('share-qr-url');
const shareQrClose = document.getElementById('share-qr-close');
const shareEmailForm = document.getElementById('share-email');
const shareEmailInput = document.getElementById('share-email-input');
const shareEmailFeedback = document.getElementById('share-email-feedback');

const SWIPE_THRESHOLD = 60;

let isHost = false;
let currentSession = null;
let positions = [];
let selfSwipes = new Map();
let pollTimer = null;
let idleTimer = null;
let wasManuallyPaused = false;
let submittingSwipe = false;
let everyoneReady = false;
let allFinished = false;
let shareSheetReady = false;
let participantCount = 1;
let availablePool = 100;
let forceSetupVisible = false;
let selfDisplayName = '';
let summaryAutoScrolled = false;
let lastSessionId = null;
let isAnimatingSwipe = false;
let replayVotes = new Set();
let replayReady = false;

const POLL_INTERVAL_MS = 10000;
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

function redirectToSetup() {
  window.location.replace(appendTokenToUrl('tinder-dla-sexu-room.html', token));
}

function normalizeShareUrl() {
  if (!roomKey) {
    return '';
  }
  const baseUrl = appendTokenToUrl('tinder-dla-sexu-invite.html', token);
  const shareUrl = new URL(baseUrl, window.location.href);
  shareUrl.searchParams.set('room_key', roomKey);
  if (token) {
    shareUrl.searchParams.set('token', token);
  }
  return shareUrl.toString();
}

function buildShareMessage(url) {
  const safeUrl = url || normalizeShareUrl();
  if (!safeUrl) {
    return '';
  }
  const trimmedName = selfDisplayName.trim();
  if (trimmedName) {
    return `${trimmedName} zaprasza Cię do wspólnej gry w Tinder z pozycjami. Kliknij, aby dołączyć: ${safeUrl}`;
  }
  return `Dołącz do mnie w Tinder z pozycjami. Kliknij, aby dołączyć: ${safeUrl}`;
}

function updateShareLinksWrapper() {
  updateShareLinks({
    shareOpen,
    shareCopy,
    shareLinks,
    shareQrButton,
    shareEmailForm,
    getShareUrl: normalizeShareUrl,
    getShareMessage: buildShareMessage
  });
}

function initShareSheetWrapper() {
  initShareSheet({
    shareLayer,
    shareCard,
    shareOpen,
    shareClose,
    shareBackdrop,
    shareCopy,
    shareFeedback,
    getShareUrl: normalizeShareUrl
  });
  shareSheetReady = true;
  updateShareLinksWrapper();
}

function initShareQrModalWrapper() {
  initShareQrModal({
    shareQrButton,
    shareQrModal,
    shareQrImage,
    shareQrUrl,
    shareQrClose,
    getShareUrl: normalizeShareUrl
  });
}

function initShareEmailFormWrapper() {
  initShareEmailForm({
    shareEmailForm,
    shareEmailInput,
    shareEmailFeedback,
    getShareUrl: normalizeShareUrl,
    getShareMessage: buildShareMessage,
    emailEndpoint: EMAIL_ENDPOINT,
    subject: SHARE_EMAIL_SUBJECT,
    senderName: selfDisplayName
  });
}

function updateShareVisibility() {
  if (!shareBar) {
    return;
  }
  const shouldShow = isHost && participantCount < 2;
  shareBar.hidden = !shouldShow;
  if (shareOpen) {
    shareOpen.disabled = !shouldShow;
    if (shouldShow) {
      shareOpen.removeAttribute('tabindex');
      if (!shareSheetReady) {
        initShareSheetWrapper();
        initShareQrModalWrapper();
        initShareEmailFormWrapper();
      }
    } else {
      shareOpen.setAttribute('tabindex', '-1');
      shareOpen.setAttribute('aria-expanded', 'false');
    }
  }
  if (!shouldShow && shareLayer) {
    shareLayer.dataset.open = 'false';
    shareLayer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('share-layer-open');
  }
}

function updateSetupSliderLimits() {
  if (!(setupSlider instanceof HTMLInputElement)) {
    return;
  }
  const max = Math.max(1, Math.min(100, availablePool || 100));
  if (Number(setupSlider.max) !== max) {
    setupSlider.max = String(max);
    if (Number(setupSlider.value) > max) {
      setupSlider.value = String(max);
    }
  }
  if (!setupValue) {
    return;
  }
  setupValue.textContent = setupSlider.value;
  if (setupHint) {
    if (availablePool === 0) {
      setupHint.textContent = 'Dodaj obrazy do folderu obrazy/zdrapki, aby rozpocząć grę.';
    } else if (availablePool < 100) {
      setupHint.textContent = `Maksymalnie ${availablePool} pozycji w tej kolekcji.`;
    } else {
      setupHint.textContent = 'Możesz wybrać maksymalnie 100 pozycji albo tyle, ile mamy w galerii.';
    }
  }
  if (startButton) {
    startButton.disabled = availablePool === 0;
  }
}

function updateSetupVisibility() {
  if (!hostSetupCard) {
    return;
  }
  const shouldShow = isHost && (!currentSession || forceSetupVisible);
  hostSetupCard.hidden = !shouldShow;
}

function getCurrentIndex() {
  if (!positions.length) {
    return -1;
  }
  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index];
    if (!position) {
      continue;
    }
    if (!selfSwipes.has(position.id)) {
      return index;
    }
  }
  return positions.length;
}

function updateSwipeCard() {
  if (!swipeCard || !swipeStatus || !swipePlaceholder || !swipeMedia || !swipeImage) {
    return;
  }
  if (!currentSession) {
    swipeCard.hidden = true;
    return;
  }
  swipeCard.hidden = false;

  const total = positions.length;
  const ownProgress = selfSwipes.size;
  if (progressBar) {
    progressBar.max = total;
    progressBar.value = ownProgress;
  }
  if (progressLabel) {
    progressLabel.textContent = `${ownProgress} / ${total}`;
  }

  swipeButtons.forEach((button) => {
    button.disabled = !everyoneReady || submittingSwipe || ownProgress >= total;
  });

  const index = getCurrentIndex();
  if (!everyoneReady) {
    swipeStatus.textContent = 'Czekamy, aż druga osoba dołączy do gry.';
    swipePlaceholder.hidden = false;
    swipePlaceholder.textContent = 'Jak tylko partner pojawi się w pokoju, zaczniecie swipować.';
    swipeMedia.hidden = true;
    return;
  }

  if (index < 0 || index >= total) {
    swipeStatus.textContent = allFinished
      ? 'Runda zakończona. Zerknijcie na Wasze połączenia.'
      : 'Czekamy na drugą osobę.';
    swipePlaceholder.hidden = false;
    swipePlaceholder.textContent = allFinished
      ? 'Macie już wyniki. Zobaczcie listę wspólnych pozycji poniżej.'
      : 'Ty już skończyłeś/ skończyłaś. Daj partnerowi chwilkę na dokończenie.';
    swipeMedia.hidden = true;
    return;
  }

  swipeStatus.textContent = 'Przesuń zdjęcie: w prawo – podoba się, w lewo – odpuszczamy.';
  swipePlaceholder.hidden = true;
  swipeMedia.hidden = false;
  const position = positions[index];
  swipeImage.src = position.image;
  swipeImage.alt = position.title || 'Pozycja';
}

function renderMatches(matches) {
  if (!summaryCard || !matchList) {
    return;
  }
  matchList.innerHTML = '';
  if (!Array.isArray(matches) || matches.length === 0) {
    summaryEmpty.hidden = false;
    return;
  }
  summaryEmpty.hidden = true;
  matches.forEach((position) => {
    const item = document.createElement('li');
    item.className = 'positions-summary__item';
    const figure = document.createElement('figure');
    figure.className = 'position-card position-card--compact';
    const image = document.createElement('img');
    image.className = 'position-card__image';
    image.src = position.image;
    image.alt = position.title || 'Pozycja';
    image.loading = 'lazy';
    const caption = document.createElement('figcaption');
    caption.className = 'position-card__title';
    caption.textContent = position.title || 'Pozycja';
    figure.appendChild(image);
    figure.appendChild(caption);
    item.appendChild(figure);
    matchList.appendChild(item);
  });
}

function maybeScrollToSummary() {
  if (!summaryCard || summaryCard.hidden || summaryAutoScrolled) {
    return;
  }
  summaryAutoScrolled = true;
  requestAnimationFrame(() => {
    summaryCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function selfHasRequestedReplay() {
  return replayVotes.has(participantNumericId);
}

function updatePlayAgainButtonState() {
  if (!playAgainButton) {
    return;
  }
  if (!currentSession || !allFinished) {
    playAgainButton.disabled = true;
    if (playAgainDefaultLabel) {
      playAgainButton.textContent = playAgainDefaultLabel;
    }
    return;
  }
  if (replayReady) {
    playAgainButton.disabled = true;
    playAgainButton.textContent = isHost ? 'Wybierz liczbę pozycji' : 'Czekamy na gospodarza…';
    return;
  }
  if (selfHasRequestedReplay()) {
    playAgainButton.disabled = true;
    playAgainButton.textContent = 'Czekamy na partnera…';
    return;
  }
  playAgainButton.disabled = false;
  if (playAgainDefaultLabel) {
    playAgainButton.textContent = playAgainDefaultLabel;
  }
}

async function submitReplayVote() {
  if (!playAgainButton || !currentSession || !roomKey || !participantId) {
    return;
  }
  if (selfHasRequestedReplay()) {
    return;
  }
  playAgainButton.disabled = true;
  playAgainButton.textContent = 'Dajemy znać partnerowi…';
  try {
    const payload = await postJson(replayVoteEndpoint, {
      room_key: roomKey,
      participant_id: participantId,
      session_id: currentSession.id,
    });
    if (!payload.ok) {
      throw new Error(payload.error || 'Nie udało się wysłać zgody na kolejną rundę.');
    }
    if (summaryLead) {
      summaryLead.textContent = isHost
        ? 'Daliśmy znać partnerowi. Czekamy na jego decyzję.'
        : 'Czekamy na gospodarza, aż potwierdzi nową rundę.';
    }
    await fetchState();
  } catch (error) {
    console.error(error);
    alert(error.message || 'Nie udało się wysłać zgody na kolejną rundę.');
  } finally {
    updatePlayAgainButtonState();
  }
}

function updateSummary(matches) {
  if (!summaryCard || !summaryLead) {
    return;
  }
  if (allFinished) {
    summaryCard.hidden = false;
    let summaryText = 'Wybraliśmy dla Was wszystkie wspólne typy. Zainspirujcie się nimi dziś wieczorem!';
    if (replayReady) {
      summaryText = isHost
        ? 'Oboje chcecie grać dalej. Wybierz liczbę pozycji i zacznijcie od nowa.'
        : 'Oboje chcecie grać dalej. Czekamy na gospodarza, aż wybierze liczbę pozycji.';
    } else if (selfHasRequestedReplay()) {
      summaryText = 'Daliśmy znać, że chcemy grać dalej. Czekamy na zgodę partnera.';
    } else if (replayVotes.size > 0) {
      summaryText = 'Partner ma ochotę na kolejną rundę. Kliknij „Gramy jeszcze raz?”, jeśli też chcesz kontynuować.';
    }
    summaryLead.textContent = summaryText;
    renderMatches(matches);
    maybeScrollToSummary();
  } else {
    summaryCard.hidden = true;
  }
}

function updatePartnerProgress(progressMap, total) {
  if (!partnerProgress) {
    return;
  }
  if (!progressMap || Object.keys(progressMap).length === 0 || total === 0) {
    partnerProgress.textContent = '';
    return;
  }
  const entries = Object.entries(progressMap).filter(([pid]) => Number(pid) !== participantNumericId);
  if (entries.length === 0) {
    partnerProgress.textContent = '';
    return;
  }
  const [, value] = entries[0];
  partnerProgress.textContent = `Partner jest na ${value} / ${total}`;
}

async function fetchState() {
  if (!roomKey || !participantId) {
    redirectToSetup();
    return;
  }
  try {
    const payload = await getJson(
      `${stateEndpoint}?room_key=${encodeURIComponent(roomKey)}&participant_id=${encodeURIComponent(participantId)}`,
    );
    if (!payload.ok) {
      throw new Error(payload.error || 'Nie udało się pobrać stanu gry.');
    }
    handleState(payload);
  } catch (error) {
    console.error(error);
  }
}

function handleState(payload) {
  availablePool = Number(payload.position_pool_size) || availablePool;
  updateSetupSliderLimits();

  selfDisplayName = (payload.self?.display_name || '').trim();
  isHost = Boolean(payload.self?.is_host);
  const participants = Array.isArray(payload.participants) ? payload.participants : [];
  participantCount = participants.length;
  everyoneReady = Boolean(payload.everyone_ready);
  allFinished = Boolean(payload.all_finished);
  currentSession = payload.session || null;
  positions = Array.isArray(currentSession?.positions) ? currentSession.positions : [];
  selfSwipes = new Map(Object.entries(payload.self_swipes || {}));
  const replayIdsRaw = Array.isArray(payload.replay_votes?.participant_ids) ? payload.replay_votes.participant_ids : [];
  const normalizedReplayIds = replayIdsRaw
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
  replayVotes = new Set(normalizedReplayIds);
  replayReady = Boolean(payload.replay_votes?.ready);
  const progressMap = payload.progress || {};

  const nextSessionId = currentSession?.id || null;
  if (nextSessionId !== lastSessionId) {
    summaryAutoScrolled = false;
    lastSessionId = nextSessionId;
  }
  if (!currentSession || !allFinished) {
    summaryAutoScrolled = false;
  }

  forceSetupVisible = Boolean(currentSession && replayReady && isHost);
  updateSetupVisibility();
  updateShareVisibility();
  updatePlayAgainButtonState();

  if (!currentSession) {
    summaryCard.hidden = true;
    swipeCard.hidden = false;
    if (swipeStatus) {
      swipeStatus.textContent = isHost
        ? 'Rozpocznij nową rundę i wyślij link partnerowi.'
        : 'Gospodarz zaraz rozpocznie rundę. Daj mu chwilkę.';
    }
    swipePlaceholder.hidden = false;
    swipeMedia.hidden = true;
    return;
  }

  updatePartnerProgress(progressMap, positions.length);
  updateSwipeCard();
  updateSummary(payload.matches || []);
  updateShareLinksWrapper();
}

async function startSession(countOverride, options = {}) {
  if (!roomKey || !participantId) {
    redirectToSetup();
    return false;
  }

  if (!isHost && !currentSession) {
    if (summaryLead) {
      summaryLead.textContent = 'Poczekaj, aż gospodarz rozpocznie pierwszą rundę.';
    }
    return false;
  }

  const { triggerButton } = options;
  const sliderValue = Number(setupSlider?.value) || 1;
  const previousCount = Number(currentSession?.total_count || positions.length || 0);
  let count = Number(countOverride);
  if (!Number.isFinite(count) || count <= 0) {
    count = isHost && setupSlider ? sliderValue : previousCount || sliderValue || 1;
  }
  count = Math.max(1, count);
  if (availablePool > 0) {
    count = Math.min(count, availablePool);
  }

  const buttonToDisable = triggerButton || (isHost ? startButton : null);
  if (buttonToDisable) {
    buttonToDisable.disabled = true;
  }

  try {
    const payload = await postJson(startEndpoint, {
      room_key: roomKey,
      participant_id: participantId,
      count,
    });
    if (!payload.ok) {
      throw new Error(payload.error || 'Nie udało się rozpocząć rundy.');
    }
    forceSetupVisible = false;
    summaryAutoScrolled = false;
    await fetchState();
    return true;
  } catch (error) {
    console.error(error);
    alert(error.message || 'Nie udało się przygotować nowej rundy.');
    return false;
  } finally {
    if (buttonToDisable) {
      buttonToDisable.disabled = false;
    }
  }
}

async function submitSwipe(choice) {
  // Optimistic UI: Allow rapid swiping without blocking
  if (!currentSession || !roomKey || !participantId) {
    return;
  }
  const index = getCurrentIndex();
  if (index < 0 || index >= positions.length) {
    return;
  }
  const position = positions[index];

  // 1. Optimistic Update
  selfSwipes.set(position.id, choice);
  updateSwipeCard();

  // 2. Background Sync
  try {
    const payload = await postJson(swipeEndpoint, {
      room_key: roomKey,
      participant_id: participantId,
      session_id: currentSession.id,
      position_id: position.id,
      choice,
    });
    if (!payload.ok) {
      throw new Error(payload.error || 'Nie udało się zapisać wyboru.');
    }
    // Sync state after successful save (fire and forget)
    fetchState();
  } catch (error) {
    console.error(error);
    // 3. Rollback on Failure
    selfSwipes.delete(position.id);
    updateSwipeCard();
    alert(error.message || 'Nie udało się zapisać wyboru. Spróbuj ponownie.');
  }
}

function handleButtonClick(event) {
  const choice = event.currentTarget?.dataset?.action;
  if (!choice) {
    return;
  }
  submitSwipe(choice);
}

function initSwipeButtons() {
  swipeButtons.forEach((button) => {
    button.addEventListener('click', handleButtonClick);
  });
}

function initSlider() {
  if (!setupSlider || !setupValue) {
    return;
  }
  setupSlider.addEventListener('input', () => {
    setupValue.textContent = setupSlider.value;
  });
}

function initPlayAgain() {
  if (!playAgainButton) {
    return;
  }
  playAgainButton.addEventListener('click', () => {
    submitReplayVote();
  });
}

function initSwipeGestures() {
  if (!swipeStage || !swipeMedia) {
    return;
  }
  let pointerId = null;
  let startX = 0;
  let currentX = 0;
  let isDragging = false;
  let rafId = null;

  const resetTransform = (instant = false) => {
    if (instant) {
      swipeMedia.style.transition = 'none';
      swipeMedia.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
      swipeMedia.style.opacity = '1';
      requestAnimationFrame(() => {
        swipeMedia.style.transition = '';
      });
      return;
    }
    swipeMedia.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
    swipeMedia.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
    swipeMedia.style.opacity = '1';
    setTimeout(() => {
      swipeMedia.style.transition = '';
    }, 260);
  };

  const stopTracking = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    isDragging = false;
    pointerId = null;
  };

  const animateChoice = (choice) => {
    if (!swipeMedia) {
      return;
    }
    isAnimatingSwipe = true;
    swipeButtons.forEach((button) => {
      button.disabled = true;
    });
    const direction = choice === 'like' ? 1 : -1;
    swipeMedia.style.transition = 'transform 0.28s ease, opacity 0.28s ease';
    swipeMedia.style.transform = `translate3d(${direction * 520}px, 0, 0) rotate(${direction * 24}deg)`;
    swipeMedia.style.opacity = '0.2';
    setTimeout(() => {
      resetTransform(true);
      isAnimatingSwipe = false;
      submitSwipe(choice);
    }, 220);
  };

  const updateTransform = () => {
    if (!isDragging) {
      return;
    }
    const deltaX = currentX - startX;
    const rotation = deltaX / 18;
    const opacity = Math.max(0.35, 1 - Math.abs(deltaX) / 320);
    swipeMedia.style.transform = `translate3d(${deltaX}px, 0, 0) rotate(${rotation}deg)`;
    swipeMedia.style.opacity = `${opacity}`;
    rafId = requestAnimationFrame(updateTransform);
  };

  const releasePointer = (event, cancelled) => {
    if (!isDragging || event.pointerId !== pointerId) {
      return;
    }
    const deltaX = currentX - startX;
    try {
      swipeStage.releasePointerCapture(event.pointerId);
    } catch (error) {
      // Ignore capture errors
    }
    stopTracking();
    if (cancelled) {
      resetTransform();
      return;
    }
    if (deltaX > SWIPE_THRESHOLD) {
      animateChoice('like');
    } else if (deltaX < -SWIPE_THRESHOLD) {
      animateChoice('dislike');
    } else {
      resetTransform();
    }
  };

  swipeStage.addEventListener('pointerdown', (event) => {
    if (
      !event.isPrimary ||
      pointerId !== null ||
      !everyoneReady ||
      submittingSwipe ||
      !currentSession ||
      swipeMedia.hidden ||
      isAnimatingSwipe
    ) {
      return;
    }
    pointerId = event.pointerId;
    startX = event.clientX;
    currentX = startX;
    isDragging = true;
    swipeMedia.style.transition = 'none';
    swipeStage.setPointerCapture(pointerId);
    updateTransform();
  });

  swipeStage.addEventListener('pointermove', (event) => {
    if (!isDragging || event.pointerId !== pointerId) {
      return;
    }
    currentX = event.clientX;
  });

  swipeStage.addEventListener('pointerup', (event) => {
    releasePointer(event, false);
  });

  swipeStage.addEventListener('pointercancel', (event) => {
    releasePointer(event, true);
  });

  swipeStage.addEventListener('pointerleave', (event) => {
    if (event.pointerId === pointerId) {
      releasePointer(event, true);
    }
  });
}


let isPolling = true;

function stopPolling() {
  isPolling = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function resumePolling() {
  if (isPolling) {
    return;
  }
  isPolling = true;
  startPolling();
}

async function startPolling() {
  if (!isPolling) return;
  await fetchState();
  if (isPolling) {
    pollTimer = setTimeout(startPolling, POLL_INTERVAL_MS);
  }
}

function pauseForInactivity() {
  wasManuallyPaused = true;
  stopPolling();
}

function resumeFromInactivity() {
  if (!wasManuallyPaused) {
    return;
  }
  wasManuallyPaused = false;
  resumePolling();
  resetIdleTimer();
}

function handleVisibilityChange() {
  if (document.hidden) {
    stopPolling();
  } else if (!wasManuallyPaused) {
    resumePolling();
    resetIdleTimer();
  }
}

function resetIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }
  idleTimer = setTimeout(pauseForInactivity, IDLE_TIMEOUT_MS);
}

function markInteraction() {
  if (wasManuallyPaused) {
    resumeFromInactivity();
  } else {
    resetIdleTimer();
  }
}

function init() {
  if (!roomKey || !participantId) {
    redirectToSetup();
    return;
  }
  updateShareLinksWrapper();
  initShareSheetWrapper();
  initShareQrModalWrapper();
  initShareEmailFormWrapper();
  initSlider();
  initSwipeButtons();
  initPlayAgain();
  initSwipeGestures();
  startButton?.addEventListener('click', async () => {
    await startSession(undefined, { triggerButton: startButton });
  });
  startPolling();
  resetIdleTimer();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

window.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('pagehide', stopPolling);
window.addEventListener('focus', handleVisibilityChange);
window.addEventListener('pointerdown', markInteraction, { passive: true });
window.addEventListener('keydown', markInteraction, { passive: true });

window.addEventListener('beforeunload', () => {
  stopPolling();
  if (idleTimer) {
    clearTimeout(idleTimer);
  }
});
