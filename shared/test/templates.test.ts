import { describe, expect, it } from 'vitest'
import { instantiateTemplate, mangaTemplates, pageLayoutSchema, STICKER_IDS, templates } from '../src/index'

const required = ['cover', 'blank', 'one-hero', 'two-tilted', 'three-collage', 'four-grid-loose', 'hero-plus-two', 'video-feature',
  'memories', 'film-day', 'postcard', 'sweet-heart', 'old-album', 'vintage', 'journal', 'instant-fan',
  'six-grid', 'round-stickers', 'photobooth', 'hero-note', 'tilted-pair', 'journey', 'quote-photo', 'the-end']
const stickerIds = [...STICKER_IDS]

describe('templates', () => {
  it('has every required template', () => {
    expect(templates.map((t) => t.id)).toEqual(expect.arrayContaining(required))
  })

  for (const t of templates) {
    describe(t.id, () => {
      const els = t.layout.elements
      const frames = els.filter((e) => e.type === 'frame')

      it('parses with pageLayoutSchema', () => expect(pageLayoutSchema.safeParse(t.layout).success).toBe(true))

      it('keeps every frame box inside the page with a 5% margin', () => {
        for (const f of frames) {
          expect(f.x).toBeGreaterThanOrEqual(0.05)
          expect(f.y).toBeGreaterThanOrEqual(0.05)
          expect(f.x + f.w).toBeLessThanOrEqual(0.95)
          expect(f.y + f.h).toBeLessThanOrEqual(0.95)
        }
      })

      it('tilts within ±8° (tape may cross a corner diagonally, ±45°)', () => {
        for (const e of els) expect(Math.abs(e.rotation)).toBeLessThanOrEqual(e.type === 'tape' ? 45 : 8)
      })

      it('uses only stickers that exist', () => {
        for (const e of els) if (e.type === 'sticker') expect(stickerIds).toContain(e.stickerId)
      })

      if (t.id === 'blank') return
      it('uses empty frames and at most 3 tape strips', () => {
        expect(frames.length).toBeGreaterThan(0)
        for (const f of frames) expect(f).toMatchObject({ mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 } })
        expect(els.filter((e) => e.type === 'tape').length).toBeLessThanOrEqual(3)
      })
    })
  }
})

describe('instantiateTemplate', () => {
  it('gives fresh ids that differ between calls', () => {
    let n = 0
    const newId = () => `new-${n++}`
    const t = templates.find((x) => x.id === 'three-collage')!
    const a = instantiateTemplate('three-collage', newId)
    const b = instantiateTemplate('three-collage', newId)
    const old = new Set(t.layout.elements.map((e) => e.id))
    const aIds = a.elements.map((e) => e.id)
    const bIds = b.elements.map((e) => e.id)
    expect(aIds).toHaveLength(t.layout.elements.length)
    for (const id of aIds) expect(old.has(id)).toBe(false)
    for (const id of aIds) expect(bIds).not.toContain(id)
    expect(pageLayoutSchema.safeParse(a).success).toBe(true)
  })

  it('does not share nested objects with the template', () => {
    const before = structuredClone(templates.find((x) => x.id === 'cover')!.layout)
    const inst = instantiateTemplate('cover', () => 'x')
    const f = inst.elements.find((e) => e.type === 'frame')!
    if (f.type === 'frame') f.crop.x = 0.1
    inst.background = 'paper-dots'
    expect(templates.find((x) => x.id === 'cover')!.layout).toEqual(before)
  })

  it('throws on unknown id', () => {
    expect(() => instantiateTemplate('nope', () => 'x')).toThrow(/unknown template/)
  })
})

describe('AI metadata', () => {
  const inPage = ([x = 0, y = 0, w = 0, h = 0]: (number | undefined)[]) => x >= 0 && y >= 0 && x + w <= 1.0001 && y + h <= 1.0001
  for (const t of [...templates, ...mangaTemplates]) {
    it(`${t.id}: about and boxes inside the page`, () => {
      if (t.id === 'blank') return expect(t.ai).toBeUndefined()
      expect(t.ai?.about.length, t.id).toBeGreaterThan(10)
      expect(t.ai!.about.length, t.id).toBeLessThanOrEqual(80)
      for (const e of t.layout.elements) expect(inPage([e.x, e.y, e.w, e.h]), `${t.id} ${e.id}`).toBe(true)
      for (const s of t.ai!.texts ?? []) expect(inPage(s.box), `${t.id} text slot`).toBe(true)
      for (const b of t.ai!.stickers ?? []) expect(inPage(b), `${t.id} sticker spot`).toBe(true)
    })
  }
})
