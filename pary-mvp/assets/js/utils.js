export const ACTIVE_TOKEN = new URLSearchParams(window.location.search).get('token') || '';

export function appendTokenToUrl(value, token = ACTIVE_TOKEN) {
  if (!value) return value;
  if (!token) return value;

  try {
    const url = new URL(value, window.location.href);
    url.searchParams.set('token', token);
    return url.toString();
  } catch (error) {
    console.warn('Nie udało się zaktualizować adresu z tokenem:', error);
    return value;
  }
}

export async function postJson(url, data) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  let parsed;
  try {
    parsed = await response.json();
  } catch (error) {
    parsed = null;
  }

  if (!response.ok) {
    const message = parsed?.error || `Błąd sieci ${response.status}`;
    throw new Error(message);
  }

  return parsed;
}

export async function getJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      ...headers,
    },
  });

  if (response.status === 304) {
    return { ok: true, notModified: true };
  }

  if (!response.ok) {
    throw new Error(`Błąd sieci ${response.status}`);
  }

  const data = await response.json();

  // Capture ETag if present
  const etag = response.headers.get('ETag');
  if (etag && typeof data === 'object') {
    data._etag = etag;
  }

  return data;
}
