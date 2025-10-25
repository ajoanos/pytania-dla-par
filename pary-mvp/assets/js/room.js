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
const questionPlaceholder = document.getElementById('question-placeholder');
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

let currentQuestion = null;
let pollTimer;
let presenceTimer;
let allQuestions = [];
let activeCategory = '';

roomLabel.textContent = roomKey;

setupCategoryOptions();

questionPlaceholder?.addEventListener('click', () => revealQuestion());
questionPlaceholder?.addEventListener('keypress', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    revealQuestion();
  }
});

nextQuestionButton?.addEventListener('click', async () => {
  try {
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
  const questionId = button.dataset.questionId;
  if (!questionId) return;
  await chooseQuestionById(questionId, button);
});

reactionButtons?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.action;
  if (!action || !currentQuestion) return;
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
    await refreshState();
  } catch (error) {
    console.error(error);
    alert(error.message);
  } finally {
    target.disabled = false;
  }
});

async function refreshState() {
  try {
    const payload = await getJson(`api/state.php?room_key=${encodeURIComponent(roomKey)}`);
    if (!payload.ok) {
      throw new Error(payload.error || 'Nie udało się pobrać stanu.');
    }
    renderParticipants(payload.participants || []);
    renderReactions(payload.reactions || []);
    if (payload.current_question) {
      applyQuestion(payload.current_question);
    } else {
      clearQuestion();
    }
  } catch (error) {
    console.error(error);
  }
}

function renderParticipants(participants) {
  participantsList.innerHTML = '';
  const now = Date.now();
  participants.forEach((participant) => {
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
  reactionsList.innerHTML = '';
  const labels = {
    ok: 'OK',
    skip: 'Pomiń',
    fav: 'Ulubione',
  };
  reactions.forEach((reaction) => {
    const li = document.createElement('li');
    const label = labels[reaction.action] || reaction.action;
    li.textContent = `${reaction.display_name || 'Ktoś'} • ${label}`;
    reactionsList.appendChild(li);
  });
}

function applyQuestion(question) {
  currentQuestion = question;
  questionCategory.textContent = question.category;
  questionId.textContent = question.id;
  questionText.textContent = question.text;
  questionCard.hidden = false;
  questionPlaceholder.hidden = true;
  reactionButtons.hidden = false;
}

function clearQuestion() {
  currentQuestion = null;
  questionCard.hidden = true;
  questionPlaceholder.hidden = false;
  reactionButtons.hidden = true;
}

function revealQuestion() {
  if (!currentQuestion) return;
  questionCard.hidden = false;
  questionPlaceholder.hidden = true;
  reactionButtons.hidden = false;
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
