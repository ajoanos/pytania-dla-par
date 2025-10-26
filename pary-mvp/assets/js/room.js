import { postJson, getJson } from './app.js';

const params = new URLSearchParams(window.location.search);
const roomKey = (params.get('room_key') || '').toUpperCase();
const participantId = params.get('pid');

if (!roomKey || !participantId) {
  window.location.replace('index.html');
}

const roomLabel = document.getElementById('room-label');
const participantsList = document.getElementById('participants-list');
const questionCard = document.getElementById('question-card');
const questionEmpty = document.getElementById('question-empty');
const questionEmptyText = document.getElementById('question-empty-text');
const questionCategory = document.getElementById('question-category');
const questionId = document.getElementById('question-id');
const questionText = document.getElementById('question-text');
const nextQuestionButton = document.getElementById('next-question');
const reactionButtons = document.getElementById('reaction-buttons');
const reactionsList = document.getElementById('reactions-list');
const categorySelect = document.getElementById('category-select');
const catalogContainer = document.getElementById('category-browser');
const catalogCategories = document.getElementById('catalog-categories');
const catalogQuestions = document.getElementById('catalog-questions');
const catalogCategoryTitle = document.getElementById('catalog-category-title');
const catalogList = document.getElementById('catalog-list');
const catalogEmpty = document.getElementById('catalog-empty');
const roomContent = document.getElementById('room-content');
const hostRequestsOverlay = document.getElementById('host-requests-overlay');
const hostRequestsPanel = document.getElementById('host-requests');
const hostRequestsList = document.getElementById('host-requests-list');
const hostRequestsEmpty = document.getElementById('host-requests-empty');
const shareCard = document.getElementById('share-card');
const shareCopyButton = document.getElementById('share-copy-link');
const shareQrButton = document.getElementById('share-show-qr');
const shareCopyFeedback = document.getElementById('share-copy-feedback');
const shareQrModal = document.getElementById('share-qr-modal');
const shareQrImage = document.getElementById('share-qr-image');
const shareQrUrl = document.getElementById('share-qr-url');
const shareQrClose = document.getElementById('share-qr-close');
const videoPreview = document.getElementById('video-preview');
const remoteVideoWrapper = document.getElementById('remote-video-wrapper');
const remoteVideo = document.getElementById('remote-video');
const remotePlaceholder = document.getElementById('remote-placeholder');
const localVideoWrapper = document.getElementById('local-video-wrapper');
const localVideo = document.getElementById('local-video');
const videoStatus = document.getElementById('video-status');

const defaultTitle = document.title;
let selfInfo = null;
let previousPendingCount = 0;
let pulseTimer = null;
let pulseTarget = null;
let pulseClass = '';
let lastKnownStatus = '';
let hasRedirectedToWaiting = false;
let shareFeedbackTimer = null;
let videoStatusHideTimer = null;
let localStream = null;
let remoteStream = null;

const waitingRoomPath = 'room-waiting.html';
const shareLinkUrl = buildShareUrl();

let currentQuestion = null;
let pollTimer;
let presenceTimer;
let allQuestions = [];
let activeCategory = '';

function isActiveParticipant() {
  return (selfInfo?.status || '') === 'active';
}

roomLabel.textContent = roomKey;

setupCategoryOptions();
startVideoPreview();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (!isStreamActive(localStream)) {
      startVideoPreview(true);
    } else {
      attachLocalStream(localStream);
    }
    if (remoteStream) {
      if (isStreamActive(remoteStream)) {
        attachRemoteStream(remoteStream);
      } else {
        clearRemoteStream();
      }
    }
  }
});

nextQuestionButton?.addEventListener('click', async () => {
  try {
    if (!isActiveParticipant()) {
      alert('Musisz poczekać na akceptację gospodarza.');
      return;
    }
    nextQuestionButton.disabled = true;
    const payload = await postJson('api/next_question.php', {
      room_key: roomKey,
      category: categorySelect?.value || undefined,
    });
    if (!payload.ok) {
      throw new Error(payload.error || 'Nie udało się wylosować pytania.');
    }
    applyQuestion(payload.current_question);
  } catch (error) {
    console.error(error);
    alert(error.message);
  } finally {
    nextQuestionButton.disabled = false;
  }
});

catalogCategories?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest('.catalog__category');
  if (!(button instanceof HTMLElement)) return;
  const { category } = button.dataset;
  if (!category) return;
  showCategoryQuestions(category);
});

