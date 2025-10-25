const STORAGE_KEY_THEME = 'pary.theme';
const ACCESS_PASSWORD = 'momentyptp25';
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

function focusElement(element) {
  if (!element) return;
  setTimeout(() => element.focus(), 50);
}

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle(document.getElementById('theme-toggle'));

  const passwordCard = document.getElementById('password-card');
  const passwordForm = document.getElementById('password-form');
  const passwordInput = document.getElementById('access-password');
  const passwordError = document.getElementById('password-error');
  const passwordCancel = document.getElementById('password-cancel');
  const productButtons = document.querySelectorAll('[data-action="open-product"]');
  const gameCard = document.getElementById('game-card');

  productButtons.forEach((button) => {
    const target = button.dataset.target;
    if (!target) return;
    button.addEventListener('click', (event) => {
      if (button.tagName.toLowerCase() === 'a') {
        return;
      }
      event.preventDefault();
      window.location.href = target;
    });
  });

  function showPasswordCard() {
    if (!passwordCard) return;
    passwordCard.hidden = false;
    if (gameCard) {
      gameCard.hidden = true;
    }
    if (passwordInput) {
      passwordInput.value = '';
      focusElement(passwordInput);
    }
    if (passwordError) {
      passwordError.hidden = true;
    }
  }

  function unlockGameAccess() {
    sessionStorage.setItem(ACCESS_STORAGE_KEY, 'true');
    if (passwordCard) {
      passwordCard.hidden = true;
    }
    if (gameCard) {
      gameCard.hidden = false;
      const firstInput = gameCard.querySelector('input');
      focusElement(firstInput);
    }
    if (passwordError) {
      passwordError.hidden = true;
    }
  }

  if (passwordCard) {
    if (sessionStorage.getItem(ACCESS_STORAGE_KEY) === 'true') {
      unlockGameAccess();
    } else {
      showPasswordCard();
    }
  }

  passwordCancel?.addEventListener('click', () => {
    const backTarget = passwordCancel.dataset.back;
    if (backTarget) {
      window.location.href = backTarget;
      return;
    }
    showPasswordCard();
  });

  passwordForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!passwordInput) return;
    const value = passwordInput.value.trim();
    if (value === '') {
      if (passwordError) {
        passwordError.hidden = false;
      }
      return;
    }
    if (value === ACCESS_PASSWORD) {
      unlockGameAccess();
    } else if (passwordError) {
      passwordError.hidden = false;
    }
  });

  const joinForm = document.getElementById('join-form');
  if (joinForm) {
    joinForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submitButton = joinForm.querySelector('button[type="submit"]');
      const roomKey = joinForm.room_key.value.trim().toUpperCase();
      const displayName = joinForm.display_name.value.trim();
      if (!roomKey || !displayName) {
        alert('Uzupełnij wszystkie pola.');
        return;
      }
      try {
        if (submitButton) {
          submitButton.disabled = true;
        }
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
        if (submitButton) {
          submitButton.disabled = false;
        }
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
