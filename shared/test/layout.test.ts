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
