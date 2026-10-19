import { describe, expect, it } from 'vitest'
import { findTemplate, instantiateTemplate, mangaTemplates, pageLayoutSchema } from '../src/index'

const IDS = ['manga-cover', 'manga-grid', 'manga-slants', 'manga-splash', 'manga-tall-stack', 'manga-columns', 'manga-strips', 'manga-diagonal', 'manga-six', 'manga-bleed',
  'manga-yonkoma', 'manga-five-slash', 'manga-inset', 'manga-dialogue', 'manga-action', 'manga-flashback', 'manga-chapter', 'manga-ending']

describe('manga page layouts', () => {
  it('has the eighteen layouts, each a valid white page of panels (and optional text)', () => {
    expect(mangaTemplates.map((t) => t.id)).toEqual(IDS)
    for (const t of mangaTemplates) {
      expect(pageLayoutSchema.safeParse(t.layout).success, t.id).toBe(true)
      expect(t.layout.background).toBe('paper-white')
      const panels = t.layout.elements.filter((e) => e.type === 'frame')
      expect(panels.length, t.id).toBeGreaterThan(0)
      for (const e of t.layout.elements) {
        expect(e.type === 'text' || (e.type === 'frame' && e.frameStyle === 'panel' && e.mediaId === null), t.id).toBe(true)
        if (e.type === 'frame') expect(e.x >= 0 && e.y >= 0 && e.x + e.w <= 1.0001 && e.y + e.h <= 1.0001, `${t.id} ${e.id}`).toBe(true)
      }
    }
  })
  it('the manga cover has a title over one big panel', () => {
    const cover = mangaTemplates.find((t) => t.id === 'manga-cover')!
    expect(cover.name).toBe('Cover')
    const texts = cover.layout.elements.filter((e) => e.type === 'text')
    const panels = cover.layout.elements.filter((e) => e.type === 'frame')
    expect(panels).toHaveLength(1)
    expect(panels[0].w * panels[0].h).toBeGreaterThan(0.45) // the big cover image
    expect(texts.some((t) => t.type === 'text' && t.text === 'Tiêu đề')).toBe(true)
  })
  it('findTemplate finds scrapbook and manga layouts; instantiate gives fresh ids', () => {
    expect(findTemplate('cover')?.id).toBe('cover')
    expect(findTemplate('manga-slants')?.id).toBe('manga-slants')
    expect(findTemplate('nope')).toBeUndefined()
    let n = 0
    const l = instantiateTemplate('manga-slants', () => `id${n++}`)
    expect(l.elements.every((e) => e.id.startsWith('id'))).toBe(true)
  })
})
