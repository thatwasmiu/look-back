import type { PageLayout } from './layout'

export type MediaKind = 'image' | 'video'
export type MediaStatus = 'uploading' | 'processing' | 'ready' | 'failed'
export type Variants = { thumb?: string; display?: string; displayAvif?: string; poster?: string; hls?: string; original: string }
export type MediaDTO = {
  id: string; albumId: string; kind: MediaKind; status: MediaStatus
  width: number | null; height: number | null; durationSec: number | null
  blurDataUrl: string | null; variants: Variants | null; error: string | null
}
export type PageDTO = { id: string; albumId: string; position: number; layout: PageLayout }
export type AlbumDTO = { id: string; title: string; coverMediaId: string | null }
export type AlbumSummary = AlbumDTO & { coverThumb: string | null; pageCount: number }
export type AlbumBundle = { album: AlbumDTO; pages: PageDTO[]; media: MediaDTO[] }