catalogList?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest('.catalog__question');
  if (!(button instanceof HTMLButtonElement)) return;
  if (!isActiveParticipant()) {
    alert('Musisz poczekać na akceptację gospodarza.');
    return;
  }
  const questionId = button.dataset.questionId;
  if (!questionId) return;
  await chooseQuestionById(questionId, button);
});

reactionButtons?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.action;
  if (!action || !currentQuestion) return;
  if (!isActiveParticipant()) {
    alert('Musisz poczekać na akceptację gospodarza.');
    return;
  }
  try {
    target.disabled = true;
    const payload = await postJson('api/react.php', {
      room_key: roomKey,
      participant_id: participantId,
      question_id: currentQuestion.id,
      action,
    });
    if (!payload.ok) {
      throw new Error(payload.error || 'Nie udało się zapisać reakcji.');
    }
    setQuestionHighlight(action);
    await refreshState();
  } catch (error) {
    console.error(error);
    alert(error.message);
  } finally {
    target.disabled = false;
  }
});

hostRequestsList?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest('button[data-action]');
  if (!(button instanceof HTMLButtonElement)) return;
  const item = button.closest('.requests__item');
  const requestId = item?.dataset.requestId;
  const decision = button.dataset.action;
  if (!requestId || !decision) return;
  await respondToRequest(requestId, decision, button);
});

shareCopyButton?.addEventListener('click', () => {
  copyShareLink();
});

shareQrButton?.addEventListener('click', () => {
  openQrModal();
});

shareQrClose?.addEventListener('click', () => {
  closeQrModal();
});

shareQrModal?.addEventListener('click', (event) => {
  if (event.target === shareQrModal) {
    closeQrModal();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !shareQrModal?.hidden) {
    closeQrModal();
  }
});

function setVideoStatus(message, { persist = true, hideAfter = 4000 } = {}) {
  if (!videoStatus) {
    return;
  }
  clearTimeout(videoStatusHideTimer);
  if (!message) {
    videoStatus.hidden = true;
    videoStatus.textContent = '';
    return;
  }
  videoStatus.textContent = message;
  videoStatus.hidden = false;
  if (!persist) {
    videoStatusHideTimer = window.setTimeout(() => {
      setVideoStatus('');
    }, hideAfter);
  }
}

function ensureVideoPlays(video) {
  if (!video || !video.srcObject) {
    return;
  }
  if (video.paused) {
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  }
}

function isStreamActive(stream) {
  return !!stream && stream.getTracks().some((track) => track.readyState === 'live');
}

function stopLocalStream() {
  if (!localStream) {
    return;
  }
  localStream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch (error) {
      console.warn('Nie udało się zatrzymać toru lokalnego podglądu.', error);
    }
  });
  localStream = null;
}

function showRemotePlaceholder(show) {
  if (remotePlaceholder) {
    remotePlaceholder.hidden = !show;
  }
}

function attachLocalStream(stream) {
  if (!localVideo) {
    return;
  }
  localVideo.srcObject = stream;
  localVideo.muted = true;
  ensureVideoPlays(localVideo);
  if (localVideoWrapper) {
    localVideoWrapper.hidden = true;
    localVideoWrapper.setAttribute('aria-hidden', 'true');
  }
}

function attachRemoteStream(stream) {
  const isMediaStream =
    (typeof MediaStream !== 'undefined' && stream instanceof MediaStream) ||
    (!!stream && typeof stream === 'object' && typeof stream.getTracks === 'function');
  if (!isMediaStream || !remoteVideo) {
    return;
  }
  remoteStream = stream;
  remoteVideo.srcObject = stream;
  ensureVideoPlays(remoteVideo);
  if (remoteVideoWrapper) {
    remoteVideoWrapper.hidden = false;
  }
  showRemotePlaceholder(false);
  setVideoStatus('Połączono z kamerą partnera.', { persist: false, hideAfter: 6000 });
}

function clearRemoteStream() {
  if (remoteVideo) {
    remoteVideo.srcObject = null;
  }
  remoteStream = null;
  showRemotePlaceholder(true);
  setVideoStatus('Czekamy na połączenie kamery partnera…', { persist: true });
}

