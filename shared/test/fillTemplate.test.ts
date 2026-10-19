import { describe, expect, it } from 'vitest'
import { fillTemplate, mangaTemplates, pageLayoutSchema, stickerSpotCount, templates, textSlots, type Template } from '../src/index'

let n = 0
const id = () => `x${n++}`
const texts = (l: ReturnType<typeof fillTemplate>) => l.elements.flatMap((e) => (e.type === 'text' ? [e.text] : []))

describe('fillTemplate', () => {
  it('fills text slots in order', () => {
    expect(texts(fillTemplate('cover', ['Một ngày đi làm'], [], id))).toEqual(['Một ngày đi làm'])
  })

  it('removes unfilled slots', () => {
    const two = templates.find((t) => textSlots(t).length >= 2)!
    const l = fillTemplate(two.id, ['chỉ một'], [], id)
    expect(texts(l)).toEqual(['chỉ một'])
    expect(texts(l)).not.toContain('Tiêu đề')
  })

  it('cuts text to the slot max', () => {
    const [slot] = textSlots(templates.find((t) => t.id === 'cover')!)
    const [t] = texts(fillTemplate('cover', ['a'.repeat(200)], [], id))
    expect(t.length).toBeLessThanOrEqual(slot.max)
  })

  it('replaces sticker ids and drops unknown ones', () => {
    // cover has one layout sticker ('flower')
    const known = fillTemplate('cover', ['x'], ['heart'], id).elements.filter((e) => e.type === 'sticker')
    expect(known.map((e) => e.type === 'sticker' && e.stickerId)).toEqual(['heart'])
    const unknown = fillTemplate('cover', ['x'], ['dragon'], id).elements.filter((e) => e.type === 'sticker')
    expect(unknown.map((e) => e.type === 'sticker' && e.stickerId)).toEqual(['flower'])
    // ai.stickers spots are added only for a known id
    const withSpots = [...templates, ...mangaTemplates].find((t) => (t.ai?.stickers?.length ?? 0) > 0)
    if (withSpots) {
      const base = withSpots.layout.elements.filter((e) => e.type === 'sticker').length
      const count = (s: string[]) => fillTemplate(withSpots.id, [], s, id).elements.filter((e) => e.type === 'sticker').length
      expect(count(Array(base).fill('nope').concat(['nope']))).toBe(base)
      expect(count(Array(base).fill('heart').concat(['heart']))).toBe(base + 1)
    }
  })

  it('adds AI text slots as styled text elements', () => {
    const t: Template | undefined = mangaTemplates.find((x) => x.ai?.texts?.some((s) => s.style === 'speech'))
    if (!t) return
    const all = textSlots(t).map(() => 'Chào!')
    const speech = fillTemplate(t.id, all, [], id).elements.find((e) => e.type === 'text' && e.textStyle === 'speech')
    expect(speech).toMatchObject({ text: 'Chào!', font: 'patrick-hand', tail: t.ai!.texts!.find((s) => s.style === 'speech')!.tail ?? 'bl' })
  })

  it('result passes pageLayoutSchema for every template', () => {
    for (const t of [...templates, ...mangaTemplates]) {
      const l = fillTemplate(t.id, Array(8).fill('x'), Array(stickerSpotCount(t)).fill('heart'), id)
      expect(pageLayoutSchema.safeParse(l).success, t.id).toBe(true)
    }
  })
})
