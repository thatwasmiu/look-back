import { z } from 'zod'

export const PAGE_ASPECT = 3 / 4

const cropSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  scale: z.number().min(0.25).max(5), // < 1: photo smaller than the frame (paper shows around it)
})

const baseShape = {
  id: z.string().min(1),
  x: z.number().min(-0.5).max(1.5),
  y: z.number().min(-0.5).max(1.5),
  w: z.number().gt(0).max(1.5),
  h: z.number().gt(0).max(1.5),
  rotation: z.number().min(-180).max(180),
  z: z.number().int().min(0),
  pinned: z.boolean().optional(), // locked in place: no drag / resize / rotate / nudge until unpinned
}

// Picker order. 'plain' is shown as "Thin white".
export const FRAME_STYLES = [
  'polaroid', 'instant-mini', 'plain', 'rounded', 'corners', 'stamp', 'film', 'scallop',
  'kraft-mat', 'double-line', 'doodle', 'torn', 'circle', 'heart',
] as const

const frameSchema = z.object({
  ...baseShape,
  type: z.literal('frame'),
  frameStyle: z.enum(FRAME_STYLES),
  mediaId: z.string().nullable(),
  crop: cropSchema,
})
// Page effects play inside their own box; album background effects play behind the whole book.
export const PAGE_EFFECTS = ['sparkles', 'hearts', 'petals', 'confetti', 'bokeh', 'light-leak', 'bubbles'] as const
export const BACKGROUND_EFFECTS = ['none', 'snow', 'petals', 'fireflies', 'stars', 'rain', 'bubbles'] as const
export type BackgroundEffect = (typeof BACKGROUND_EFFECTS)[number]
// Desk color behind the album (viewer and editor). 'walnut' is the original brown.
export const BACKGROUND_COLORS = ['walnut', 'espresso', 'sage', 'rose', 'ocean', 'plum', 'slate', 'night', 'terracotta'] as const
export type BackgroundColor = (typeof BACKGROUND_COLORS)[number]

const effectSchema = z.object({ ...baseShape, type: z.literal('effect'), effect: z.enum(PAGE_EFFECTS) })
const tapeSchema = z.object({
  ...baseShape,
  type: z.literal('tape'),
  tapeStyle: z.enum(['yellow', 'pink', 'mint', 'kraft']),
})
const stickerSchema = z.object({ ...baseShape, type: z.literal('sticker'), stickerId: z.string().min(1) })
const textSchema = z.object({
  ...baseShape,
  type: z.literal('text'),
  text: z.string().max(500),
  font: z.enum(['dancing-script', 'patrick-hand']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  size: z.number().gt(0), // fraction of page height
})

export const pageElementSchema = z.discriminatedUnion('type', [frameSchema, tapeSchema, stickerSchema, textSchema, effectSchema])

export const pageLayoutSchema = z.object({
  background: z.enum(['paper-cream', 'paper-kraft', 'paper-grid', 'paper-dots']),
  elements: z.array(pageElementSchema).max(200),
}).superRefine((l, ctx) => {
  const seen = new Set<string>()
  for (const [i, e] of l.elements.entries()) {
    if (seen.has(e.id)) ctx.addIssue({ code: 'custom', path: ['elements', i, 'id'], message: 'duplicate element id' })
    seen.add(e.id)
  }
})

export type Crop = z.infer<typeof cropSchema>
export type FrameEl = z.infer<typeof frameSchema>
export type TapeEl = z.infer<typeof tapeSchema>
export type StickerEl = z.infer<typeof stickerSchema>
export type TextEl = z.infer<typeof textSchema>
export type EffectEl = z.infer<typeof effectSchema>
export type PageElement = z.infer<typeof pageElementSchema>
export type PageLayout = z.infer<typeof pageLayoutSchema>

// A whole album's look: what "New album → Start from" a built-in template sends (frames are emptied server-side).
export const albumDesignSchema = z.object({
  backgroundEffect: z.enum(BACKGROUND_EFFECTS),
  backgroundColor: z.enum(BACKGROUND_COLORS),
  pages: z.array(pageLayoutSchema).min(1).max(100),
  music: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(), // name of a server-side template track (TEMPLATE_MUSIC_DIR)
})
export type AlbumDesign = z.infer<typeof albumDesignSchema>
