import { describe, expect, it } from 'vitest'
import { pageLayoutSchema } from '../src/index'

const base = { x: 0.05, y: 0.08, w: 0.4, h: 0.5, rotation: -5, z: 1 }
const sample = () => ({
  background: 'paper-cream',
  elements: [
    { ...base, id: 'e1', type: 'frame', frameStyle: 'polaroid', mediaId: 'm_123', crop: { x: 0.5, y: 0.5, scale: 1 } },
    { ...base, id: 'e2', type: 'tape', w: 0.15, h: 0.05, tapeStyle: 'yellow' },
    { ...base, id: 'e3', type: 'sticker', stickerId: 'flower-1' },
    { ...base, id: 'e4', type: 'text', text: 'Đà Lạt', font: 'dancing-script', color: '#6b4f2e', size: 0.05 },
  ],
})
const ok = (l: unknown) => pageLayoutSchema.safeParse(l).success

describe('pageLayoutSchema', () => {
  it('accepts the spec sample page', () => expect(ok(sample())).toBe(true))
  it('rejects w = 0', () => {
    const l = sample(); l.elements[1].w = 0
    expect(ok(l)).toBe(false)
  })
  it('rejects x = 2', () => {
    const l = sample(); l.elements[1].x = 2
    expect(ok(l)).toBe(false)
  })
  it('rejects crop.scale = 6', () => {
    const l = sample(); (l.elements[0] as any).crop.scale = 6
    expect(ok(l)).toBe(false)
  })
  it('rejects duplicate element ids', () => {
    const l = sample(); l.elements[1].id = 'e1'
    expect(ok(l)).toBe(false)
  })
  it('rejects 201 elements', () => {
    const l = sample()
    l.elements = Array.from({ length: 201 }, (_, i) => ({ ...l.elements[2], id: `s${i}` }))
    expect(ok(l)).toBe(false)
  })
  it('rejects color "red"', () => {
    const l = sample(); (l.elements[3] as any).color = 'red'
    expect(ok(l)).toBe(false)
  })
})

describe('frame styles', () => {
  it('accepts every style in FRAME_STYLES and rejects unknown ones', async () => {
    const { FRAME_STYLES } = await import('../src/index')
    expect(FRAME_STYLES).toHaveLength(14)
    for (const s of FRAME_STYLES) {
      const l = sample(); (l.elements[0] as { frameStyle: string }).frameStyle = s
      expect(ok(l)).toBe(true)
    }
    const l = sample(); (l.elements[0] as { frameStyle: string }).frameStyle = 'oval'
    expect(ok(l)).toBe(false)
  })
})

describe('effects', () => {
  it('accepts every page effect and rejects unknown ones', async () => {
    const { PAGE_EFFECTS } = await import('../src/index')
    for (const effect of PAGE_EFFECTS) {
      const l = sample(); l.elements.push({ ...base, id: 'fx', type: 'effect', effect } as never)
      expect(ok(l)).toBe(true)
    }
    const l = sample(); l.elements.push({ ...base, id: 'fx', type: 'effect', effect: 'lasers' } as never)
    expect(ok(l)).toBe(false)
  })
})

describe('manga additions', () => {
  const page = (elements: unknown[], background = 'paper-cream') => ({ background, elements })
  it('a layout saved before manga mode (no shape / textStyle) still parses unchanged', () => {
    const before = sample()
    const parsed = pageLayoutSchema.parse(before)
    expect(parsed).toEqual(before)
  })
  it('accepts a slanted manga panel with ink and tone', () => {
    expect(ok(page([{ ...base, id: 'p', type: 'frame', frameStyle: 'panel', mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 },
      shape: [[0, 0], [1, 0], [1, 0.8], [0, 1]], border: 'normal', ink: true, tone: true }]))).toBe(true)
  })
  it('rejects a panel shape with 2 points or a point outside 0..1', () => {
    const panel = (shape: unknown) => page([{ ...base, id: 'p', type: 'frame', frameStyle: 'panel', mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 }, shape }])
    expect(ok(panel([[0, 0], [1, 1]]))).toBe(false)
    expect(ok(panel([[0, 0], [1.2, 0], [1, 1]]))).toBe(false)
  })
  it('accepts manga text styles and the bangers font', () => {
    for (const textStyle of ['plain', 'speech', 'shout', 'thought', 'narration', 'sfx']) {
      expect(ok(page([{ ...base, id: 't', type: 'text', text: 'ĐÙNG!', font: 'bangers', color: '#111111', size: 0.06, textStyle, tail: 'bl' }]))).toBe(true)
    }
  })
  it('accepts speed / focus lines and screentone effects, and white manga paper', () => {
    for (const effect of ['speed-lines', 'focus-lines', 'screentone']) {
      expect(ok(page([{ ...base, id: 'f', type: 'effect', effect }], 'paper-white'))).toBe(true)
    }
  })
})
