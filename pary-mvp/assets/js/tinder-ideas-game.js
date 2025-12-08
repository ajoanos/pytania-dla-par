import { appendTokenToUrl, getJson, postJson } from './app.js';
import { initShareSheet, initShareQrModal, initShareEmailForm, updateShareLinks } from './share.js';

const SWIPE_THRESHOLD = 60;
const EMAIL_ENDPOINT = 'api/send_positions_email.php';
const SHARE_EMAIL_SUBJECT = 'Tinder wspólnych pomysłów – dołącz do mnie';
const IDEAS_DATA_URL = 'api/tinder_ideas_catalog.php';

const params = new URLSearchParams(window.location.search);
const roomKey = (params.get('room_key') || '').toUpperCase();
const participantId = params.get('pid');
const participantNumericId = Number(participantId || 0);
const token = params.get('token') || '';

const stateEndpoint = 'api/tinder_ideas_state.php';
const startEndpoint = 'api/tinder_ideas_start.php';
const swipeEndpoint = 'api/tinder_ideas_swipe.php';
const replayVoteEndpoint = 'api/tinder_ideas_replay_vote.php';
const VISIBLE_POLL_INTERVAL_MS = 5000;
const HIDDEN_POLL_INTERVAL_MS = 20000;
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

// DOM Elements (initialized in init)
let hostSetupCard = null;
let categoryList = null;
let selectAllButton = null;
let setupHint = null;
let startButton = null;
let swipeCard = null;
let swipeStatus = null;
let swipePlaceholder = null;
let swipeMedia = null;
let swipeText = null;
let swipeCategory = null;
let swipeStage = null;
let swipeButtons = [];
let partnerProgress = null;
let progressLabel = null;
let progressBar = null;
let summaryCard = null;
let summaryLead = null;
let summaryEmpty = null;
let matchList = null;
let playAgainButton = null;
let playAgainDefaultLabel = '';

let shareBar = null;
let shareLayer = null;
let shareCard = null;
let shareOpen = null;
let shareClose = null;
let shareBackdrop = null;
let shareCopy = null;
let shareFeedback = null;
let shareLinks = null;
let shareQrButton = null;
let shareQrModal = null;
let shareQrImage = null;
let shareQrUrl = null;
let shareQrClose = null;
let shareEmailForm = null;
let shareEmailInput = null;
let shareEmailFeedback = null;


let isHost = false;
let currentSession = null;
let positions = [];
let selfSwipes = new Map();
let pollTimer = null;
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
let ideaCategories = [];
let selectedCategories = new Set();
let idleTimer = null;
let pausedForIdle = false;

function redirectToSetup() {
  window.location.replace(appendTokenToUrl('tinder-wspolnych-pomyslow-room.html', token));
}

function normalizeShareUrl() {
  if (!roomKey) {
    return '';
  }
  const baseUrl = appendTokenToUrl('tinder-wspolnych-pomyslow-invite.html', token);
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
    return `${trimmedName} zaprasza Cię do wspólnej gry w Tinder wspólnych pomysłów. Kliknij, aby dołączyć: ${safeUrl}`;
  }
  return `Dołącz do mnie w Tinder wspólnych pomysłów. Kliknij, aby dołączyć: ${safeUrl}`;
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

function getSelectedCategoryIds() {
  if (!ideaCategories.length) {
    return [];
  }
  return Array.from(selectedCategories);
}

function updateSetupLimits() {
  const activeCategories = new Set(getSelectedCategoryIds());
  availablePool = ideaCategories.reduce((total, category) => {
    if (activeCategories.size > 0 && activeCategories.has(category.id)) {
      return total + (Array.isArray(category.prompts) ? category.prompts.length : 0);
    }
    return total;
  }, 0);

  if (setupHint) {
    if (!ideaCategories.length) {
      setupHint.textContent = 'Dodaj przykładowe kategorie i zdania do pliku danych, aby rozpocząć grę.';
    } else if (availablePool === 0) {
      setupHint.textContent = 'Zaznacz przynajmniej jedną kategorię, żeby wylosować pomysły.';
    } else {
      setupHint.textContent = `Losujemy 10 zdań z ${activeCategories.size ? 'wybranych' : 'wszystkich'} kategorii (${availablePool} w puli).`;
    }
  }

  if (startButton) {
    startButton.disabled = availablePool === 0;
  }
}

