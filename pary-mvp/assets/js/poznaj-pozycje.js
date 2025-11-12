import { getJson, initThemeToggle } from './app.js';

const ACCESS_KEY = 'momenty.positions.access';
const ACCESS_PAGE = 'poznaj-wszystkie-pozycje.html';
const LIST_ENDPOINT = 'api/list_scratchcards.php';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function normalizeId(path) {
  if (!path) {
    return '';
  }
  const segments = path.split('/');
  const filename = segments[segments.length - 1] || path;
  return filename.replace(/\.[^.]+$/, '');
}

function formatTitle(id) {
  if (!id) {
    return 'Pozycja';
  }
  const cleaned = id.replace(/[_-]+/g, ' ').trim();
  if (!cleaned) {
    return 'Pozycja';
  }
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function encodeLikes(set) {
  if (!set || set.size === 0) {
    return '';
  }
  const payload = Array.from(set.values());
  const json = JSON.stringify(payload);
  const bytes = textEncoder.encode(json);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  let base64 = btoa(binary);
  base64 = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
  return base64;
}

function decodeLikes(value) {
  if (!value) {
    return new Set();
  }
  try {
    let base64 = String(value).trim();
    base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const json = textDecoder.decode(bytes);
    const payload = JSON.parse(json);
    if (!Array.isArray(payload)) {
      return new Set();
    }
    return new Set(payload.map((entry) => String(entry)));
  } catch (error) {
    console.warn('Nie udało się odczytać listy polubionych pozycji.', error);
    return new Set();
  }
}

function pluralize(count, one, few, many) {
  const absolute = Math.abs(count);
  if (absolute === 1) {
    return one;
  }
  if (absolute % 10 >= 2 && absolute % 10 <= 4 && (absolute % 100 < 10 || absolute % 100 >= 20)) {
    return few;
  }
  return many;
}

function pluralizeSelections(count) {
  const label = pluralize(count, 'pozycję', 'pozycje', 'pozycji');
  return `${count} ${label}`;
}

function buildShareMessage(url, count) {
  const label = pluralize(count, 'pozycję', 'pozycje', 'pozycji');
  return `Wybrałem/Wybrałam ${count} ${label}. Zobacz i dołącz: ${url}`;
}

function buildShareLinks(url, count) {
  const message = buildShareMessage(url, count);
  return {
    messenger: `https://m.me/?link=${encodeURIComponent(url)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(message)}`,
    sms: `sms:&body=${encodeURIComponent(message)}`,
    email: `mailto:?subject=${encodeURIComponent('Poznaj wszystkie pozycje – nasze typy')}&body=${encodeURIComponent(message)}`,
  };
}

function ensureAccess(receivedLikesSize, previousLikesSize) {
  const hasStoredAccess = sessionStorage.getItem(ACCESS_KEY) === 'true';
  const hasShareAccess = receivedLikesSize > 0 || previousLikesSize > 0;
  if (!hasStoredAccess && !hasShareAccess) {
    window.location.replace(ACCESS_PAGE);
    return { allowed: false, fromShare: false };
  }
  if (!hasStoredAccess) {
    sessionStorage.setItem(ACCESS_KEY, 'true');
    return { allowed: true, fromShare: true };
  }
  sessionStorage.setItem(ACCESS_KEY, 'true');
  return { allowed: true, fromShare: false };
}

function createPositionCard(item) {
  const article = document.createElement('article');
  article.className = 'position-card';
  article.dataset.id = item.id;
  article.setAttribute('role', 'listitem');

  const figure = document.createElement('figure');
  figure.className = 'position-card__figure';
  const image = document.createElement('img');
  image.className = 'position-card__image';
  image.src = item.src;
  image.alt = item.title;
  image.loading = 'lazy';
  figure.appendChild(image);

  const caption = document.createElement('figcaption');
  caption.className = 'position-card__title';
  caption.textContent = item.title;
  figure.appendChild(caption);

  const footer = document.createElement('div');
  footer.className = 'position-card__footer';

  const likeButton = document.createElement('button');
  likeButton.className = 'position-card__like';
  likeButton.type = 'button';
  likeButton.dataset.role = 'like-button';
  likeButton.dataset.state = 'none';
  likeButton.setAttribute('aria-pressed', 'false');
  likeButton.innerHTML = `
    <span class="position-card__hearts" aria-hidden="true">
      <span class="position-card__heart position-card__heart--mine">❤</span>
      <span class="position-card__heart position-card__heart--partner">❤</span>
    </span>
    <span class="visually-hidden">Polub tę pozycję</span>
  `;

  const partnerNote = document.createElement('span');
  partnerNote.className = 'position-card__note';
  partnerNote.dataset.role = 'partner-note';
  partnerNote.textContent = 'Wybrane przez partnera';
  partnerNote.hidden = true;

  footer.appendChild(likeButton);
  footer.appendChild(partnerNote);

  article.appendChild(figure);
  article.appendChild(footer);

  return article;
}

function updateCardState(cardElements, id, state) {
  const entry = cardElements.get(id);
  if (!entry) {
    return;
  }
  const { likeButton, partnerNote, card } = entry;
  const likedByMe = state.myLikes.has(id);
  const likedByPartner = state.receivedLikes.has(id);

  let stateValue = 'none';
  if (likedByMe && likedByPartner) {
    stateValue = 'both';
  } else if (likedByMe) {
    stateValue = 'mine';
  } else if (likedByPartner) {
    stateValue = 'partner';
  }

  likeButton.dataset.state = stateValue;
  likeButton.setAttribute('aria-pressed', likedByMe ? 'true' : 'false');
  const label = likeButton.querySelector('.visually-hidden');
  if (label) {
    label.textContent = likedByMe ? 'Usuń polubienie tej pozycji' : 'Polub tę pozycję';
  }
  if (partnerNote) {
    partnerNote.hidden = !likedByPartner;
  }
  if (card) {
    card.dataset.partnerLiked = likedByPartner ? 'true' : 'false';
    card.dataset.myLiked = likedByMe ? 'true' : 'false';
  }
}

function buildShareUrl(state) {
  if (state.myLikes.size === 0) {
    return '';
  }
  const url = new URL(window.location.href);
  url.searchParams.set('likes', encodeLikes(state.myLikes));
  if (state.receivedLikes.size > 0) {
    url.searchParams.set('partner', encodeLikes(state.receivedLikes));
  } else {
    url.searchParams.delete('partner');
  }
  url.searchParams.set('view', 'shared');
  return url.toString();
}

function updateShareState(state, elements) {
  const count = state.myLikes.size;
  const { shareHint, shareCount, shareLinks, shareNative } = elements;

  if (count > 0) {
    shareCount.hidden = false;
    shareCount.textContent = `Wybrane: ${pluralizeSelections(count)}`;
    if (shareHint) {
      shareHint.textContent = 'Wyślij partnerowi link ze swoimi propozycjami.';
    }
  } else {
    shareCount.hidden = true;
    if (shareHint) {
      shareHint.textContent = 'Polub przynajmniej jedną pozycję, aby udostępnić ją partnerowi.';
    }
  }

  const shareUrl = count > 0 ? buildShareUrl(state) : '';
  const links = shareLinks.querySelectorAll('[data-share-channel]');
  const hrefs = shareUrl ? buildShareLinks(shareUrl, count) : null;

  links.forEach((link) => {
    if (!shareUrl || !hrefs) {
      link.setAttribute('aria-disabled', 'true');
      link.setAttribute('tabindex', '-1');
      link.href = '#';
      link.classList.add('share-link--disabled');
      return;
    }
    const channel = link.dataset.shareChannel;
    const nextHref = hrefs[channel] || shareUrl;
    link.href = nextHref;
    link.removeAttribute('aria-disabled');
    link.removeAttribute('tabindex');
    link.classList.remove('share-link--disabled');
  });

  if (shareNative) {
    if (navigator.share && shareUrl) {
      shareNative.hidden = false;
      shareNative.disabled = false;
      shareNative.dataset.shareUrl = shareUrl;
      shareNative.dataset.shareCount = String(count);
    } else {
      shareNative.hidden = true;
      shareNative.disabled = true;
      delete shareNative.dataset.shareUrl;
      delete shareNative.dataset.shareCount;
    }
  }
}

function updateViewText(state, elements) {
  const { info, lead, showAllButton } = elements;
  if (!info || !lead || !showAllButton) {
    return;
  }

  if (state.viewMode === 'shared' && state.receivedLikes.size > 0) {
    info.textContent = 'Partner wybrał dla Was te pozycje na dziś.';
    lead.textContent = 'Kliknij poniższy przycisk, aby zobaczyć wszystkie propozycje i wysłać swoje typy.';
    showAllButton.hidden = false;
  } else {
    if (state.receivedLikes.size > 0 && state.previousLikes.size > 0) {
      info.textContent = 'Macie już swoje typy. Zaznacz, co podoba Ci się najbardziej i wyślij odpowiedź.';
    } else if (state.receivedLikes.size > 0) {
      info.textContent = 'Zobacz propozycje partnera i dodaj własne inspiracje.';
    } else {
      info.textContent = 'Zainspirujcie się i wybierzcie ulubione propozycje na wspólny wieczór.';
    }
    lead.textContent = 'Oglądajcie zdjęcia, klikajcie w serduszka i wybierzcie, co najbardziej Was kręci.';
    showAllButton.hidden = true;
  }
}

function renderPositions(state, elements) {
  const { grid, empty } = elements;
  const cardElements = new Map();
  const items = state.viewMode === 'shared' && state.receivedLikes.size > 0
    ? state.allPositions.filter((item) => state.receivedLikes.has(item.id))
    : state.allPositions.slice();

  grid.innerHTML = '';

  if (items.length === 0) {
    empty.hidden = false;
    return cardElements;
  }

  empty.hidden = true;
  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    const card = createPositionCard(item);
    fragment.appendChild(card);
    const likeButton = card.querySelector('[data-role="like-button"]');
    const partnerNote = card.querySelector('[data-role="partner-note"]');
    cardElements.set(item.id, { card, likeButton, partnerNote });
  });

  grid.appendChild(fragment);

  cardElements.forEach((entry, id) => {
    entry.likeButton.addEventListener('click', () => {
      if (state.myLikes.has(id)) {
        state.myLikes.delete(id);
      } else {
        state.myLikes.add(id);
      }
      updateCardState(cardElements, id, state);
      updateShareState(state, elements);
    });
    updateCardState(cardElements, id, state);
  });

  return cardElements;
}