async function startVideoPreview(forceRestart = false) {
  if (!videoPreview) {
    return;
  }
  const canUseMedia = !!navigator.mediaDevices?.getUserMedia;
  videoPreview.hidden = false;
  showRemotePlaceholder(true);
  if (!canUseMedia) {
    setVideoStatus('Twoja przeglądarka nie obsługuje podglądu wideo.', { persist: true });
    return;
  }
  if (!forceRestart && isStreamActive(localStream)) {
    attachLocalStream(localStream);
    setVideoStatus('Twoja kamera działa. Czekamy na obraz partnera…', { persist: true });
    return;
  }
  if (forceRestart) {
    stopLocalStream();
  }
  try {
    setVideoStatus('Łączenie z kamerą…', { persist: true });
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 360 },
      },
      audio: true,
    });
    localStream = stream;
    attachLocalStream(stream);
    setVideoStatus('Twoja kamera działa. Czekamy na obraz partnera…', { persist: true });
  } catch (error) {
    console.error('Nie udało się włączyć podglądu wideo:', error);
    setVideoStatus('Nie udało się uruchomić kamery. Sprawdź uprawnienia.', { persist: true });
  }
}

window.pdpVideo = {
  setRemoteStream: attachRemoteStream,
  clearRemoteStream,
};

async function refreshState() {
  try {
    const payload = await getJson(
      `api/state.php?room_key=${encodeURIComponent(roomKey)}&participant_id=${encodeURIComponent(participantId)}`,
    );
    if (!payload.ok) {
      throw new Error(payload.error || 'Nie udało się pobrać stanu.');
    }
    selfInfo = payload.self || null;
    if (maybeRedirectToWaiting(selfInfo)) {
      return;
    }
    updateAccessState(selfInfo);
    renderParticipants(payload.participants || []);
    const reactions = payload.reactions || [];
    if (payload.current_question) {
      applyQuestion(payload.current_question);
      updateQuestionHighlight(reactions);
    } else {
      clearQuestion();
    }
    renderReactions(reactions);
    renderHostRequests(payload.pending_requests || []);
  } catch (error) {
    console.error(error);
  }
}

function renderParticipants(participants) {
  if (!participantsList) {
    return;
  }

  const normalized = Array.isArray(participants) ? [...participants] : [];

  if (selfInfo && selfInfo.status === 'active') {
    const selfId = Number(selfInfo.id);
    const alreadyListed = normalized.some((participant) => Number(participant.id) === selfId);
    if (!alreadyListed) {
      normalized.unshift({
        id: selfId,
        display_name: selfInfo.display_name || 'Ty',
        last_seen: new Date().toISOString(),
      });
    }
  }

  participantsList.innerHTML = '';
  const now = Date.now();
  normalized.forEach((participant) => {
    const li = document.createElement('li');
    li.textContent = participant.display_name;
    const status = document.createElement('span');
    status.className = 'participants__status';
    const lastSeen = participant.last_seen ? Date.parse(participant.last_seen) : 0;
    const diff = now - lastSeen;
    status.textContent = diff < 20000 ? 'online' : 'offline';
    li.appendChild(status);
    participantsList.appendChild(li);
  });
}

function renderReactions(reactions) {
  if (!reactionsList) {
    return;
  }
  reactionsList.innerHTML = '';
  const labels = {
    ok: 'OK',
    skip: 'Pomiń',
    fav: 'Ulubione',
  };
  reactions.forEach((reaction) => {
    const li = document.createElement('li');
    li.className = 'reactions__item';
    const label = labels[reaction.action] || reaction.action;
    const meta = document.createElement('div');
    meta.className = 'reactions__meta';

    const name = document.createElement('span');
    name.className = 'reactions__author';
    name.textContent = reaction.display_name || 'Ktoś';

    const action = document.createElement('span');
    action.className = 'reactions__label';
    action.textContent = label;

    meta.appendChild(name);
    meta.appendChild(action);
    li.appendChild(meta);

    const questionText = reaction.question_text || '';
    if (questionText) {
      const question = document.createElement('p');
      question.className = 'reactions__question';
      question.textContent = questionText;
      li.appendChild(question);
    }

    reactionsList.appendChild(li);
  });
}

