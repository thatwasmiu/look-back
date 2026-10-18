import { readFileSync } from 'node:fs';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { FrameEl, PageElement, TextEl } from '@scrapbook/shared';
import { PageRenderer } from '../src/render/PageRenderer';

afterEach(cleanup);
const box = { x: 0.1, y: 0.1, w: 0.5, h: 0.4, rotation: 0, z: 1 };
const page = (elements: PageElement[], mode: 'view' | 'edit' = 'view') =>
  render(<PageRenderer layout={{ background: 'paper-white', elements }} media={new Map()} mode={mode} />).container;
const panel = (over: Partial<FrameEl> = {}): FrameEl => ({
  ...box, type: 'frame', id: 'p1', frameStyle: 'panel', mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 }, ...over,
});
const text = (over: Partial<TextEl>): TextEl => ({ ...box, type: 'text', id: 't1', text: 'ĐÙNG!', font: 'patrick-hand', color: '#111111', size: 0.06, ...over });

test('a slanted panel clips its photo window (not the element) to its shape, with ink and screentone', () => {
  const c = page([panel({ shape: [[0, 0], [1, 0], [1, 0.8], [0, 1]], ink: true, tone: true })]);
  const win = c.querySelector<HTMLElement>('.frame-panel .frame-window')!;
  expect(win.style.clipPath).toBe('polygon(0% 0%, 100% 0%, 100% 80%, 0% 100%)');
  expect(c.querySelector<HTMLElement>('[data-el="p1"]')!.style.clipPath).toBe('');
  expect(win.classList.contains('ink')).toBe(true);
  expect(c.querySelector('.frame-panel .tone')).not.toBeNull();
});

test('panel border weight is a class; an empty panel still offers "+ add" in the editor', () => {
  const c = page([panel({ border: 'none' })], 'edit');
  expect(c.querySelector('.frame-panel')!.classList.contains('panel-border-none')).toBe(true);
  expect(screen.getByText('+ add')).toBeTruthy();
});

test.each(['speech', 'shout', 'thought', 'narration', 'sfx'] as const)('text style %s renders as a manga component with its text', (textStyle) => {
  const c = page([text({ textStyle, tail: 'bl' })]);
  const el = c.querySelector(`.manga-${textStyle}`)!;
  expect(el).not.toBeNull();
  expect(el.textContent).toContain('ĐÙNG!');
});

test('sound effects in Bangers; plain / unstyled text renders exactly as before', () => {
  const c = page([text({ id: 'a', textStyle: 'sfx', font: 'bangers' }), text({ id: 'b' })]);
  expect(c.querySelector<HTMLElement>('.manga-sfx')!.style.fontFamily).toMatch(/^["']Bangers["']/);
  const plain = c.querySelector<HTMLElement>('[data-el="b"] .text')!;
  expect(plain.className).toBe('text');
  expect(c.querySelector('[data-el="b"] [class*="manga-"]')).toBeNull();
});

test.each(['speed-lines', 'focus-lines', 'screentone'] as const)('%s is a static overlay (no animated particles)', (effect) => {
  const c = page([{ ...box, type: 'effect', id: 'e', effect }]);
  expect(c.querySelector(`.fx-${effect}`)).not.toBeNull();
  expect(c.querySelectorAll(`.fx-${effect} i`)).toHaveLength(0);
});

test('white manga paper, and the Vietnamese subset of the sound-effect font is bundled', () => {
  expect(page([]).querySelector('.bg-paper-white')).not.toBeNull();
  expect(readFileSync('src/main.tsx', 'utf8')).toContain('@fontsource/bangers/vietnamese.css');
});