function initializeShareButton(elements) {
  const { shareNative } = elements;
  if (!shareNative) {
    return;
  }
  shareNative.addEventListener('click', async () => {
    const shareUrl = shareNative.dataset.shareUrl;
    const count = Number.parseInt(shareNative.dataset.shareCount || '0', 10);
    if (!shareUrl || !navigator.share) {
      return;
    }
    try {
      await navigator.share({
        title: 'Poznaj wszystkie pozycje',
        text: buildShareMessage(shareUrl, count),
        url: shareUrl,
      });
    } catch (error) {
      if (error && error.name === 'AbortError') {
        return;
      }
      console.warn('Nie udało się udostępnić linku.', error);
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initThemeToggle(document.getElementById('theme-toggle'));

  const params = new URLSearchParams(window.location.search);
  const receivedLikes = decodeLikes(params.get('likes'));
  const previousLikes = decodeLikes(params.get('partner'));

  const accessResult = ensureAccess(receivedLikes.size, previousLikes.size);
  if (!accessResult.allowed) {
    return;
  }

  const state = {
    allPositions: [],
    receivedLikes,
    previousLikes,
    myLikes: previousLikes.size > 0 ? new Set(previousLikes) : new Set(),
    viewMode: 'all',
  };

  const requestedView = params.get('view');
  if (requestedView === 'shared' && receivedLikes.size > 0) {
    state.viewMode = 'shared';
  } else if (accessResult.fromShare && receivedLikes.size > 0) {
    state.viewMode = 'shared';
  }

  const elements = {
    grid: document.getElementById('positions-grid'),
    empty: document.getElementById('positions-empty'),
    info: document.getElementById('positions-info'),
    lead: document.getElementById('positions-lead'),
    showAllButton: document.getElementById('show-all-button'),
    shareHint: document.getElementById('share-hint'),
    shareCount: document.getElementById('share-count'),
    shareLinks: document.getElementById('share-links'),
    shareNative: document.getElementById('share-native'),
  };

  if (!elements.grid || !elements.empty || !elements.shareLinks) {
    console.error('Brak elementów interfejsu gry.');
    return;
  }

  updateViewText(state, elements);
  initializeShareButton(elements);

  try {
    const payload = await getJson(LIST_ENDPOINT);
    if (!payload?.ok || !Array.isArray(payload.files)) {
      throw new Error(payload?.error || 'Nie udało się pobrać listy pozycji.');
    }
    state.allPositions = payload.files.map((src) => {
      const id = normalizeId(src);
      return {
        id,
        src,
        title: formatTitle(id),
      };
    });
  } catch (error) {
    console.error(error);
    elements.empty.hidden = false;
    elements.empty.textContent = 'Nie udało się wczytać pozycji. Odśwież stronę i spróbuj ponownie.';
    return;
  }

  if (state.receivedLikes.size > 0 || state.previousLikes.size > 0) {
    const availableIds = new Set(state.allPositions.map((item) => item.id));
    if (state.receivedLikes.size > 0) {
      state.receivedLikes = new Set(Array.from(state.receivedLikes).filter((id) => availableIds.has(id)));
    }
    if (state.previousLikes.size > 0) {
      state.previousLikes = new Set(Array.from(state.previousLikes).filter((id) => availableIds.has(id)));
      if (state.myLikes.size > 0) {
        state.myLikes = new Set(Array.from(state.myLikes).filter((id) => availableIds.has(id)));
      }
    }
  }

  let cardElements = renderPositions(state, elements);
  updateShareState(state, elements);

  if (elements.showAllButton) {
    elements.showAllButton.addEventListener('click', () => {
      state.viewMode = 'all';
      updateViewText(state, elements);
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'all');
      if (state.receivedLikes.size > 0) {
        url.searchParams.set('likes', encodeLikes(state.receivedLikes));
      } else {
        url.searchParams.delete('likes');
      }
      if (state.previousLikes.size > 0) {
        url.searchParams.set('partner', encodeLikes(state.previousLikes));
      } else {
        url.searchParams.delete('partner');
      }
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      cardElements = renderPositions(state, elements);
      updateShareState(state, elements);
    });
  }
});
