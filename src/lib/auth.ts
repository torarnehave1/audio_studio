/**
 * Auth helpers for vegvisr ecosystem integration.
 * Magic link login via cookie.vegvisr.org, role from dashboard.vegvisr.org.
 */

const MAGIC_BASE = 'https://cookie.vegvisr.org';
const DASHBOARD_BASE = 'https://dashboard.vegvisr.org';

export type AuthUser = {
  userId: string;
  email: string;
  role: string | null;
};

export type AuthStatus = 'checking' | 'authed' | 'anonymous';

/** Read stored user from localStorage */
export const readStoredUser = (): AuthUser | null => {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const userId = parsed.user_id || parsed.oauth_id;
    const email = parsed.email;
    if (!userId || !email) return null;
    return { userId, email, role: parsed.role || null };
  } catch {
    return null;
  }
};

/** Persist user data to localStorage */
export const persistUser = (user: {
  email: string;
  role: string;
  user_id: string | null;
  emailVerificationToken: string | null;
  oauth_id?: string | null;
}) => {
  const payload = {
    email: user.email,
    role: user.role,
    user_id: user.user_id,
    oauth_id: user.oauth_id || user.user_id || null,
    emailVerificationToken: user.emailVerificationToken,
  };
  localStorage.setItem('user', JSON.stringify(payload));
  if (user.emailVerificationToken) {
    setAuthCookie(user.emailVerificationToken);
  }
  sessionStorage.setItem('email_session_verified', '1');
};

/** Clear user data */
export const clearUser = () => {
  localStorage.removeItem('user');
  sessionStorage.removeItem('email_session_verified');
  clearAuthCookie();
};

/** Send magic link email */
export const sendMagicLink = async (email: string): Promise<void> => {
  const redirectUrl = `${window.location.origin}${window.location.pathname}`;
  const res = await fetch(`${MAGIC_BASE}/login/magic/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), redirectUrl }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to send magic link.');
  }
};

/** Verify magic token from URL */
export const verifyMagicToken = async (token: string): Promise<AuthUser> => {
  const res = await fetch(
    `${MAGIC_BASE}/login/magic/verify?token=${encodeURIComponent(token)}`,
    { method: 'GET', headers: { 'Content-Type': 'application/json' } }
  );
  const data = await res.json();
  if (!res.ok || !data.success || !data.email) {
    throw new Error(data.error || 'Invalid or expired magic link.');
  }

  try {
    const ctx = await fetchUserContext(data.email);
    persistUser(ctx);
    return { userId: ctx.user_id || ctx.email, email: ctx.email, role: ctx.role };
  } catch {
    persistUser({
      email: data.email,
      role: 'user',
      user_id: data.email,
      emailVerificationToken: null,
    });
    return { userId: data.email, email: data.email, role: 'user' };
  }
};

/** Fetch user context (role + user_id) from dashboard */
const fetchUserContext = async (email: string) => {
  const roleRes = await fetch(
    `${DASHBOARD_BASE}/get-role?email=${encodeURIComponent(email)}`
  );
  if (!roleRes.ok) throw new Error('Role unavailable');
  const roleData = await roleRes.json();
  if (!roleData?.role) throw new Error('No role found');

  const userDataRes = await fetch(
    `${DASHBOARD_BASE}/userdata?email=${encodeURIComponent(email)}`
  );
  if (!userDataRes.ok) throw new Error('User data unavailable');
  const userData = await userDataRes.json();

  return {
    email,
    role: roleData.role,
    user_id: userData.user_id || email,
    emailVerificationToken: userData.emailVerificationToken || null,
    oauth_id: userData.oauth_id || null,
  };
};

/** Set auth cookie */
const setAuthCookie = (token: string) => {
  if (!token) return;
  const isVegvisr = window.location.hostname.endsWith('vegvisr.org');
  const domain = isVegvisr ? '; Domain=.vegvisr.org' : '';
  const maxAge = 60 * 60 * 24 * 30;
  document.cookie = `vegvisr_token=${encodeURIComponent(
    token
  )}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure${domain}`;
};

/** Clear auth cookie */
const clearAuthCookie = () => {
  const base = 'vegvisr_token=; Path=/; Max-Age=0; SameSite=Lax; Secure';
  document.cookie = base;
  if (window.location.hostname.endsWith('vegvisr.org')) {
    document.cookie = `${base}; Domain=.vegvisr.org`;
  }
};
