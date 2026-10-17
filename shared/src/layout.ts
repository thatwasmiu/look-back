import { z } from 'zod'

export const PAGE_ASPECT = 3 / 4

const cropSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  scale: z.number().min(1).max(5),
})

const baseShape = {
  id: z.string().min(1),
  x: z.number().min(-0.5).max(1.5),
  y: z.number().min(-0.5).max(1.5),
  w: z.number().gt(0).max(1.5),
  h: z.number().gt(0).max(1.5),
  rotation: z.number().min(-180).max(180),
  z: z.number().int().min(0),
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

export const pageElementSchema = z.discriminatedUnion('type', [frameSchema, tapeSchema, stickerSchema, textSchema])

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
export type PageElement = z.infer<typeof pageElementSchema>
export type PageLayout = z.infer<typeof pageLayoutSchema>
