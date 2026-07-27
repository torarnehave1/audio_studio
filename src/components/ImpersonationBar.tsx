import { useEffect, useState } from 'react';
import { readStoredUser } from '../lib/auth';

const API = 'https://audio-portfolio-worker.torarnehave.workers.dev';
// localStorage key holding the System Owner's REAL login while impersonating.
const BACKUP_KEY = 'originalUser';

type AdminUser = {
  email: string;
  userId: string;
  role: string | null;
  displayName: string | null;
  isSystemOwner: boolean;
};

/**
 * System Owner "Login as…" control — ported from vegvisr-realtime's ImpersonationBar,
 * pointed at audio-portfolio-worker's /admin/users + /admin/impersonate instead.
 *
 * - Backend gates both endpoints on `auth.isSystemOwner`, so a non-owner who somehow
 *   renders this gets 403 and nothing shows.
 * - Impersonating swaps localStorage['user'] for the target's auth payload and stashes the
 *   owner's real login in localStorage['originalUser'] so it can be restored with one click.
 */
export default function ImpersonationBar() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stored = readStoredUser();
  const token = stored?.emailVerificationToken || '';
  const impersonating =
    typeof window !== 'undefined' && !!window.localStorage.getItem(BACKUP_KEY);

  // Only probe the user list when we are NOT already impersonating and hold a
  // token. A 403 (not a System Owner) leaves `users` null → renders nothing.
  useEffect(() => {
    if (impersonating || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}/admin/users`, { headers: { 'X-API-Token': token } });
        if (!r.ok) return;
        const data = await r.json();
        if (!cancelled && data.success) setUsers(data.users || []);
      } catch {
        /* not a System Owner / network — render nothing */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, impersonating]);

  const impersonate = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API}/admin/impersonate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Token': token },
        body: JSON.stringify({ email: selected }),
      });
      const data = await r.json();
      if (!r.ok || !data.success) {
        setError(data.error || `Impersonation failed (${r.status})`);
        setBusy(false);
        return;
      }
      // Preserve the TRUE original login; never overwrite an existing backup.
      if (!window.localStorage.getItem(BACKUP_KEY)) {
        window.localStorage.setItem(BACKUP_KEY, window.localStorage.getItem('user') || '');
      }
      window.localStorage.setItem('user', JSON.stringify(data.user));
      window.location.reload();
    } catch (e: any) {
      setError(e?.message || 'Network error');
      setBusy(false);
    }
  };

  const stop = () => {
    const orig = window.localStorage.getItem(BACKUP_KEY);
    if (orig) window.localStorage.setItem('user', orig);
    window.localStorage.removeItem(BACKUP_KEY);
    window.location.reload();
  };

  // Impersonating → prominent banner with one-click return.
  if (impersonating) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-600 text-white text-sm">
        <span>
          👁 Viewing as <b>{stored?.email}</b>
          {stored?.role ? ` (${stored.role})` : ''} — impersonated by System Owner
        </span>
        <button
          className="px-3 py-1 bg-amber-800 hover:bg-amber-900 rounded text-xs font-medium whitespace-nowrap"
          onClick={stop}
        >
          ↩ Return to my account
        </button>
      </div>
    );
  }

  // Not a System Owner (or no users) → render nothing.
  if (!users || users.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-zinc-800/60 border-b border-zinc-700 text-sm">
      <label htmlFor="impersonate-user" className="text-zinc-400 text-xs whitespace-nowrap">
        🔑 Login as
      </label>
      <select
        id="impersonate-user"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="bg-zinc-900 border border-zinc-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-sky-500 flex-1 min-w-0 max-w-full sm:max-w-xs"
      >
        <option value="">Select a user…</option>
        {users
          .filter((u) => u.email !== stored?.email)
          .map((u) => (
            <option key={u.email} value={u.email}>
              {u.email} ({u.role || 'no role'})
              {u.isSystemOwner ? ' ★' : ''}
            </option>
          ))}
      </select>
      <button
        className="px-3 py-1 bg-sky-700 hover:bg-sky-600 rounded text-white text-xs disabled:opacity-40"
        disabled={!selected || busy}
        onClick={impersonate}
      >
        {busy ? 'Switching…' : 'Go'}
      </button>
      {error && <span className="text-red-400 text-xs">{error}</span>}
    </div>
  );
}
