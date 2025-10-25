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

let currentQuestion = null;
let pollTimer;
let presenceTimer;

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

async function setupCategoryOptions() {
  if (!categorySelect) return;
  try {
    const response = await fetch('data/questions.json');
    if (!response.ok) return;
    const data = await response.json();
    const uniqueCategories = [...new Set(data.map((item) => item.category))];
    uniqueCategories.sort();
    uniqueCategories.forEach((category) => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category.replace(/_/g, ' ');
      categorySelect.appendChild(option);
    });
  } catch (error) {
    console.warn('Nie udało się pobrać kategorii', error);
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
