import { getJson, postJson } from './app.js';

const params = new URLSearchParams(window.location.search);
const roomKey = (params.get('room_key') || '').toUpperCase();
const participantId = params.get('pid');
const participantNumericId = Number(participantId || 0);

const stateEndpoint = 'api/tinder_state.php';
const startEndpoint = 'api/tinder_start.php';
const swipeEndpoint = 'api/tinder_swipe.php';
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
const shareBar = document.getElementById('share-bar');
const shareLayer = document.getElementById('share-layer');
const shareCard = document.getElementById('share-card');
const shareOpen = document.getElementById('share-open');
const shareClose = document.getElementById('share-close');
const shareBackdrop = document.getElementById('share-backdrop');
const shareCopy = document.getElementById('share-copy');
const shareFeedback = document.getElementById('share-feedback');
const shareLinks = document.getElementById('share-links');

const SWIPE_THRESHOLD = 60;

let isHost = false;
let currentSession = null;
let positions = [];
let selfSwipes = new Map();
let pollTimer = null;
let submittingSwipe = false;
let everyoneReady = false;
let allFinished = false;
let shareSheetReady = false;
let availablePool = 100;
let forceSetupVisible = false;

function redirectToSetup() {
  window.location.replace('tinder-dla-sexu-room.html');
}

function normalizeShareUrl() {
  if (!roomKey) {
    return '';
  }
  const shareUrl = new URL('tinder-dla-sexu-invite.html', window.location.href);
  shareUrl.searchParams.set('room_key', roomKey);
  return shareUrl.toString();
}

function updateShareLinks() {
  if (!shareOpen || !shareCopy || !shareLinks) {
    return;
  }
  const url = normalizeShareUrl();
  if (!url) {
    shareOpen.disabled = true;
    shareCopy.disabled = true;
    shareLinks.querySelectorAll('a').forEach((anchor) => {
      anchor.setAttribute('aria-disabled', 'true');
      anchor.setAttribute('tabindex', '-1');
      anchor.removeAttribute('href');
    });
    return;
  }
  const message = `Dołącz do mnie w grze Tinder dla sexu: ${url}`;
  shareCopy.disabled = false;
  shareLinks.querySelectorAll('a').forEach((anchor) => {
    const channel = anchor.dataset.shareChannel;
    let target = '';
    if (channel === 'messenger') {
      target = `https://m.me/?text=${encodeURIComponent(message)}`;
    } else if (channel === 'whatsapp') {
      target = `https://wa.me/?text=${encodeURIComponent(message)}`;
    } else if (channel === 'sms') {
      target = `sms:&body=${encodeURIComponent(message)}`;
    }
    if (target) {
      anchor.href = target;
      anchor.removeAttribute('aria-disabled');
      anchor.removeAttribute('tabindex');
    }
  });
}

function initShareSheet() {
  if (!shareLayer || !shareCard || !shareOpen || !shareClose) {
    return;
  }
  shareLayer.hidden = false;
  shareLayer.dataset.open = 'false';
  shareLayer.setAttribute('aria-hidden', 'true');
  shareOpen.disabled = false;
  shareOpen.setAttribute('aria-expanded', 'false');

  const closeSheet = () => {
    shareLayer.dataset.open = 'false';
    shareLayer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('share-layer-open');
    shareOpen.setAttribute('aria-expanded', 'false');
  };

  const openSheet = () => {
    if (shareLayer.dataset.open === 'true') {
      closeSheet();
      return;
    }
    shareLayer.dataset.open = 'true';
    shareLayer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('share-layer-open');
    shareOpen.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => {
      shareCard.focus({ preventScroll: true });
    });
  };

  shareOpen.addEventListener('click', () => {
    openSheet();
  });

  shareClose.addEventListener('click', () => {
    closeSheet();
  });

  if (shareBackdrop) {
    shareBackdrop.addEventListener('click', () => closeSheet());
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && shareLayer.dataset.open === 'true') {
      event.preventDefault();
      closeSheet();
    }
  });

  shareCopy?.addEventListener('click', async () => {
    const url = normalizeShareUrl();
    if (!url || !shareFeedback) {
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.top = '-1000px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      shareFeedback.textContent = 'Skopiowano link do schowka.';
      shareFeedback.hidden = false;
      shareFeedback.dataset.tone = 'success';
      setTimeout(() => {
        shareFeedback.hidden = true;
      }, 4000);
    } catch (error) {
      console.error(error);
      shareFeedback.textContent = 'Nie udało się skopiować linku. Spróbuj ręcznie.';
      shareFeedback.hidden = false;
      shareFeedback.dataset.tone = 'error';
    }
  });

  shareSheetReady = true;
  updateShareLinks();
}

