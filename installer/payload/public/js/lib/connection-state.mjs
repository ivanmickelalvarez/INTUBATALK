export function classifyApiResponse(response, appOrigin) {
  if (response.type === 'opaqueredirect') return 'auth';
  if (!response.ok) return 'offline';
  if (response.redirected) {
    try {
      if (new URL(response.url).origin !== appOrigin) return 'auth';
    } catch { return 'auth'; }
  }
  return response.contentType?.includes('application/json') ? 'live' : 'offline';
}

export function classifyConnectivityProbe(responseReceived) {
  return responseReceived ? 'service' : 'offline';
}

export function normalizeConnectionState(state) {
  if (state === true || state === 'live') return 'live';
  if (state === 'auth' || state === 'service') return state;
  return 'offline';
}
