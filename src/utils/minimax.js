const DEFAULT_PROXY_URL = '/api/minimax';

export function getMinimaxProxyUrl() {
  return import.meta.env.VITE_MINIMAX_PROXY_URL || DEFAULT_PROXY_URL;
}

export async function callMinimax(payload) {
  const proxyUrl = getMinimaxProxyUrl();

  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Minimax API error: ${res.status} ${text}`);
  }

  return res.json();
}