function renderCategoryChips() {
  if (!categoryList) {
    return;
  }
  categoryList.innerHTML = '';
  const fragment = document.createDocumentFragment();
  const activeSelection = selectedCategories;

  ideaCategories.forEach((category) => {
    const label = document.createElement('label');
    label.className = 'category-chip';
    if (category.color) {
      label.style.setProperty('--category-color', category.color);
    }
    if (category.accent) {
      label.style.setProperty('--category-accent', category.accent);
      label.style.setProperty('--category-shade', category.accent);
    }

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'idea-category';
    input.value = category.id;
    input.checked = activeSelection.has(category.id);
    input.addEventListener('change', () => {
      toggleCategorySelection(category.id, input.checked);
    });

    const dot = document.createElement('span');
    dot.className = 'category-chip__dot';
    const text = document.createElement('span');
    text.textContent = category.name;

    label.append(input, dot, text);
    fragment.append(label);
  });

  categoryList.append(fragment);
  if (selectAllButton) {
    selectAllButton.disabled = ideaCategories.length === 0;
  }
  updateSetupLimits();
}

function toggleCategorySelection(categoryId, isSelected) {
  if (!categoryId) {
    return;
  }
  if (isSelected) {
    selectedCategories.add(categoryId);
  } else {
    selectedCategories.delete(categoryId);
  }
  renderCategoryChips();
}

function selectAllCategories() {
  selectedCategories = new Set(ideaCategories.map((item) => item.id));
  renderCategoryChips();
}

