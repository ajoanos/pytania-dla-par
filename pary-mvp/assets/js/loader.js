const LOADER_ID = 'page-loader';
const LOADER_MESSAGE_ID = 'page-loader-message';

let loaderElement;
let messageElement;

function createLoader() {
  if (loaderElement) return loaderElement;

  const overlay = document.createElement('div');
  overlay.id = LOADER_ID;
  overlay.className = 'page-loader';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.setAttribute('aria-atomic', 'true');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.tabIndex = -1;

  const content = document.createElement('div');
  content.className = 'page-loader__content';

  const spinner = document.createElement('div');
  spinner.className = 'page-loader__spinner';

  const text = document.createElement('p');
  text.className = 'page-loader__text';
  text.id = LOADER_MESSAGE_ID;
  text.textContent = 'Trwa ładowanie...';

  const srHint = document.createElement('span');
  srHint.className = 'visually-hidden';
  srHint.textContent = 'Ekran ładowania, proszę czekać.';

  content.appendChild(spinner);
  content.appendChild(text);
  content.appendChild(srHint);

  overlay.appendChild(content);
  document.body.appendChild(overlay);

  loaderElement = overlay;
  messageElement = text;

  return overlay;
}

export function showLoader(message = 'Trwa ładowanie...') {
  const overlay = createLoader();
  if (messageElement) {
    messageElement.textContent = message;
  }

  overlay.classList.add('is-visible');
  overlay.setAttribute('aria-hidden', 'false');
  overlay.focus({ preventScroll: true });
}

export function hideLoader() {
  if (!loaderElement) return;

  loaderElement.classList.remove('is-visible');
  loaderElement.setAttribute('aria-hidden', 'true');
}

createLoader();