function updateShareVisibility() {
  if (!shareBar) {
    return;
  }
  if (isHost) {
    shareBar.hidden = false;
    if (!shareSheetReady) {
      initShareSheet();
    }
  } else {
    shareBar.hidden = true;
    if (shareLayer) {
      shareLayer.dataset.open = 'false';
      shareLayer.setAttribute('aria-hidden', 'true');
    }
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

function updateSummary(matches) {
  if (!summaryCard || !summaryLead) {
    return;
  }
  if (allFinished) {
    summaryCard.hidden = false;
    summaryLead.textContent = 'Wybraliśmy dla Was wszystkie wspólne typy. Zainspirujcie się nimi dziś wieczorem!';
    renderMatches(matches);
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

  isHost = Boolean(payload.self?.is_host);
  everyoneReady = Boolean(payload.everyone_ready);
  allFinished = Boolean(payload.all_finished);
  currentSession = payload.session || null;
  positions = Array.isArray(currentSession?.positions) ? currentSession.positions : [];
  selfSwipes = new Map(Object.entries(payload.self_swipes || {}));
  const progressMap = payload.progress || {};

  updateSetupVisibility();
  updateShareVisibility();

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

  forceSetupVisible = false;
  updateSetupVisibility();
  updatePartnerProgress(progressMap, positions.length);
  updateSwipeCard();
  updateSummary(payload.matches || []);
}

async function startSession() {
  if (!isHost || !roomKey || !participantId || !setupSlider) {
    return;
  }
  const count = Number(setupSlider.value) || 1;
  startButton.disabled = true;
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
    await fetchState();
  } catch (error) {
    console.error(error);
    alert(error.message || 'Nie udało się przygotować nowej rundy.');
  } finally {
    startButton.disabled = false;
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
    if (!isHost) {
      summaryLead.textContent = 'Poczekaj, aż gospodarz uruchomi kolejną rundę.';
      return;
    }
    forceSetupVisible = true;
    summaryLead.textContent = 'Wybierz liczbę kart i zacznijcie od nowa.';
    updateSetupVisibility();
    hostSetupCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function initSwipeGestures() {
  if (!swipeStage) {
    return;
  }
  let pointerId = null;
  let startX = 0;
  let currentX = 0;

  const resetTransform = () => {
    swipeMedia.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
    swipeMedia.style.transform = 'translateX(0) rotate(0)';
    swipeMedia.style.opacity = '1';
    setTimeout(() => {
      swipeMedia.style.transition = '';
    }, 200);
  };

  swipeStage.addEventListener('pointerdown', (event) => {
    if (!everyoneReady || submittingSwipe || !currentSession || swipeMedia.hidden) {
      return;
    }
    pointerId = event.pointerId;
    startX = event.clientX;
    currentX = startX;
    swipeStage.setPointerCapture(pointerId);
  });

  swipeStage.addEventListener('pointermove', (event) => {
    if (pointerId === null || event.pointerId !== pointerId) {
      return;
    }
    currentX = event.clientX;
    const deltaX = currentX - startX;
    const rotation = deltaX / 20;
    const opacity = Math.max(0.2, 1 - Math.abs(deltaX) / 300);
    swipeMedia.style.transform = `translateX(${deltaX}px) rotate(${rotation}deg)`;
    swipeMedia.style.opacity = `${opacity}`;
  });

  const releasePointer = (event) => {
    if (pointerId === null || event.pointerId !== pointerId) {
      return;
    }
    const deltaX = currentX - startX;
    pointerId = null;
    swipeStage.releasePointerCapture(event.pointerId);
    resetTransform();
    if (deltaX > SWIPE_THRESHOLD) {
      submitSwipe('like');
    } else if (deltaX < -SWIPE_THRESHOLD) {
      submitSwipe('dislike');
    }
  };

  swipeStage.addEventListener('pointerup', releasePointer);
  swipeStage.addEventListener('pointercancel', releasePointer);
  swipeStage.addEventListener('pointerleave', (event) => {
    if (pointerId !== null && event.pointerId === pointerId) {
      pointerId = null;
      swipeStage.releasePointerCapture(event.pointerId);
      resetTransform();
    }
  });
}

function startPolling() {
  fetchState();
  if (pollTimer) {
    clearInterval(pollTimer);
  }
  pollTimer = setInterval(fetchState, 4000);
}

function init() {
  if (!roomKey || !participantId) {
    redirectToSetup();
    return;
  }
  updateShareLinks();
  initShareSheet();
  initSlider();
  initSwipeButtons();
  initPlayAgain();
  initSwipeGestures();
  startButton?.addEventListener('click', startSession);
  startPolling();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

window.addEventListener('beforeunload', () => {
  if (pollTimer) {
    clearInterval(pollTimer);
  }
});
