import { describe, expect, it } from 'vitest'
import { MODES, pageLayoutSchema, spaceLayout } from '../src'

const frame = (x: number, y: number) => ({
  type: 'frame', id: `f${x}-${y}`, x, y, w: 0.4, h: 0.3, rotation: 0, z: 1, frameStyle: 'plain', mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 },
})

describe('space', () => {
  it('a space album has one page, no AI, and starts on an empty vertical wall', () => {
    expect(MODES.space).toMatchObject({ maxPages: 1, space: true, ai: false })
    const l = spaceLayout('vertical')
    expect(l.space).toEqual({ shape: 'vertical', cols: 1, rows: 3 })
    expect(spaceLayout('horizontal').space).toEqual({ shape: 'horizontal', cols: 3, rows: 1 })
    expect(spaceLayout('free').space).toEqual({ shape: 'free', cols: 3, rows: 3 })
    expect(pageLayoutSchema.safeParse(l).success).toBe(true)
  })

  it('items use tile units: far down a wall is fine there, but not on an ordinary page', () => {
    const wall = { ...spaceLayout('vertical', 5), elements: [frame(0.2, 4.2)] }
    expect(pageLayoutSchema.safeParse(wall).success).toBe(true)
    expect(pageLayoutSchema.safeParse({ ...wall, space: { shape: 'vertical', cols: 1, rows: 3 } }).success).toBe(false) // past its end
    expect(pageLayoutSchema.safeParse({ background: 'paper-cream', elements: [frame(0.2, 4.2)] }).success).toBe(false)
    expect(pageLayoutSchema.safeParse({ background: 'paper-cream', elements: [frame(0.2, 0.5)] }).success).toBe(true)
  })

  it('a space is at most 30 tiles', () => {
    expect(pageLayoutSchema.safeParse({ ...spaceLayout('vertical'), space: { shape: 'vertical', cols: 1, rows: 30 } }).success).toBe(true)
    expect(pageLayoutSchema.safeParse({ ...spaceLayout('free'), space: { shape: 'free', cols: 6, rows: 6 } }).success).toBe(false)
  })
})
