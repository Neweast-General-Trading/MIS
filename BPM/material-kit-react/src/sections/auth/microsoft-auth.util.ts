export function consumeMicrosoftAuthRedirect(): {
  accessToken: string;
  email: string;
  displayName: string;
} | null {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const accessToken = params.get('accessToken')?.trim();
  if (!accessToken) return null;

  const email = params.get('email')?.trim() || '';
  const displayName = params.get('displayName')?.trim() || email;

  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return { accessToken, email, displayName };
}

export function readLoginErrorFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const message = params.get('loginError')?.trim();
  if (!message) return null;

  window.history.replaceState(null, '', window.location.pathname);
  return message;
}

export function startMicrosoftLogin() {
  const returnTo = window.location.href.split('#')[0];
  window.location.href = `/auth/microsoft/login?returnTo=${encodeURIComponent(returnTo)}`;
}