async function loadIdeaCatalog() {
  try {
    const response = await fetch(IDEAS_DATA_URL);
    if (!response.ok) {
      throw new Error('Nie udało się pobrać listy kategorii.');
    }
    const data = await response.json();
    if (Array.isArray(data)) {
      ideaCategories = data;
      selectedCategories = new Set();
      renderCategoryChips();
    }
  } catch (error) {
    console.error(error);
    if (setupHint) {
      setupHint.textContent = 'Nie udało się wczytać kategorii. Sprawdź plik danych.';
    }
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
  if (!swipeCard || !swipeStatus || !swipePlaceholder || !swipeMedia || !swipeText) {
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
      ? 'Macie już wyniki. Zobaczcie listę wspólnych pomysłów poniżej.'
      : 'Ty już skończyłeś/ skończyłaś. Daj partnerowi chwilkę na dokończenie.';
    swipeMedia.hidden = true;
    return;
  }

  swipeStatus.textContent = 'Przeczytaj zdanie: w prawo – bierzemy, w lewo – pomijamy.';
  swipePlaceholder.hidden = true;
  swipeMedia.hidden = false;
  const position = positions[index];
  swipeText.textContent = position.text || position.title || 'Pomysł';
  if (swipeCategory) {
    const categoryLabel = position.category_name || position.category || '';
    swipeCategory.textContent = categoryLabel;
    swipeCategory.hidden = categoryLabel === '';
    if (position.color) {
      swipeCategory.style.setProperty('--category-color', position.color);
    }
    if (position.accent) {
      swipeCategory.style.setProperty('--category-accent', position.accent);
      swipeCategory.style.setProperty('--category-shade', position.accent);
    }
  }
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
    figure.className = 'position-card position-card--compact position-card--text';
    const caption = document.createElement('figcaption');
    caption.className = 'position-card__title';
    caption.textContent = position.text || position.title || 'Pomysł';
    if (position.category_name || position.category) {
      const badge = document.createElement('span');
      badge.className = 'category-chip category-chip--static';
      badge.textContent = position.category_name || position.category;
      if (position.color) {
        badge.style.setProperty('--category-color', position.color);
      }
      if (position.accent) {
        badge.style.setProperty('--category-accent', position.accent);
        badge.style.setProperty('--category-shade', position.accent);
      }
      figure.appendChild(badge);
    }
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
    playAgainButton.textContent = isHost ? 'Czekamy na start nowej tury' : 'Czekamy na gospodarza…';
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
    let summaryText = 'Wybraliśmy dla Was wszystkie wspólne pomysły. Zainspirujcie się nimi dziś wieczorem!';
    if (replayReady) {
      summaryText = isHost
        ? 'Oboje chcecie grać dalej. Kliknij „Zaczynamy zabawę”, by wylosować nowe zdania.'
        : 'Oboje chcecie grać dalej. Czekamy na gospodarza, aż uruchomi kolejną turę.';
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
  updateSetupLimits();

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

async function startSession(_, options = {}) {
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
  const categories = getSelectedCategoryIds();
  const count = Math.max(1, Math.min(10, availablePool || 10));

  const buttonToDisable = triggerButton || (isHost ? startButton : null);
  if (buttonToDisable) {
    buttonToDisable.disabled = true;
  }

  try {
    const payload = await postJson(startEndpoint, {
      room_key: roomKey,
      participant_id: participantId,
      count,
      categories,
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
  if (submittingSwipe || !currentSession || !roomKey || !participantId) {
    return;
  }
  const index = getCurrentIndex();
  if (index < 0 || index >= positions.length) {
    return;
  }
  const position = positions[index];
  submittingSwipe = true;
  swipeButtons.forEach((button) => {
    button.disabled = true;
  });
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
    selfSwipes.set(position.id, choice);
    updateSwipeCard();
    fetchState();
  } catch (error) {
    console.error(error);
    alert(error.message || 'Nie udało się zapisać wyboru.');
  } finally {
    submittingSwipe = false;
    swipeButtons.forEach((button) => {
      button.disabled = false;
    });
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

function getPollInterval() {
  return document.visibilityState === 'hidden' ? HIDDEN_POLL_INTERVAL_MS : VISIBLE_POLL_INTERVAL_MS;
}

function resetIdleTimer() {
  if (!isPolling) {
    return;
  }
  if (idleTimer) {
    clearTimeout(idleTimer);
  }
  idleTimer = setTimeout(pauseForIdle, IDLE_TIMEOUT_MS);
}

function scheduleNextPoll() {
  if (!isPolling || pausedForIdle) {
    return;
  }
  if (pollTimer) {
    clearTimeout(pollTimer);
  }
  pollTimer = setTimeout(startPolling, getPollInterval());
}

async function startPolling() {
  if (!isPolling || pausedForIdle) return;
  await fetchState();
  if (isPolling && !pausedForIdle) {
    scheduleNextPoll();
  }
}

function pauseForIdle() {
  if (pausedForIdle || !isPolling) {
    return;
  }
  pausedForIdle = true;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function resumeAfterIdle() {
  if (!pausedForIdle || !isPolling) {
    return;
  }
  pausedForIdle = false;
  resetIdleTimer();
  startPolling();
}

function stopPolling() {
  isPolling = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

let initialized = false;

function init() {
  hostSetupCard = document.getElementById('host-setup');
  categoryList = document.getElementById('idea-category-list');
  selectAllButton = document.getElementById('idea-select-all');
  setupHint = document.getElementById('setup-hint');
  startButton = document.getElementById('start-session');
  swipeCard = document.getElementById('swipe-card');
  swipeStatus = document.getElementById('swipe-status');
  swipePlaceholder = document.getElementById('swipe-placeholder');
  swipeMedia = document.getElementById('swipe-media');
  swipeText = document.getElementById('swipe-text');
  swipeCategory = document.getElementById('swipe-category');
  swipeStage = document.getElementById('swipe-stage');
  swipeButtons = document.querySelectorAll('.swipe-button');
  partnerProgress = document.getElementById('partner-progress');
  progressLabel = document.getElementById('progress-label');
  progressBar = document.getElementById('progress-bar');
  summaryCard = document.getElementById('match-summary');
  summaryLead = document.getElementById('summary-lead');
  summaryEmpty = document.getElementById('summary-empty');
  matchList = document.getElementById('match-list');
  playAgainButton = document.getElementById('play-again');

  if (playAgainButton) {
    playAgainDefaultLabel = playAgainButton.textContent?.trim() || 'Gramy jeszcze raz?';
    playAgainButton.disabled = true;
  }

  shareBar = document.getElementById('share-bar');
  shareLayer = document.getElementById('share-layer');
  shareCard = document.getElementById('share-card');
  shareOpen = document.getElementById('share-open');
  shareClose = document.getElementById('share-close');
  shareBackdrop = document.getElementById('share-backdrop');
  shareCopy = document.getElementById('share-copy');
  shareFeedback = document.getElementById('share-feedback');
  shareLinks = document.getElementById('share-links');
  shareQrButton = document.getElementById('share-show-qr');
  shareQrModal = document.getElementById('share-qr-modal');
  shareQrImage = document.getElementById('share-qr-image');
  shareQrUrl = document.getElementById('share-qr-url');
  shareQrClose = document.getElementById('share-qr-close');
  shareEmailForm = document.getElementById('share-email');
  shareEmailInput = document.getElementById('share-email-input');
  shareEmailFeedback = document.getElementById('share-email-feedback');

  if (!roomKey || !participantId) {
    redirectToSetup();
    return;
  }
  updateShareLinksWrapper();
  initShareSheetWrapper();
  initShareQrModalWrapper();
  initShareEmailFormWrapper();
  loadIdeaCatalog();
  selectAllButton?.addEventListener('click', () => selectAllCategories());
  initSwipeButtons();
  initPlayAgain();
  initSwipeGestures();
  startButton?.addEventListener('click', async () => {
    await startSession(undefined, { triggerButton: startButton });
  });
  resetIdleTimer();
  startPolling();
}

function initWhenReady() {
  if (initialized) {
    return;
  }
  const runInit = () => {
    if (initialized) {
      return;
    }
    initialized = true;
    init();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInit, { once: true });
  } else {
    runInit();
  }
}

window.initMomentyGame = initWhenReady;

if (window.__momentyAccessConfirmed) {
  initWhenReady();
}

window.addEventListener('beforeunload', () => {
  stopPolling();
});

document.addEventListener('visibilitychange', () => {
  if (!isPolling) {
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
    if (!isPolling) {
      return;
    }
    if (pausedForIdle) {
      resumeAfterIdle();
      return;
    }
    resetIdleTimer();
  });
});
