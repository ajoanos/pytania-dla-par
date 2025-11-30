import { appendTokenToUrl, initThemeToggle } from './app.js';

export const TOPBAR_DEFAULTS = {
  mountSelector: '#topbar',
  logoUrl: 'https://sklep.allemedia.pl/momenty/logo.png',
  logoAlt: 'Momenty',
  homeHref: 'index.html',
  brandName: 'Momenty',
};

function getMountTarget(options) {
  if (options.target instanceof HTMLElement) {
    return options.target;
  }
  if (options.mountSelector) {
    return document.querySelector(options.mountSelector);
  }
  return document.querySelector(TOPBAR_DEFAULTS.mountSelector);
}

export function renderTopbar(options = {}) {
  const config = { ...TOPBAR_DEFAULTS, ...options };
  const mountTarget = getMountTarget({
    target: options.target,
    mountSelector: config.mountSelector,
  });

  if (!mountTarget) {
    return null;
  }

  const topbarId = config.mountSelector?.startsWith('#')
    ? config.mountSelector.slice(1)
    : config.mountSelector;

  if (!mountTarget.id && topbarId) {
    mountTarget.id = topbarId;
  }

  mountTarget.classList.add('topbar');

  const brandHref = appendTokenToUrl(config.homeHref);

  mountTarget.innerHTML = `
    <div class="topbar__inner">
      <a class="topbar__brand" href="${brandHref}">
        <img class="topbar__logo" src="${config.logoUrl}" alt="${config.logoAlt}">
        <span class="topbar__title">${config.brandName}</span>
      </a>
      <div class="topbar__actions">
        <button class="topbar__theme-toggle" id="theme-toggle" type="button" aria-label="Przełącz motyw"></button>
      </div>
    </div>
  `;

  const themeToggle = mountTarget.querySelector('#theme-toggle');
  initThemeToggle(themeToggle);

  return mountTarget;
}
