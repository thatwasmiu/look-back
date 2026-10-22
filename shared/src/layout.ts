import { z } from 'zod'

export const PAGE_ASPECT = 3 / 4

const cropSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  scale: z.number().min(0.25).max(5), // < 1: photo smaller than the frame (paper shows around it)
  // Free shift on top of x/y, as a fraction of the frame's width / height (crop mode drags with it, past the edges too).
  ox: z.number().min(-1).max(1).optional(),
  oy: z.number().min(-1).max(1).optional(),
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

// Album modes: scrapbook (the original) or manga. Manga albums can read right-to-left.
export const ALBUM_MODES = ['scrapbook', 'manga'] as const
export type AlbumMode = (typeof ALBUM_MODES)[number]
export const READING_DIRECTIONS = ['ltr', 'rtl'] as const
export type ReadingDirection = (typeof READING_DIRECTIONS)[number]

const unit = z.number().min(0).max(1)
const frameSchema = z.object({
  ...baseShape,
  type: z.literal('frame'),
  // 'panel' is a manga panel; it isn't in FRAME_STYLES, so the scrapbook frame picker never offers it.
  frameStyle: z.enum([...FRAME_STYLES, 'panel']),
  mediaId: z.string().nullable(),
  crop: cropSchema,
  // Manga panels only: polygon within the element box (0..1), border weight, B&W "ink" photo, screentone overlay.
  shape: z.array(z.tuple([unit, unit])).min(3).max(8).optional(),
  border: z.enum(['none', 'thin', 'normal']).optional(),
  ink: z.boolean().optional(),
  tone: z.boolean().optional(),
  // Video: play only this part (seconds). Non-destructive — the file itself is untouched.
  trim: z.object({ start: z.number().min(0), end: z.number().positive() }).refine((t) => t.start < t.end, 'trim start must be before its end').optional(),
})
// Page effects play inside their own box; album background effects play behind the whole book.
export const PAGE_EFFECTS = ['sparkles', 'hearts', 'petals', 'confetti', 'bokeh', 'light-leak', 'bubbles'] as const
// Manga overlays: static (not animated), offered only in manga albums.
export const MANGA_EFFECTS = ['speed-lines', 'focus-lines', 'screentone'] as const
export const BACKGROUND_EFFECTS = ['none', 'snow', 'petals', 'fireflies', 'stars', 'rain', 'bubbles'] as const
export type BackgroundEffect = (typeof BACKGROUND_EFFECTS)[number]
// Desk color behind the album (viewer and editor). 'walnut' is the original brown.
export const BACKGROUND_COLORS = ['walnut', 'espresso', 'sage', 'rose', 'ocean', 'plum', 'slate', 'night', 'terracotta'] as const
export type BackgroundColor = (typeof BACKGROUND_COLORS)[number]

const effectSchema = z.object({ ...baseShape, type: z.literal('effect'), effect: z.enum([...PAGE_EFFECTS, ...MANGA_EFFECTS]) })
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
  font: z.enum(['dancing-script', 'patrick-hand', 'bangers']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  size: z.number().gt(0), // fraction of page height
  // Manga: speech / shout / thought bubble, narration box, sound-effect lettering ('plain' = ordinary text).
  textStyle: z.enum(['plain', 'speech', 'shout', 'thought', 'narration', 'sfx']).optional(),
  tail: z.enum(['bl', 'br', 'tl', 'tr', 'none']).optional(), // bubble tail corner
  align: z.enum(['left', 'center', 'right']).optional(),
  lineHeight: z.number().min(0.6).max(3).optional(), // line spacing, × font size
  outline: z.boolean().optional(), // contrasting stroke around the letters
})

export const pageElementSchema = z.discriminatedUnion('type', [frameSchema, tapeSchema, stickerSchema, textSchema, effectSchema])

export const pageLayoutSchema = z.object({
  background: z.enum(['paper-cream', 'paper-kraft', 'paper-grid', 'paper-dots', 'paper-white']),
  elements: z.array(pageElementSchema).max(200),
  hidden: z.boolean().optional(), // kept in the editor, left out of the viewer, share links and print
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
  mode: z.enum(ALBUM_MODES).optional(),
  readingDirection: z.enum(READING_DIRECTIONS).optional(),
})
export type AlbumDesign = z.infer<typeof albumDesignSchema>
