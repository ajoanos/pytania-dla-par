import { postJson } from './app.js';

const CONFIG_URL = 'assets/data/plan-wieczoru.json';
const ACCESS_KEY = 'momenty.planWieczoru.access';
const MAIL_ENDPOINT = 'api/send_plan_email.php';

const state = {
  config: null,
  currentStepIndex: 0,
  selections: new Map(),
  randomNotes: new Map(),
};

document.addEventListener('DOMContentLoaded', async () => {
  if (sessionStorage.getItem(ACCESS_KEY) !== 'true') {
    const legacyKey = 'pary.access.pdp';
    if (sessionStorage.getItem(legacyKey) === 'true') {
      sessionStorage.setItem(ACCESS_KEY, 'true');
    }
  }

  if (sessionStorage.getItem(ACCESS_KEY) !== 'true') {
    window.location.replace('plan-wieczoru.html');
    return;
  }

  const loader = document.getElementById('plan-loader');
  const errorBox = document.getElementById('plan-error');

  try {
    const response = await fetch(CONFIG_URL, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Nie udało się pobrać konfiguracji zabawy.');
    }
    const config = await response.json();
    if (!config || !Array.isArray(config.steps)) {
      throw new Error('Niepoprawna struktura konfiguracji.');
    }
    state.config = config;
    loader?.setAttribute('hidden', '');
    initializePlan(config);
  } catch (error) {
    console.error(error);
    loader?.setAttribute('hidden', '');
    if (errorBox) {
      errorBox.textContent = error.message || 'Wystąpił nieoczekiwany błąd.';
      errorBox.hidden = false;
    }
  }
});