function renderHostRequests(requests) {
  if (!hostRequestsPanel || !selfInfo || !selfInfo.is_host) {
    hideHostRequests();
    return;
  }

  const pending = Array.isArray(requests) ? requests : [];
  if (pending.length === 0) {
    hideHostRequests();
    return;
  }

  const pendingCount = pending.length;
  const hasNewRequests = pendingCount > previousPendingCount;

  updateHostRequestsVisibility(pendingCount);

  if (hostRequestsEmpty) {
    hostRequestsEmpty.hidden = true;
  }
  if (hostRequestsList) {
    hostRequestsList.innerHTML = '';
  }

  pending.forEach((request) => {
    if (!hostRequestsList) return;
    const item = document.createElement('li');
    item.className = 'requests__item';
    item.dataset.requestId = String(request.id);

    const name = document.createElement('span');
    name.className = 'requests__name';
    name.textContent = request.display_name;

    const actions = document.createElement('div');
    actions.className = 'requests__actions';

    const approve = document.createElement('button');
    approve.type = 'button';
    approve.className = 'btn btn--primary';
    approve.dataset.action = 'approve';
    approve.textContent = 'Akceptuj';

    const reject = document.createElement('button');
    reject.type = 'button';
    reject.className = 'btn btn--ghost';
    reject.dataset.action = 'reject';
    reject.textContent = 'Odrzuć';

    actions.appendChild(approve);
    actions.appendChild(reject);
    item.appendChild(name);
    item.appendChild(actions);
    hostRequestsList.appendChild(item);
  });

  if (hasNewRequests) {
    triggerHostRequestsPulse();
    const firstAction = hostRequestsList?.querySelector('button');
    firstAction?.focus();
  }

  document.title = `(${pendingCount}) ${defaultTitle}`;
  previousPendingCount = pendingCount;
}

function hideHostRequests() {
  if (hostRequestsOverlay) {
    hostRequestsOverlay.hidden = true;
    hostRequestsOverlay.setAttribute('aria-hidden', 'true');
  }
  if (!hostRequestsPanel) {
    return;
  }
  hostRequestsPanel.hidden = true;
  hostRequestsPanel.classList.remove('host-requests--pulse');
  if (hostRequestsList) {
    hostRequestsList.innerHTML = '';
  }
  if (hostRequestsEmpty) {
    hostRequestsEmpty.hidden = false;
  }
  document.title = defaultTitle;
  previousPendingCount = 0;
  if (pulseTimer) {
    clearTimeout(pulseTimer);
    pulseTimer = null;
  }
  pulseTarget = null;
  pulseClass = '';
}

function triggerHostRequestsPulse() {
  const { element, className } = getPulseTarget();
  if (!element || !className) {
    return;
  }
  element.classList.remove(className);
  if (pulseTimer) {
    clearTimeout(pulseTimer);
  }
  // Force reflow so animation retriggers
  void element.offsetWidth;
  element.classList.add(className);
  pulseTarget = element;
  pulseClass = className;
  pulseTimer = setTimeout(() => {
    if (pulseTarget && pulseClass) {
      pulseTarget.classList.remove(pulseClass);
    }
    pulseTimer = null;
    pulseTarget = null;
    pulseClass = '';
  }, 600);
}

function updateHostRequestsVisibility(count) {
  if (!hostRequestsPanel) {
    return;
  }

  const hasRequests = count > 0;

  if (!hasRequests) {
    hideHostRequests();
    return;
  }

  if (hostRequestsOverlay) {
    hostRequestsOverlay.hidden = false;
    hostRequestsOverlay.setAttribute('aria-hidden', 'false');
  }
  hostRequestsPanel.hidden = false;
}

function getPulseTarget() {
  if (hostRequestsPanel && !hostRequestsPanel.hidden) {
    return { element: hostRequestsPanel, className: 'host-requests--pulse' };
  }
  return { element: null, className: '' };
}

function updateQuestionHighlight(reactions) {
  if (!currentQuestion) {
    setQuestionHighlight(null);
    return;
  }
  const highlight = reactions.find((reaction) => reaction.question_id === currentQuestion.id);
  setQuestionHighlight(highlight?.action || null);
}

function setQuestionHighlight(action) {
  if (!questionCard) return;
  questionCard.classList.remove('question--reaction', 'question--reaction-ok', 'question--reaction-skip', 'question--reaction-fav');
  if (!action) {
    return;
  }
  const map = {
    ok: 'question--reaction-ok',
    skip: 'question--reaction-skip',
    fav: 'question--reaction-fav',
  };
  const className = map[action];
  if (className) {
    questionCard.classList.add('question--reaction', className);
  }
}

