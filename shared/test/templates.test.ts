import { describe, expect, it } from 'vitest'
import { instantiateTemplate, pageLayoutSchema, templates } from '../src/index'

const required = ['cover', 'blank', 'one-hero', 'two-tilted', 'three-collage', 'four-grid-loose', 'hero-plus-two', 'video-feature']

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

      it('tilts within ±8°', () => {
        for (const e of els) expect(Math.abs(e.rotation)).toBeLessThanOrEqual(8)
      })

      if (t.id === 'blank') return
      it('uses empty polaroid frames and 1–3 tape strips', () => {
        expect(frames.length).toBeGreaterThan(0)
        for (const f of frames) {
          expect(f).toMatchObject({ frameStyle: 'polaroid', mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 } })
        }
        const tapes = els.filter((e) => e.type === 'tape').length
        expect(tapes).toBeGreaterThanOrEqual(1)
        expect(tapes).toBeLessThanOrEqual(3)
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
