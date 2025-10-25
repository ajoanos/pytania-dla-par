const STORAGE_KEY_THEME = 'pary.theme';
const ACCESS_PASSWORD = 'momentypdp25';
const ACCESS_STORAGE_KEY = 'pary.access.pdp';

export async function postJson(url, data) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(`Błąd sieci ${response.status}`);
  }
  return response.json();
}

export async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Błąd sieci ${response.status}`);
  }
  return response.json();
}

export function initThemeToggle(button) {
  if (!button) return;
  const stored = localStorage.getItem(STORAGE_KEY_THEME);
  if (stored) {
    document.body.dataset.theme = stored;
  }

  updateIcon();
  button.addEventListener('click', () => {
    const next = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    document.body.dataset.theme = next;
    localStorage.setItem(STORAGE_KEY_THEME, next);
    updateIcon();
  });

  function updateIcon() {
    if (document.body.dataset.theme === 'dark') {
      button.textContent = '☀️';
    } else {
      button.textContent = '🌙';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle(document.getElementById('theme-toggle'));

  const productsCard = document.getElementById('products-card');
  const passwordCard = document.getElementById('password-card');
  const passwordForm = document.getElementById('password-form');
  const passwordInput = document.getElementById('access-password');
  const passwordError = document.getElementById('password-error');
  const passwordCancel = document.getElementById('password-cancel');
  const productButtons = document.querySelectorAll('[data-action="open-product"]');
  const gameCard = document.getElementById('game-card');

  function openPasswordCard() {
    if (!passwordCard) return;
    passwordCard.hidden = false;
    passwordError && (passwordError.hidden = true);
    if (productsCard) {
      productsCard.hidden = true;
    }
    if (passwordInput) {
      passwordInput.value = '';
      setTimeout(() => passwordInput.focus(), 50);
    }
  }

  function hidePasswordCard() {
    if (!passwordCard) return;
    passwordCard.hidden = true;
    if (productsCard) {
      productsCard.hidden = false;
    }
    if (passwordInput) {
      passwordInput.value = '';
    }
    passwordError && (passwordError.hidden = true);
  }

  function unlockGameAccess() {
    sessionStorage.setItem(ACCESS_STORAGE_KEY, 'true');
    if (productsCard) {
      productsCard.hidden = true;
    }
    if (passwordCard) {
      passwordCard.hidden = true;
    }
    if (gameCard) {
      gameCard.hidden = false;
    }
  }

  if (sessionStorage.getItem(ACCESS_STORAGE_KEY) === 'true') {
    unlockGameAccess();
  }

  productButtons.forEach((button) => {
    button.addEventListener('click', () => {
      openPasswordCard();
    });
  });

  passwordCancel?.addEventListener('click', () => {
    hidePasswordCard();
  });


  passwordForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!passwordInput) return;
    const value = passwordInput.value.trim();
    if (value === '') {
      passwordError && (passwordError.hidden = false);
      return;
    }
    if (value === ACCESS_PASSWORD) {
      unlockGameAccess();
    } else {
      passwordError && (passwordError.hidden = false);
    }
  });

  const joinForm = document.getElementById('join-form');
  if (joinForm) {
    joinForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const roomKey = joinForm.room_key.value.trim().toUpperCase();
      const displayName = joinForm.display_name.value.trim();
      if (!roomKey || !displayName) {
        alert('Uzupełnij wszystkie pola.');
        return;
      }
      try {
        joinForm.querySelector('button[type="submit"]').disabled = true;
        const payload = await postJson('api/create_or_join.php', {
          room_key: roomKey,
          display_name: displayName,
        });
        if (!payload.ok) {
          throw new Error(payload.error || 'Nie udało się dołączyć do pokoju.');
        }
        const params = new URLSearchParams({
          room_key: payload.room_key,
          pid: payload.participant_id,
        });
        window.location.href = `room.html?${params.toString()}`;
      } catch (error) {
        console.error(error);
        alert(error.message);
      } finally {
        joinForm.querySelector('button[type="submit"]').disabled = false;
      }
    });
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      console.warn('SW registration failed', err);
    });
  });
}
