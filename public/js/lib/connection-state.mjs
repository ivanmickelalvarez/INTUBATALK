export function classifyApiResponse(response) {
  if (response.type === 'opaqueredirect' || response.redirected || isAuthenticationResponse(response)) return 'auth';
  if (!response.ok) return response.status > 0 ? 'service' : 'offline';
  if (response.status <= 0) return 'offline';
  return response.contentType?.includes('application/json') ? 'live' : 'service';
}

export function classifyConnectivityProbe(response) {
  if (!response) return 'offline';
  if (response.type === 'opaqueredirect' || response.redirected || isAuthenticationResponse(response)) return 'auth';
  return response.ok || response.status > 0 ? 'service' : 'offline';
}

function isAuthenticationResponse(response) {
  return (response.status >= 300 && response.status < 400) || response.status === 401 || response.status === 403;
}

export function normalizeConnectionState(state) {
  if (state === true || state === 'live') return 'live';
  if (state === 'auth' || state === 'service') return state;
  return 'offline';
}