function initializePlan(config) {
  const flow = document.getElementById('plan-flow');
  const summary = document.getElementById('plan-summary');
  const nextButton = document.getElementById('plan-next');
  const backButton = document.getElementById('plan-back');
  const summaryTitle = document.getElementById('plan-summary-title');
  const summarySubtitle = document.getElementById('plan-summary-subtitle');
  const summaryForm = document.getElementById('plan-summary-form');
  const resetButton = document.getElementById('plan-reset');
  const sendButton = document.getElementById('plan-send');

  if (!flow || !nextButton || !backButton || !summary || !summaryForm || !resetButton) {
    return;
  }

  if (config.summary?.title) {
    summaryTitle.textContent = config.summary.title;
  }
  if (config.summary?.subtitle) {
    summarySubtitle.textContent = config.summary.subtitle;
  }
  if (config.summary?.buttonLabel && sendButton instanceof HTMLButtonElement) {
    sendButton.textContent = config.summary.buttonLabel;
  }

  flow.hidden = false;
  summary.hidden = true;
  state.currentStepIndex = 0;
  state.selections.clear();
  state.randomNotes.clear();

  renderCurrentStep();
  updateNavigationButtons();

  nextButton.addEventListener('click', () => {
    if (isOnLastStep()) {
      showSummary();
      return;
    }
    state.currentStepIndex += 1;
    renderCurrentStep();
    updateNavigationButtons();
  });

  backButton.addEventListener('click', () => {
    if (state.currentStepIndex === 0) {
      return;
    }
    state.currentStepIndex -= 1;
    renderCurrentStep();
    updateNavigationButtons();
  });

  summaryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await sendPlanEmail(summaryForm);
  });

  resetButton.addEventListener('click', () => {
    flow.hidden = false;
    summary.hidden = true;
    state.currentStepIndex = 0;
    state.selections.clear();
    state.randomNotes.clear();
    const feedback = document.getElementById('plan-summary-feedback');
    if (feedback) {
      feedback.textContent = '';
    }
    const form = document.getElementById('plan-summary-form');
    if (form) {
      form.reset();
      form.querySelectorAll('input, button').forEach((element) => {
        element.disabled = false;
      });
    }
    renderCurrentStep();
    updateNavigationButtons();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function renderCurrentStep() {
  const stepContainer = document.getElementById('plan-step');
  const progress = document.getElementById('plan-progress');
  const nextButton = document.getElementById('plan-next');

  if (!state.config || !stepContainer || !progress || !nextButton) {
    return;
  }

  const steps = state.config.steps;
  const step = steps[state.currentStepIndex];
  if (!step) {
    return;
  }

  progress.textContent = `Krok ${state.currentStepIndex + 1} z ${steps.length}`;

  const previouslySelected = state.selections.get(step.id);
  const note = state.randomNotes.get(step.id) || '';

  stepContainer.innerHTML = '';

  const header = document.createElement('header');
  header.className = 'game-step__header';

  const title = document.createElement('h3');
  title.className = 'game-step__title';
  title.textContent = step.title;
  header.appendChild(title);
  stepContainer.appendChild(header);

  const optionsList = document.createElement('div');
  optionsList.className = 'game-options';
  optionsList.setAttribute('role', 'group');

  step.options.forEach((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'game-option';
    button.dataset.optionId = option.id;
    button.textContent = option.label;
    button.setAttribute('aria-pressed', String(isOptionSelected(step, option, previouslySelected)));
    if (isOptionSelected(step, option, previouslySelected)) {
      button.classList.add('game-option--selected');
    }

    button.addEventListener('click', () => {
      handleOptionSelection(step, option);
    });

    optionsList.appendChild(button);
  });

  stepContainer.appendChild(optionsList);

  const noteElement = document.createElement('p');
  noteElement.className = 'game-step__note';
  noteElement.id = `plan-step-note-${step.id}`;
  noteElement.textContent = note;
  noteElement.hidden = note === '';
  stepContainer.appendChild(noteElement);

  updateNextButtonState(step, nextButton);
}

function updateNextButtonState(step, button) {
  if (!button) return;
  const selection = state.selections.get(step.id);
  if (step.type === 'multi') {
    const values = Array.isArray(selection) ? selection : [];
    button.disabled = values.length === 0;
  } else {
    button.disabled = !selection;
  }
  button.textContent = isOnLastStep() ? 'Zakończ' : 'Dalej';
}

function handleOptionSelection(step, option) {
  const isRandom = Boolean(option.isRandom);
  const noteId = `plan-step-note-${step.id}`;
  const noteElement = document.getElementById(noteId);

  if (step.type === 'multi') {
    const current = state.selections.get(step.id) || [];
    const next = toggleMultiOption(current, option);
    state.selections.set(step.id, next);
    updateOptionButtons(step);
    const nextButton = document.getElementById('plan-next');
    if (nextButton) {
      updateNextButtonState(step, nextButton);
    }
    return;
  }

  if (isRandom) {
    const available = step.options.filter((item) => !item.isRandom);
    if (available.length === 0) {
      return;
    }
    const randomIndex = Math.floor(Math.random() * available.length);
    const selected = available[randomIndex];
    state.selections.set(step.id, {
      id: selected.id,
      label: selected.label,
      emailContext: selected.emailContext,
    });
    state.randomNotes.set(step.id, `Wylosowano: ${selected.label}`);
    if (noteElement) {
      noteElement.textContent = `Wylosowano: ${selected.label}`;
      noteElement.hidden = false;
    }
  } else {
    state.selections.set(step.id, {
      id: option.id,
      label: option.label,
      emailContext: option.emailContext,
    });
    state.randomNotes.delete(step.id);
    if (noteElement) {
      noteElement.textContent = '';
      noteElement.hidden = true;
    }
  }

  updateOptionButtons(step);
  const nextButton = document.getElementById('plan-next');
  if (nextButton) {
    updateNextButtonState(step, nextButton);
  }
}

function toggleMultiOption(current, option) {
  const list = Array.isArray(current) ? [...current] : [];
  const existingIndex = list.findIndex((item) => item.id === option.id);
  if (existingIndex >= 0) {
    list.splice(existingIndex, 1);
  } else {
    list.push({ id: option.id, label: option.label });
  }
  return list;
}

function updateOptionButtons(step) {
  const stepContainer = document.getElementById('plan-step');
  if (!stepContainer) return;
  const selection = state.selections.get(step.id);

  stepContainer.querySelectorAll('.game-option').forEach((button) => {
    const optionId = button.dataset.optionId;
    const isSelected = step.type === 'multi'
      ? Array.isArray(selection) && selection.some((item) => item.id === optionId)
      : selection && selection.id === optionId;

    button.classList.toggle('game-option--selected', Boolean(isSelected));
    button.setAttribute('aria-pressed', String(Boolean(isSelected)));
  });
}

function isOptionSelected(step, option, selection) {
  if (!selection) return false;
  if (step.type === 'multi') {
    return Array.isArray(selection) && selection.some((item) => item.id === option.id);
  }
  if (selection.id) {
    return selection.id === option.id;
  }
  return selection === option.id;
}

function updateNavigationButtons() {
  const backButton = document.getElementById('plan-back');
  const nextButton = document.getElementById('plan-next');
  if (!state.config || !backButton || !nextButton) {
    return;
  }
  backButton.disabled = state.currentStepIndex === 0;
  const step = state.config.steps[state.currentStepIndex];
  if (step) {
    updateNextButtonState(step, nextButton);
  }
}

function isOnLastStep() {
  if (!state.config) return false;
  return state.currentStepIndex === state.config.steps.length - 1;
}

function showSummary() {
  const flow = document.getElementById('plan-flow');
  const summary = document.getElementById('plan-summary');
  const summaryList = document.getElementById('plan-summary-list');
  const summaryTitle = document.getElementById('plan-summary-title');
  const feedback = document.getElementById('plan-summary-feedback');
  const form = document.getElementById('plan-summary-form');

  if (!state.config || !flow || !summary || !summaryList || !summaryTitle) {
    return;
  }

  const summaryData = buildSummaryData();
  summaryList.innerHTML = '';

  summaryData.forEach((item) => {
    const dt = document.createElement('dt');
    dt.className = 'game-summary__term';
    dt.textContent = item.term;

    const dd = document.createElement('dd');
    dd.className = 'game-summary__description';
    dd.textContent = item.description;

    summaryList.appendChild(dt);
    summaryList.appendChild(dd);
  });

  flow.hidden = true;
  summary.hidden = false;
  if (feedback) {
    feedback.textContent = '';
  }
  if (form) {
    form.querySelectorAll('input, button').forEach((element) => {
      element.disabled = false;
    });
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function buildSummaryData() {
  const labels = {
    mood: 'Nastrój',
    closeness: 'Bliskość',
    extras: 'Dodatki',
    energy: 'Energia',
  };

  const summary = [];

  const mood = state.selections.get('mood');
  if (mood) {
    summary.push({ term: labels.mood, description: mood.label });
  }

  const closeness = state.selections.get('closeness');
  if (closeness) {
    summary.push({ term: labels.closeness, description: closeness.label });
  }

  const extras = state.selections.get('extras');
  if (Array.isArray(extras)) {
    summary.push({ term: labels.extras, description: extras.length ? extras.map((item) => item.label).join(', ') : 'Brak dodatków' });
  }

  const energy = state.selections.get('energy');
  if (energy) {
    summary.push({ term: labels.energy, description: energy.label });
  }

  return summary;
}

async function sendPlanEmail(form) {
  const emailInput = document.getElementById('plan-partner-email');
  const sendButton = document.getElementById('plan-send');
  const feedback = document.getElementById('plan-summary-feedback');

  if (!emailInput || !sendButton || !feedback || !state.config) {
    return;
  }

  const email = emailInput.value.trim();
  if (!email) {
    feedback.textContent = 'Podaj adres e-mail partnera.';
    return;
  }

  sendButton.disabled = true;
  feedback.textContent = 'Wysyłamy wiadomość…';

  const payload = {
    email,
    mood: state.selections.get('mood')?.label || '',
    closeness: state.selections.get('closeness')?.label || '',
    extras: (state.selections.get('extras') || []).map((item) => item.label),
    energy: state.selections.get('energy')?.label || '',
    energyContext: state.selections.get('energy')?.emailContext || '',
    link: state.config.email?.link || `${window.location.origin}${window.location.pathname}`,
    subject: state.config.email?.subject || 'Wieczór we dwoje – krótki plan 💛',
  };

  try {
    const response = await postJson(MAIL_ENDPOINT, payload);
    if (!response.ok) {
      throw new Error(response.error || 'Nie udało się wysłać wiadomości.');
    }
    feedback.textContent = 'Plan wysłany! Za chwilę wrócisz do listy gier.';
    sendButton.disabled = true;
    form.querySelectorAll('input, button').forEach((element) => {
      if (element instanceof HTMLButtonElement && element.id === 'plan-reset') {
        element.disabled = false;
        return;
      }
      if (element instanceof HTMLButtonElement) {
        element.disabled = true;
      }
      if (element instanceof HTMLInputElement) {
        element.disabled = true;
      }
    });
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 3000);
  } catch (error) {
    console.error(error);
    feedback.textContent = error.message || 'Nie udało się wysłać wiadomości.';
    sendButton.disabled = false;
  }
}
