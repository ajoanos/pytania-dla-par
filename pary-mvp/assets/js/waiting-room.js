import { getJson } from './app.js';

const params = new URLSearchParams(window.location.search);
const roomKey = (params.get('room_key') || '').toUpperCase();
const participantId = params.get('pid');

const waitingTitle = document.getElementById('waiting-title');
const waitingMessage = document.getElementById('waiting-message');
const waitingLabel = document.getElementById('waiting-room-label');
const waitingLeave = document.getElementById('waiting-leave');

if (waitingLabel && roomKey) {
  waitingLabel.textContent = `Pokój ${roomKey}`;
}

if (!roomKey || !participantId) {
  window.location.replace('pytania-dla-par-room.html');
} else {
  waitingLeave?.addEventListener('click', () => {
    window.location.href = 'pytania-dla-par-room.html';
  });

  let pollTimer = null;
  let lastStatus = '';

  async function refreshStatus() {
    try {
      const payload = await getJson(
        `api/state.php?room_key=${encodeURIComponent(roomKey)}&participant_id=${encodeURIComponent(participantId)}`,
      );
      if (!payload.ok) {
        throw new Error(payload.error || 'Nie udało się pobrać stanu pokoju.');
      }
      const participant = payload.self || null;
      if (!participant) {
        showErrorState(
          'Nie znaleziono zgłoszenia',
          'Twoje zgłoszenie nie jest już dostępne. Wróć i spróbuj dołączyć ponownie.',
        );
        stopPolling();
        return;
      }

      if (participant.is_host || participant.status === 'active') {
        redirectToRoom();
        return;
      }

      if (participant.status === 'rejected') {
        showErrorState(
          'Prośba została odrzucona',
          'Gospodarz odrzucił Twoją prośbę. Możesz wrócić i spróbować ponownie później.',
        );
        stopPolling();
        return;
      }

      if (participant.status !== lastStatus) {
        lastStatus = participant.status || '';
        showWaitingState();
      }
    } catch (error) {
      console.error(error);
    }
  }

  function showWaitingState() {
    if (waitingTitle) {
      waitingTitle.textContent = 'Oczekiwanie na dołączenie';
    }
    if (waitingMessage) {
      waitingMessage.textContent =
        'Twoja prośba została wysłana do gospodarza. Gdy tylko zaakceptuje zgłoszenie, od razu otrzymasz dostęp do pokoju.';
    }
  }

  function showErrorState(title, message) {
    if (waitingTitle) {
      waitingTitle.textContent = title;
    }
    if (waitingMessage) {
      waitingMessage.textContent = message;
    }
  }

  function redirectToRoom() {
    stopPolling();
    const targetParams = new URLSearchParams({
      room_key: roomKey,
      pid: participantId,
    });
    window.location.replace(`room.html?${targetParams.toString()}`);
  }

  function startPolling() {
    refreshStatus();
    pollTimer = setInterval(refreshStatus, 3000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  startPolling();

  window.addEventListener('beforeunload', () => {
    stopPolling();
  });
}
