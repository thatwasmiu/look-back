import { expect, test } from 'vitest';
import { albumDesignSchema } from '@scrapbook/shared';
import { albumTemplates } from '../src/example/albumTemplates';

test('every built-in album template produces a valid design', () => {
  for (const t of albumTemplates) expect(albumDesignSchema.safeParse(t.design()).success, t.id).toBe(true);
});

test('manga templates: at least three, all-manga pages of panels on white paper, reading direction passed through', () => {
  const manga = albumTemplates.filter((t) => t.mode === 'manga');
  expect(manga.length).toBeGreaterThanOrEqual(3);
  for (const t of manga) {
    const d = t.design('rtl');
    expect(d).toMatchObject({ mode: 'manga', readingDirection: 'rtl' });
    expect(d.pages.length, t.id).toBeGreaterThanOrEqual(3);
    for (const p of d.pages) {
      expect(p.background, t.id).toBe('paper-white');
      expect(p.elements.some((e) => e.type === 'frame' && e.frameStyle === 'panel'), t.id).toBe(true);
    }
    // bubbles / narration / sound effects are what makes it manga
    expect(d.pages.flatMap((p) => p.elements).some((e) => e.type === 'text' && e.textStyle && e.textStyle !== 'plain'), t.id).toBe(true);
  }
  for (const t of albumTemplates.filter((x) => x.mode !== 'manga')) expect(t.design().mode ?? 'scrapbook', t.id).toBe('scrapbook');
});

test('"2 3 con mực" also comes as a manga template, with its ocean look and template music', () => {
  const t = albumTemplates.find((x) => x.mode === 'manga' && x.name === '2 3 con mực')!;
  expect(t).toBeTruthy();
  const d = t.design();
  expect(d).toMatchObject({ mode: 'manga', backgroundColor: 'ocean', backgroundEffect: 'bubbles', music: 'squids' });
  const els = d.pages.flatMap((p) => p.elements);
  expect(els.some((e) => e.type === 'text' && e.text === '2 3 con mực')).toBe(true);
  expect(els.some((e) => e.type === 'sticker' && e.stickerId === 'octopus')).toBe(true);
});
