import { describe, expect, it } from 'vitest'
import { ALBUM_MODES, MODES, findTemplate } from '../src'

describe('album modes', () => {
  it.each(ALBUM_MODES)('%s: starts on a page it offers, and offers some pages', (m) => {
    const info = MODES[m]
    expect(info.pageTemplates.length).toBeGreaterThan(0)
    expect(findTemplate(info.firstPage), info.firstPage).toBeDefined()
    expect(info.name.length).toBeGreaterThan(0)
  })

  it('photobooth offers only the Booth pages; scrapbook keeps them too', () => {
    expect(MODES.photobooth.pageTemplates.every((t) => t.id.startsWith('booth-'))).toBe(true)
    expect(MODES.scrapbook.pageTemplates.some((t) => t.id.startsWith('booth-'))).toBe(true)
    expect(MODES.photobooth.ai).toBe(false)
  })
})
