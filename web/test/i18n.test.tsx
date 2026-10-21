import { afterEach, beforeEach, expect, test } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LangSwitch, VI, getLang, initialLang, setLang, t, useT } from '../src/i18n';

beforeEach(() => { localStorage.clear(); setLang('en'); });
afterEach(cleanup);

test('the first language follows the device; a saved choice wins', () => {
  expect(initialLang('vi-VN', null)).toBe('vi');
  expect(initialLang('en-US', null)).toBe('en');
  expect(initialLang('fr-FR', null)).toBe('en');
  expect(initialLang('vi-VN', 'en')).toBe('en');
  expect(initialLang('en-US', 'vi')).toBe('vi');
});

test('t() translates, fills {placeholders}, and falls back to the English text', () => {
  expect(t('New album')).toBe('New album');
  setLang('vi');
  expect(t('New album')).toBe('Album mới');
  expect(t('Delete “{title}”?', { title: 'Đà Lạt' })).toBe('Xoá “Đà Lạt”?');
  expect(t('A sentence nobody translated')).toBe('A sentence nobody translated');
  expect(document.documentElement.lang).toBe('vi');
  expect(localStorage.getItem('lb.lang')).toBe('vi');
  expect(getLang()).toBe('vi');
});

test('every Vietnamese entry has text and keeps the same {placeholders}', () => {
  for (const [en, vi] of Object.entries(VI)) {
    expect(vi.trim(), en).not.toBe('');
    const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
    expect(holes(vi), en).toBe(holes(en));
  }
});

test('components re-render when the language changes; the switch flips it', async () => {
  function Hello() { const tr = useT(); return <p>{tr('New album')}</p>; }
  render(<><Hello /><LangSwitch /></>);
  expect(screen.getByText('New album')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Tiếng Việt' }));
  expect(screen.getByText('Album mới')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'English' })).toBeTruthy();
  act(() => setLang('en'));
  expect(screen.getByText('New album')).toBeTruthy();
});