function applyQuestion(question) {
  currentQuestion = question;
  questionCategory.textContent = question.category;
  questionId.textContent = question.id;
  questionText.textContent = question.text;
  questionCard.hidden = false;
  updateQuestionEmptyState(true);
  setQuestionHighlight(null);
  reactionButtons.hidden = false;
}

function clearQuestion() {
  currentQuestion = null;
  questionCard.hidden = true;
  updateQuestionEmptyState(false);
  setQuestionHighlight(null);
  reactionButtons.hidden = true;
}

function updateQuestionEmptyState(hasQuestion) {
  if (!questionEmpty) {
    return;
  }
  questionEmpty.classList.toggle('question__empty--has-question', hasQuestion);
  if (questionEmptyText) {
    questionEmptyText.hidden = hasQuestion;
  }
}

function maybeRedirectToWaiting(participant) {
  if (hasRedirectedToWaiting) {
    return false;
  }
  if (!participant || participant.is_host) {
    return false;
  }
  const status = participant.status || 'unknown';
  if (status !== 'pending') {
    return false;
  }
  hasRedirectedToWaiting = true;
  const params = new URLSearchParams({
    room_key: roomKey,
    pid: participantId,
  });
  window.location.replace(`${waitingRoomPath}?${params.toString()}`);
  return true;
}

function updateAccessState(participant) {
  const status = participant?.status || 'unknown';
  const isActive = status === 'active';
  const isPending = status === 'pending';

  if (isActive && lastKnownStatus !== 'active') {
    sendPresence();
  }

  const hasFullAccess = Boolean(participant) && (status === 'active' || participant.is_host);
  if (roomContent) {
    roomContent.hidden = !hasFullAccess;
  }

  if (shareCard) {
    const shouldShowShare = Boolean(participant?.is_host);
    shareCard.hidden = !shouldShowShare;
    if (!shouldShowShare) {
      resetShareFeedback();
      closeQrModal();
    }
  }

  if (!hasFullAccess && !isPending && status !== lastKnownStatus) {
    let message = 'Trwa oczekiwanie na dostęp do pokoju.';
    if (!participant) {
      message = 'Nie znaleziono Twojego zgłoszenia w tym pokoju. Wróć do ekranu tworzenia pokoju.';
    } else if (status === 'rejected') {
      message = 'Gospodarz odrzucił Twoją prośbę o dołączenie. Możesz spróbować ponownie później.';
    }
    alert(message);
    window.location.replace('pytania-dla-par-room.html');
  }

  setInteractionEnabled(hasFullAccess && isActive);

  lastKnownStatus = status;
}

