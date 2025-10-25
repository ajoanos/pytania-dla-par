const STORAGE_KEY_THEME = 'pary.theme';

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
