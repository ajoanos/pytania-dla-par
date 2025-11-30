import { appendTokenToUrl } from './app.js';

const STORAGE_KEY = 'momenty.userPanel.state';
const DEFAULT_DURATION_DAYS = 7;

const gameLibrary = {
  pdp: { id: 'pdp', title: 'Pytania dla par', tag: '💖 Warm', url: '/pytania-dla-par.html' },
  trio: { id: 'trio', title: 'Trio Challenge', tag: '🔥 Spicy', url: '/trio-challenge.html' },
  scratch: { id: 'scratch', title: 'Zdrapka pozycji', tag: '🎲 Fun', url: '/zdrapka-pozycji.html' },
  romanticBoard: { id: 'romanticBoard', title: 'Planszowa romantyczna', tag: '💝 Soft', url: '/planszowa-romantyczna.html' },
  truthDare: { id: 'truthDare', title: 'Prawda czy wyzwanie', tag: '🎯 Challenge', url: '/prawda-wyzwanie.html' },
  neverEver: { id: 'neverEver', title: 'Nigdy przenigdy', tag: '🎉 Zabawa', url: '/nigdy-przenigdy.html' },
  tinderIdeas: { id: 'tinderIdeas', title: 'Tinder wspólnych pomysłów', tag: '✨ Nowość', url: '/tinder-wspolnych-pomyslow.html' },
  planEvening: { id: 'planEvening', title: 'Plan wieczoru', tag: '📓 Plan', url: '/plan-wieczoru.html' },
  spicyWheel: { id: 'spicyWheel', title: 'Niegrzeczne Koło', tag: '🔥 Odważna', url: '/niegrzeczne-kolo.html' },
  positions: { id: 'positions', title: 'Poznaj wszystkie pozycje', tag: '🧭 Eksploracja', url: '/poznaj-wszystkie-pozycje.html' },
};

function createDefaultState() {
  const today = new Date();
  const expires = new Date();
  expires.setDate(today.getDate() + 5);

  return {
    access: {
      expiresAt: expires.toISOString(),
      durationDays: DEFAULT_DURATION_DAYS,
      tokensLeft: 3,
      status: 'Dostęp aktywny',
    },
    favorites: ['pdp', 'trio', 'scratch'],
    backlog: ['romanticBoard', 'neverEver', 'tinderIdeas'],
    inProgress: [
      { id: 'truthDare', note: 'Runda 3/5' },
      { id: 'positions', note: '45%' },
      { id: 'planEvening', note: 'Etap 2' },
    ],
    recent: [
      {
        id: 'spicyWheel',
        lastPlayed: '2 dni temu',
        note: 'Rozgrzewka + 3 pełne tury. Lubiliście zadania z kategorii „Zmysły”.',
        cta: 'Wznów',
      },
      {
        id: 'planEvening',
        lastPlayed: '5 dni temu',
        note: 'Zakończono sekcję „Lekkie zadania”. Kolejne: mini-wyzwanie + relaks.',
        cta: 'Otwórz plan',
      },
    ],
    badges: [
      { id: 'streak', icon: '🏁', title: '3 wieczory w tygodniu', text: 'Na dobrej drodze! Brakuje 1 spotkania.' },
      { id: 'spicy', icon: '🔥', title: 'Odważna runda', text: '3/4 wyzwania ukończone.' },
      { id: 'discover', icon: '🎉', title: 'Nowości odkryte', text: '2 nowe gry w tym miesiącu.' },
      { id: 'gratitude', icon: '💌', title: 'Happy vibes', text: '5 zapisanych notatek wdzięczności.' },
    ],
    vibe: {
      scenarios: [
        'Romantyczna randka z nutą ryzyka',
        'Wieczór z pytaniami, które zbliżają',
        'Ekspresowa sesja dla odważnych',
        'Lekka zabawa + jedna nowość',
      ],
    },
  };
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return createDefaultState();
    return { ...createDefaultState(), ...JSON.parse(saved) };
  } catch (error) {
    console.warn('Nie udało się wczytać stanu panelu:', error);
    return createDefaultState();
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    queueApiUpdate({ type: 'panel-state', state });
  } catch (error) {
    console.warn('Nie udało się zapisać stanu panelu:', error);
  }
}

function queueApiUpdate(payload) {
  // Hak pod integrację API – w przyszłości można tu dodać kolejkowanie requestów lub debounce
  console.debug('Aktualizacja panelu (placeholder API):', payload);
}

