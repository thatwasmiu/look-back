import { useCallback, useSyncExternalStore } from 'react';
import { VI } from './i18n.vi';

// Two languages. English is the source text: t('New album') returns it as is in English and looks it up in the
// Vietnamese table otherwise (missing entries fall back to the English). {name} placeholders are filled from vars.
// The choice is per device (localStorage); the first one follows the device language.
export { VI };
export type Lang = 'vi' | 'en';
const KEY = 'lb.lang';

export const initialLang = (deviceLang: string, saved: string | null): Lang =>
  saved === 'vi' || saved === 'en' ? saved : deviceLang.toLowerCase().startsWith('vi') ? 'vi' : 'en';

const read = (): string | null => { try { return localStorage.getItem(KEY); } catch { return null; } };
let lang: Lang = initialLang(typeof navigator === 'undefined' ? 'en' : navigator.language ?? 'en', read());
const listeners = new Set<() => void>();
if (typeof document !== 'undefined') document.documentElement.lang = lang;

export const getLang = (): Lang => lang;
export function setLang(next: Lang): void {
  lang = next;
  try { localStorage.setItem(KEY, next); } catch { /* private mode: this visit only */ }
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  listeners.forEach((l) => l());
}

export type Vars = Record<string, string | number>;
const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);
export const t = (en: string, vars?: Vars): string => fill(lang === 'vi' ? VI[en] ?? en : en, vars);

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
// In components: re-renders when the language changes.
export function useT(): typeof t {
  const current = useSyncExternalStore(subscribe, getLang, getLang);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((en: string, vars?: Vars) => t(en, vars), [current]);
}

export function LangSwitch({ className = '' }: { className?: string }) {
  const current = useSyncExternalStore(subscribe, getLang, getLang);
  const other: Lang = current === 'vi' ? 'en' : 'vi';
  return (
    <button type="button" className={`lang-switch ${className}`} aria-label={other === 'vi' ? 'Tiếng Việt' : 'English'}
      title={other === 'vi' ? 'Tiếng Việt' : 'English'} onClick={() => setLang(other)}>{other === 'vi' ? 'VI' : 'EN'}</button>
  );
}
