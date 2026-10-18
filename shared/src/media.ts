import type { AlbumMode, BackgroundColor, BackgroundEffect, PageLayout, ReadingDirection } from './layout'

export type MediaKind = 'image' | 'video' | 'audio'
export type MediaStatus = 'uploading' | 'processing' | 'ready' | 'failed'
export type Variants = { thumb?: string; display?: string; displayAvif?: string; poster?: string; hls?: string; audio?: string; original: string }
export type MediaDTO = {
  id: string; albumId: string; kind: MediaKind; status: MediaStatus
  width: number | null; height: number | null; durationSec: number | null
  blurDataUrl: string | null; variants: Variants | null; error: string | null
  name?: string | null // the uploaded file's name (shown for music)
}
export type PageDTO = { id: string; albumId: string; position: number; layout: PageLayout }
export type AlbumDTO = { id: string; title: string; coverMediaId: string | null; backgroundEffect: BackgroundEffect; backgroundColor: BackgroundColor
  shareToken: string | null // secret share-link code; only ever sent to the owner
  musicMediaId: string | null // background music (an audio media row of this album), looped while viewing
  mode: AlbumMode; readingDirection: ReadingDirection } // fixed at creation; direction only matters for manga
// coverPage: the first page and the media in its frames, drawn as the card when no cover photo is set.
export type AlbumSummary = AlbumDTO & { coverThumb: string | null; pageCount: number; coverPage?: { layout: PageLayout; media: MediaDTO[] } | null }
export type AlbumBundle = { album: AlbumDTO; pages: PageDTO[]; media: MediaDTO[] }