function trackEvent(name, data = {}) {
  queueApiUpdate({ type: 'panel-event', event: name, data });
}

function formatDate(date) {
  return new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long' }).format(date);
}

function upsertInProgress(state, id, note = 'Do dokończenia') {
  const existing = state.inProgress.find((entry) => entry.id === id);
  if (existing) {
    existing.note = note;
  } else {
    state.inProgress.push({ id, note });
  }
}

function removeFromArray(list, id) {
  const index = list.indexOf(id);
  if (index >= 0) {
    list.splice(index, 1);
  }
}

function renderAccess(state) {
  const accessDate = document.getElementById('access-date');
  const accessLeft = document.getElementById('access-left');
  const accessTokens = document.getElementById('access-tokens');
  const accessStatus = document.getElementById('access-status');
  const progress = document.getElementById('access-progress');
  const cta = document.getElementById('access-cta');

  if (!accessDate || !accessLeft || !progress) return;

  const expires = new Date(state.access.expiresAt);
  const now = new Date();
  const diffTime = expires.getTime() - now.getTime();
  const daysLeft = Math.max(0, Math.round(diffTime / (1000 * 60 * 60 * 24)));
  const barWidth = Math.min(100, Math.max(5, (daysLeft / (state.access.durationDays || DEFAULT_DURATION_DAYS)) * 100));
  const statusText = daysLeft > 0 ? state.access.status : 'Dostęp wygasł';

  accessDate.textContent = formatDate(expires);
  accessLeft.textContent = daysLeft > 0 ? `Pozostało ${daysLeft} dni` : 'Przedłuż dostęp, aby wrócić do gier';
  accessTokens.textContent = `Żetony: ${state.access.tokensLeft} do wykorzystania`;
  accessStatus.textContent = statusText;
  progress.style.width = `${barWidth}%`;

  if (cta) {
    cta.href = appendTokenToUrl(cta.getAttribute('href'));
  }
}

function renderListItem({ title, tag, actions = [] }) {
  const item = document.createElement('div');
  item.className = 'list-item';

  const info = document.createElement('span');
  info.textContent = title;

  const pill = document.createElement('span');
  pill.className = 'pill';
  pill.textContent = tag;

  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'list-actions';

  actions.forEach((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pill-action';
    if (action.variant) {
      button.dataset.variant = action.variant;
    }
    button.dataset.action = action.action;
    button.dataset.id = action.id;
    if (action.note) {
      button.dataset.note = action.note;
    }
    button.textContent = action.label;
    actionsWrap.appendChild(button);
  });

  item.append(info, pill, actionsWrap);
  return item;
}

function renderFavorites(state) {
  const container = document.getElementById('favorites-list');
  if (!container) return;
  container.innerHTML = '';

  if (!state.favorites.length) {
    container.innerHTML = '<p class="panel-meta">Brak ulubionych. Dodajcie coś z listy obok!</p>';
    return;
  }

  state.favorites.forEach((id) => {
    const meta = gameLibrary[id];
    if (!meta) return;
    const item = renderListItem({
      title: meta.title,
      tag: meta.tag,
      actions: [
        { id, label: 'Usuń', action: 'remove-favorite' },
        { id, label: 'Oznacz jako niedokończone', action: 'mark-unfinished', note: 'Do dokończenia' },
      ],
    });
    container.appendChild(item);
  });
}

function renderBacklog(state) {
  const container = document.getElementById('backlog-list');
  if (!container) return;
  container.innerHTML = '';

  if (!state.backlog.length) {
    container.innerHTML = '<p class="panel-meta">Wszystko przetestowane! Dodajcie nowości z katalogu.</p>';
    return;
  }

  state.backlog.forEach((id) => {
    const meta = gameLibrary[id];
    if (!meta) return;
    const item = renderListItem({
      title: meta.title,
      tag: meta.tag,
      actions: [
        { id, label: 'Dodaj do ulubionych', action: 'add-favorite', variant: 'primary' },
        { id, label: 'Oznacz jako niedokończone', action: 'mark-unfinished', note: 'Rozpoczęto' },
      ],
    });
    container.appendChild(item);
  });
}

