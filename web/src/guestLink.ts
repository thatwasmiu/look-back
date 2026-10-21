import { useEffect } from 'react';

// Shared links (/e/<code> edit, /s/<code> view) for people who aren't the owner.
// - The page points the app manifest at itself, so "Add to Home Screen" from it opens that album (the installed app
//   starts on the link; on iPhone it doesn't share Safari's cookies, so it needs the code anyway).
// - The last link that worked is remembered (in this browser / this installed app), so the login screen can offer it.
const KEY = 'lb.guestLink';
const CODE = '[A-Za-z0-9_-]{43}';

export function lastGuestLink(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function rememberGuestLink(path: string): void {
  try { localStorage.setItem(KEY, path); } catch { /* private mode: nothing to remember */ }
}
export function forgetGuestLink(path: string): void {
  try { if (localStorage.getItem(KEY) === path) localStorage.removeItem(KEY); } catch { /* ignore */ }
}

// A pasted link ("https://…/e/<code>", "/s/<code>?app") → its path; a bare code → the code; anything else → null.
export function parseShareInput(input: string): string | null {
  const s = input.trim();
  const link = new RegExp(`/(e|s)/(${CODE})(?:[?#/]|$)`).exec(s);
  if (link) return `/${link[1]}/${link[2]}`;
  return new RegExp(`^${CODE}$`).test(s) ? s : null;
}

export function useLinkManifest(kind: 'e' | 's', token: string): void {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return;
    const before = link.getAttribute('href');
    link.setAttribute('href', `/api/manifest/${kind}/${token}`);
    return () => { if (before) link.setAttribute('href', before); };
  }, [kind, token]);
}