function buildShareUrl() {
  if (!roomKey) {
    return '';
  }
  const url = new URL('room-invite.html', window.location.href);
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
  if (!shareLinkUrl || !shareQrModal || !shareQrImage || !shareQrUrl) {
    return;
  }
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(shareLinkUrl)}`;
  shareQrImage.src = qrSrc;
  shareQrUrl.href = shareLinkUrl;
  shareQrModal.hidden = false;
  shareQrModal.setAttribute('aria-hidden', 'false');
}

function closeQrModal() {
  if (!shareQrModal) {
    return;
  }
  shareQrModal.hidden = true;
  shareQrModal.setAttribute('aria-hidden', 'true');
}

function showShareFeedback(message, isError = false) {
  if (!shareCopyFeedback) {
    return;
  }
  shareCopyFeedback.textContent = message;
  shareCopyFeedback.classList.toggle('share__feedback--error', isError);
  if (shareFeedbackTimer) {
    clearTimeout(shareFeedbackTimer);
  }
  shareFeedbackTimer = window.setTimeout(() => {
    resetShareFeedback();
  }, 4000);
}

function resetShareFeedback() {
  if (!shareCopyFeedback) {
    return;
  }
  if (shareFeedbackTimer) {
    clearTimeout(shareFeedbackTimer);
    shareFeedbackTimer = null;
  }
  shareCopyFeedback.textContent = '';
  shareCopyFeedback.classList.remove('share__feedback--error');
}

function setInteractionEnabled(enabled) {
  if (nextQuestionButton) {
    nextQuestionButton.disabled = !enabled;
  }
  if (categorySelect) {
    categorySelect.disabled = !enabled;
  }
  if (reactionButtons) {
    reactionButtons.querySelectorAll('button').forEach((button) => {
      button.disabled = !enabled;
    });
  }
}

async function respondToRequest(requestId, decision, triggerButton) {
  if (!selfInfo || !selfInfo.is_host) {
    return;
  }
  try {
    if (triggerButton) {
      triggerButton.disabled = true;
    }
    const payload = await postJson('api/respond_request.php', {
      room_key: roomKey,
      participant_id: participantId,
      request_id: Number(requestId),
      decision,
    });
    if (!payload.ok) {
      throw new Error(payload.error || 'Nie udało się zaktualizować zgłoszenia.');
    }
    updateHostRequestsVisibility(Math.max(previousPendingCount - 1, 0));
    await refreshState();
  } catch (error) {
    console.error(error);
    alert(error.message);
  } finally {
    if (triggerButton) {
      triggerButton.disabled = false;
    }
  }
}

function formatCategoryLabel(category) {
  return category.replace(/_/g, ' ');
}

async function setupCategoryOptions() {
  try {
    const response = await fetch('data/questions.json');
    if (!response.ok) return;
    const data = await response.json();
    if (!Array.isArray(data)) return;
    allQuestions = data;
    const uniqueCategories = [...new Set(data.map((item) => item.category).filter(Boolean))];
    uniqueCategories.sort();
    if (categorySelect) {
      uniqueCategories.forEach((category) => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = formatCategoryLabel(category);
        categorySelect.appendChild(option);
      });
    }
    renderCategoryButtons(uniqueCategories);
  } catch (error) {
    console.warn('Nie udało się pobrać kategorii', error);
  }
}

function renderCategoryButtons(categories) {
  if (!catalogCategories) return;
  catalogCategories.innerHTML = '';
  categories.forEach((category) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'catalog__category';
    button.dataset.category = category;
    button.textContent = formatCategoryLabel(category);
    if (category === activeCategory) {
      button.classList.add('catalog__category--active');
    }
    item.appendChild(button);
    catalogCategories.appendChild(item);
  });
  if (catalogContainer) {
    catalogContainer.hidden = categories.length === 0;
  }
  if (catalogQuestions && categories.length === 0) {
    catalogQuestions.hidden = true;
  }
}

function showCategoryQuestions(category) {
  activeCategory = category;
  if (catalogCategories) {
    catalogCategories
      .querySelectorAll('.catalog__category')
      .forEach((btn) => btn.classList.toggle('catalog__category--active', btn.dataset.category === category));
  }
  if (catalogCategoryTitle) {
    catalogCategoryTitle.textContent = formatCategoryLabel(category);
  }
  if (catalogQuestions) {
    catalogQuestions.hidden = false;
  }
  const questions = allQuestions.filter((item) => item.category === category);
  renderCategoryQuestions(questions);
}

function renderCategoryQuestions(questions) {
  if (!catalogList) return;
  catalogList.innerHTML = '';
  if (catalogEmpty) {
    catalogEmpty.hidden = questions.length !== 0;
  }
  if (questions.length === 0) {
    return;
  }
  questions.forEach((question) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'catalog__question';
    button.dataset.questionId = question.id;
    const id = document.createElement('span');
    id.className = 'catalog__question-id';
    id.textContent = question.id;
    const text = document.createElement('span');
    text.className = 'catalog__question-text';
    text.textContent = question.text;
    button.appendChild(id);
    button.appendChild(text);
    item.appendChild(button);
    catalogList.appendChild(item);
  });
}

async function chooseQuestionById(questionId, triggerButton) {
  try {
    if (triggerButton) {
      triggerButton.disabled = true;
    }
    const payload = await postJson('api/next_question.php', {
      room_key: roomKey,
      question_id: questionId,
    });
    if (!payload.ok) {
      throw new Error(payload.error || 'Nie udało się wybrać pytania.');
    }
    applyQuestion(payload.current_question);
  } catch (error) {
    console.error(error);
    alert(error.message);
  } finally {
    if (triggerButton) {
      triggerButton.disabled = false;
    }
  }
}

async function sendPresence() {
  if (selfInfo && selfInfo.status !== 'active') {
    return;
  }
  try {
    await postJson('api/presence.php', {
      room_key: roomKey,
      participant_id: participantId,
    });
  } catch (error) {
    console.warn('Nie udało się zaktualizować obecności', error);
  }
}

refreshState();
pollTimer = setInterval(refreshState, 2000);
presenceTimer = setInterval(sendPresence, 15000);
sendPresence();

window.addEventListener('beforeunload', () => {
  clearInterval(pollTimer);
  clearInterval(presenceTimer);
});
