import type { AlbumMode } from './layout'
import { templates, type Template } from './templates'
import { mangaTemplates } from './mangaTemplates'

// Everything that differs between album modes, in one place: a new mode is one more entry here (plus its id in
// ALBUM_MODES). The database stores the mode as plain text, so adding one needs no migration.
//  name: shown on the album list and in New album.
//  firstPage: the page a new empty album starts with.
//  pageTemplates: what the editor's "+ page" offers (and what the AI may pick from).
//  ai: whether ✨ AI can build albums of this mode.
//  readingDirection: whether the mode asks left→right / right→left (manga).
export type ModeInfo = { name: string; firstPage: string; pageTemplates: Template[]; ai: boolean; readingDirection: boolean }

export const MODES: Record<AlbumMode, ModeInfo> = {
  scrapbook: { name: 'Scrapbook', firstPage: 'cover', pageTemplates: templates, ai: true, readingDirection: false },
  manga: { name: 'Manga', firstPage: 'manga-cover', pageTemplates: mangaTemplates, ai: true, readingDirection: true },
  photobooth: {
    name: 'Photobooth', firstPage: 'booth-strips-3', ai: false, readingDirection: false,
    pageTemplates: templates.filter((t) => t.id.startsWith('booth-')),
  },
}
