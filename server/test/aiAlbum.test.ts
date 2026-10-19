import { describe, expect, it } from 'vitest';
import { albumDesignSchema } from '@scrapbook/shared';
import { aiTemplates, answerSchema, buildPrompt, toDesign } from '../src/aiAlbum.js';
import { GeminiError } from '../src/gemini.js';

let n = 0;
const id = () => `i${n++}`;
const page = (template: string, texts = ['Chào'], stickers: string[] = []) => ({ template, texts, stickers });

describe('AI album', () => {
  it('offers each mode only its own templates, and never blank', () => {
    const manga = (answerSchema('manga') as any).properties.pages.items.properties.template.enum as string[];
    expect(manga.length).toBeGreaterThanOrEqual(18);
    expect(manga.every((t) => t.startsWith('manga-'))).toBe(true);
    const scrap = aiTemplates('scrapbook').map((t) => t.id);
    expect(scrap).toContain('cover');
    expect(scrap).not.toContain('blank');
    expect(scrap.some((t) => t.startsWith('manga-'))).toBe(false);
    expect((answerSchema('scrapbook') as any).properties.pages).toMatchObject({ minItems: 4, maxItems: 10 });
  });

  it('prompt carries the description and every template', () => {
    const p = buildPrompt('1 ngày đi làm: thang máy, họp', 'manga');
    expect(p).toContain('1 ngày đi làm: thang máy, họp');
    for (const t of aiTemplates('manga')) expect(p).toContain(t.id);
    expect(p).toContain('octopus');
  });

  it('sanitizes a messy answer', () => {
    const d = toDesign({
      title: 'Đi làm', backgroundColor: 'pink', backgroundEffect: 'lava',
      pages: [page('manga-cover', ['x'.repeat(500)], ['dragon', 'heart']), page('cover'), page('nope'), page('manga-grid', ['a', 'b', 'c']),
        page('manga-yonkoma'), page('manga-ending')],
    }, 'manga', 'rtl', id);
    expect(albumDesignSchema.safeParse(d).success).toBe(true);
    expect(d.pages).toHaveLength(4);
    expect(d).toMatchObject({ backgroundColor: 'walnut', backgroundEffect: 'none', mode: 'manga', readingDirection: 'rtl' });
    const texts = d.pages[0].elements.flatMap((e) => (e.type === 'text' ? [e.text] : []));
    expect(texts[0].length).toBeLessThanOrEqual(30);
    expect(d.pages[0].elements.some((e) => e.type === 'sticker' && e.stickerId === 'heart')).toBe(true);
    expect(d.pages[0].elements.some((e) => e.type === 'sticker' && e.stickerId === 'dragon')).toBe(false);
  });

  it('keeps at most 10 pages; fewer than 4 usable pages is unusable', () => {
    const many = toDesign({ title: 't', backgroundColor: 'rose', backgroundEffect: 'petals', pages: Array(12).fill(page('cover')) }, 'scrapbook', 'ltr', id);
    expect(many.pages).toHaveLength(10);
    expect(many.mode).toBe('scrapbook');
    const bad = () => toDesign({ title: 't', pages: [page('cover'), page('journal'), page('manga-grid')] }, 'scrapbook', 'ltr', id);
    expect(bad).toThrow(GeminiError);
    expect(() => toDesign('nonsense', 'scrapbook', 'ltr', id)).toThrow(GeminiError);
  });
});
