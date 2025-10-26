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
const accessBanner = document.getElementById('access-banner');
const accessMessage = document.getElementById('access-message');
const accessLeave = document.getElementById('access-leave');
const roomContent = document.getElementById('room-content');
const waitingRoom = document.getElementById('waiting-room');
const requestsCard = document.getElementById('requests-card');
const requestsList = document.getElementById('requests-list');
const requestsEmpty = document.getElementById('requests-empty');

const defaultTitle = document.title;
let selfInfo = null;
let previousPendingCount = 0;
let lastKnownStatus = '';
let hasRedirectedToWaiting = false;

const waitingRoomPath = 'room-waiting.html';

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

accessLeave?.addEventListener('click', () => {
  window.location.href = 'pytania-dla-par-room.html';
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

requestsList?.addEventListener('click', async (event) => {
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
    renderPendingRequests(payload.pending_requests || []);
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

function renderPendingRequests(requests) {
  if (!requestsCard) {
    return;
  }
  if (!selfInfo || !selfInfo.is_host) {
    requestsCard.hidden = true;
    if (requestsList) {
      requestsList.innerHTML = '';
    }
    if (requestsEmpty) {
      requestsEmpty.hidden = false;
    }
    clearHostNotice();
    document.title = defaultTitle;
    previousPendingCount = 0;
    return;
  }

  requestsCard.hidden = false;
  if (requestsEmpty) {
    requestsEmpty.hidden = requests.length !== 0;
  }
  if (requestsList) {
    requestsList.innerHTML = '';
  }

  if (requests.length === 0) {
    clearHostNotice();
    document.title = defaultTitle;
    previousPendingCount = 0;
    return;
  }

  requests.forEach((request) => {
    if (!requestsList) return;
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
    requestsList.appendChild(item);
  });

  if (requests.length > previousPendingCount) {
    const lastRequest = requests[requests.length - 1];
    const message =
      requests.length === 1
        ? `Nowa prośba o dołączenie od ${lastRequest.display_name}.`
        : `Nowe prośby o dołączenie (${requests.length}).`;
    showHostNotice(message);
  }

  document.title = `(${requests.length}) ${defaultTitle}`;
  previousPendingCount = requests.length;
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

  const shouldShowBanner = !hasFullAccess && !isPending;

  if (shouldShowBanner) {
    if (accessBanner && accessMessage) {
      let message = 'Trwa oczekiwanie na dostęp do pokoju.';
      if (!participant) {
        message = 'Nie znaleziono Twojego zgłoszenia w tym pokoju. Wróć do ekranu tworzenia pokoju.';
      } else if (status === 'rejected') {
        message = 'Gospodarz odrzucił Twoją prośbę o dołączenie. Możesz spróbować ponownie później.';
      }
      accessMessage.textContent = message;
      accessBanner.hidden = false;
      accessBanner.dataset.mode = 'status';
    }
    if (accessLeave) {
      accessLeave.hidden = false;
    }
  } else if (accessBanner && accessBanner.dataset.mode === 'status') {
    accessBanner.hidden = true;
    accessBanner.dataset.mode = '';
    if (accessMessage) {
      accessMessage.textContent = '';
    }
    if (accessLeave) {
      accessLeave.hidden = true;
    }
  }

  if (!shouldShowBanner && accessLeave) {
    accessLeave.hidden = true;
  }

  setInteractionEnabled(isActive);

  lastKnownStatus = status;
}

function showHostNotice(message) {
  if (!accessBanner || !accessMessage) {
    return;
  }
  accessBanner.hidden = false;
  accessBanner.dataset.mode = 'host';
  accessMessage.textContent = message;
  if (accessLeave) {
    accessLeave.hidden = true;
  }
}

function clearHostNotice() {
  if (!accessBanner || accessBanner.dataset.mode !== 'host') {
    return;
  }
  accessBanner.hidden = true;
  accessBanner.dataset.mode = '';
  if (accessMessage) {
    accessMessage.textContent = '';
  }
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