function renderInProgress(state) {
  const container = document.getElementById('in-progress-list');
  if (!container) return;
  container.innerHTML = '';

  if (!state.inProgress.length) {
    container.innerHTML = '<p class="panel-meta">Brak otwartych gier. Złapcie coś z ulubionych lub historii.</p>';
    return;
  }

  state.inProgress.forEach(({ id, note }) => {
    const meta = gameLibrary[id];
    if (!meta) return;
    const item = renderListItem({
      title: meta.title,
      tag: note || meta.tag,
      actions: [
        { id, label: 'Dodaj do ulubionych', action: 'add-favorite' },
        { id, label: 'Ukończ', action: 'complete-progress' },
      ],
    });
    container.appendChild(item);
  });
}

function renderRecent(state) {
  const container = document.getElementById('recent-games');
  if (!container) return;
  container.innerHTML = '';

  state.recent.forEach((entry) => {
    const meta = gameLibrary[entry.id];
    if (!meta) return;
    const card = document.createElement('div');
    card.className = 'panel-card';
    const title = document.createElement('h3');
    title.textContent = meta.title;
    const metaInfo = document.createElement('p');
    metaInfo.className = 'panel-meta';
    metaInfo.textContent = `Ostatnio: ${entry.lastPlayed}`;
    const description = document.createElement('p');
    description.textContent = entry.note;
    const link = document.createElement('a');
    link.className = 'v2-btn-play';
    link.href = appendTokenToUrl(meta.url.replace('.html', '-play.html'));
    link.textContent = entry.cta || 'Wróć';

    card.append(title, metaInfo, description, link);
    container.appendChild(card);
  });
}

function renderBadges(state) {
  const container = document.getElementById('badges');
  if (!container) return;
  container.innerHTML = '';

  state.badges.forEach((badge) => {
    const card = document.createElement('div');
    card.className = 'panel-card';
    const icon = document.createElement('div');
    icon.className = 'badge-icon';
    icon.textContent = badge.icon;
    const title = document.createElement('strong');
    title.textContent = badge.title;
    const text = document.createElement('p');
    text.className = 'panel-meta';
    text.textContent = badge.text;

    card.append(icon, title, text);
    container.appendChild(card);
  });
}

function renderRandomVibe(state) {
  const highlight = document.getElementById('random-highlight');
  const randomBtn = document.getElementById('random-cta');
  if (!highlight || !randomBtn) return;

  const pickScenario = () => {
    const { scenarios } = state.vibe;
    if (!scenarios || !scenarios.length) return;
    const pick = scenarios[Math.floor(Math.random() * scenarios.length)];
    highlight.textContent = pick;
  };

  randomBtn.addEventListener('click', pickScenario);
  randomBtn.addEventListener('click', () => trackEvent('cta_random_game'));
  pickScenario();
}

function render(state) {
  renderAccess(state);
  renderFavorites(state);
  renderBacklog(state);
  renderInProgress(state);
  renderRecent(state);
  renderBadges(state);
  renderRandomVibe(state);
}

function attachActionHandlers(state) {
  document.addEventListener('click', (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest('[data-action]') : null;
    if (!(button instanceof HTMLElement)) return;

    const action = button.dataset.action;
    const id = button.dataset.id;
    if (!action || !id) return;

    switch (action) {
      case 'add-favorite': {
        if (!state.favorites.includes(id)) {
          state.favorites.push(id);
        }
        removeFromArray(state.backlog, id);
        saveState(state);
        trackEvent('add_favorite', { gameId: id, note: button.dataset.note });
        break;
      }
      case 'remove-favorite': {
        removeFromArray(state.favorites, id);
        saveState(state);
        trackEvent('remove_favorite', { gameId: id });
        break;
      }
      case 'mark-unfinished': {
        upsertInProgress(state, id, button.dataset.note || 'Do dokończenia');
        if (!state.favorites.includes(id)) {
          removeFromArray(state.backlog, id);
        }
        saveState(state);
        trackEvent('mark_unfinished', { gameId: id, note: button.dataset.note });
        break;
      }
      case 'complete-progress': {
        state.inProgress = state.inProgress.filter((entry) => entry.id !== id);
        saveState(state);
        trackEvent('complete_progress', { gameId: id });
        break;
      }
      default:
        return;
    }

    render(state);
  });
}

function initPanel() {
  const state = loadState();
  render(state);
  attachActionHandlers(state);

  document.addEventListener('click', (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest('[data-analytics]') : null;
    if (!target) return;

    const analyticsName = target.dataset.analytics;
    if (!analyticsName) return;

    const payload = {
      id: target.dataset.id,
      note: target.dataset.note,
      label: target.dataset.analyticsLabel || target.textContent?.trim() || undefined,
    };

    trackEvent(analyticsName, payload);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPanel, { once: true });
} else {
  initPanel();
}
