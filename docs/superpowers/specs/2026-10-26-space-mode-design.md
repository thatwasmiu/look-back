# Space mode — design

Date: 2026-10-26. Status: built — rounds 1–3 shipped 2026-10-26 (see "Rounds" and "As built").

## Intent

Every album so far is a book of 3:4 pages. The owner wants an album that is **one space holding many photos**,
arranged freely, and seen by moving through it rather than turning pages: a long wall scrolled down, a film strip
swiped sideways, a big board panned in any direction, or photos around a globe that spins.

Example: a 3-day trip, 30 photos. "＋ Space" → "Đà Lạt 2026" → upload the 30 → **🧩 Arrange** → a wall of photos.
Friends open the link and scroll through it, tap a photo to see it big, swipe to the next.

## Goals

1. **New album mode `space`** (an entry in `shared/src/modes.ts`, a "＋ Space" button on the album list from
   `ALBUM_MODES`). A space album has exactly **one page**: no "+ page", no page strip; the server refuses a second page.
2. **Four shapes**, chosen when creating, changeable later (photos stay, the app re-arranges them):

   | Shape | Viewing | Editing |
   |---|---|---|
   | ↕ **Vertical** | a long wall, scrolled down | drag items anywhere on it; **Longer / Shorter** adds or removes a screen of length |
   | ↔ **Horizontal** | a long strip, swiped / scrolled sideways | same, sideways |
   | ✥ **Free** | a big board (default 3 × 3 page sizes), panned in any direction, pinch / wheel zoom | drag anywhere; **Bigger / Smaller** grows the board |
   | 🌐 **Sphere** | photos around a 3D globe; drag to spin, it drifts slowly on its own | **no hand placement**: pick photos and their order; the app spreads them evenly over the globe |

3. **🧩 Arrange photos** (all shapes but Sphere): puts every photo of the album that isn't on the space yet onto it in
   one go, as **Grid** (neat rows, sized to fill the shape) or **Scatter** (tilted polaroids, slightly overlapping).
   Texts, stickers and photos already placed stay. One undo step.
4. **Photo viewer (lightbox)** in all shapes: tap a photo to open it full screen, swipe ← → through all the space's
   photos in reading order (Sphere: globe order), × or swipe down to close. Videos play there.
5. Everything else keeps working on a space: all items (frames, text, stickers, tape, effects), crop, autosave,
   the two-people-saving protection, edit links (guests fill frames and add text like in a scrapbook album), Drive
   backup, offline viewing. (Photo filters, Shoot a set and Boomerang stay photobooth features.)
6. **Sharing / exporting**
   - Vertical / Horizontal: **Share to social** cuts the space into a **carousel** of pictures in the chosen size
     (4:5, 9:16, 3:4), in order — one post with several slides. Optionally one long picture (Download only).
   - Free: one picture of the whole board (the chosen size, board centred).
   - Sphere: a short **video of the globe spinning** (same recorder as the slideshow).
   - **PDF**: Vertical / Horizontal print one screen of length per sheet; Free prints the board on one sheet; Sphere
     prints its photos as a grid.

## Non-goals

- More than one space (page) per album; a book of spaces.
- Several shapes in one album; mixing pages and a space.
- Hand placement on the sphere; 3D shapes other than the sphere (cylinder, cube…) — later if wanted.
- AI building spaces.
- Infinite canvas (the size is set and changed with Longer / Bigger).

## Anti-goals (failure even if it "works")

- Text, borders and stickers growing with the length of the space (a 6-screen wall must not have 6× bigger words).
- Existing scrapbook / manga / photobooth pages changing in any way (layout, print, export) because of this.
- The sphere stuttering on phones, or the viewer loading every photo in full size at once (30+ photos).
- A space that only works on new iPhones (iOS 15 must render it — the container-units polyfill path).
- Photos lost or jumbled when the shape changes.

## How it works (decided)

### Data

- `albums.mode = 'space'` (no migration: modes are plain text since 011).
- The one page's layout gets `space: { shape: 'vertical' | 'horizontal' | 'free' | 'sphere', cols: number, rows: number }`
  — the space's size in **tiles**, a tile being one 3:4 page. Vertical: `cols = 1, rows ≥ 2`; Horizontal:
  `rows = 1, cols ≥ 2`; Free: `cols, rows ≥ 2`; Sphere: `cols = rows = 1` (size unused). Limits: at most 30 tiles.
- **Element geometry in tile units** when `space` is set: `x, w` in tile widths (0…cols), `y, h` in tile heights
  (0…rows). A page without `space` is unchanged (fractions of the page, 0…1). The schema checks bounds against
  `cols / rows` (a `superRefine` on the layout), so normal pages keep their current limits.
- Element sizes that are "of the page" (text `size`, borders, shadows, sticker detail) mean **of one tile**: they stay
  the same on a 1-tile page and on a 20-tile wall.
- Sphere order: the frames' order in `elements` (their x / y are ignored); Arrange / reorder edits that order.

### Rendering

- `PageRenderer` sizes the page box to `cols × rows` tiles (`aspect-ratio: 3·cols / 4·rows`) and positions elements
  at `x / cols`, `y / rows` percentages.
- Tile-relative units for free: every `cqw / cqh` in the CSS already compiles to `var(--cqw) / var(--cqh)`
  (vite `cq-vars`, `textCss`). A space page sets `--cqw: calc(1cqw / cols); --cqh: calc(1cqh / rows)`, so every
  size inside resolves against one tile. The iOS < 16 polyfill divides its px values by cols / rows (read from
  `data-cols / data-rows` on the page).
- Viewer: Vertical / Horizontal / Free show the space in a scrollable stage (native scroll, `scroll-snap` off),
  tile width = the screen's width (Vertical), height (Horizontal) or a fit-to-screen tile for Free, with pinch /
  wheel zoom (1–4×) on Free. Photos load lazily (only near the visible area) — `loading="lazy"` / an
  IntersectionObserver on frames.
- Sphere: its own viewer component. Photos on a Fibonacci sphere (even spread for any count), CSS 3D transforms
  (`perspective`, `rotateY/rotateX` per photo, billboards facing out), thumbnails (`thumb` variant) on the globe and
  the display size in the lightbox; drag to spin with inertia, slow idle spin, reduced motion respected.

### Editing

- The editor's stage scrolls (Vertical: down; Horizontal: sideways; Free: both) instead of fitting one page; zoom
  stays. Moveable, snapping, crop, text editing work unchanged on the bigger box (geometry converts through cols /
  rows in one place: the canvas ↔ layout mapping).
- Toolbar for space albums: **Shape**, **Longer / Shorter** (or **Bigger / Smaller**), **🧩 Arrange** (Grid /
  Scatter). Shorter / Smaller never cuts off items (it stops at the last item's edge).
- Changing shape: frames are laid out again in their current order (Grid for Vertical / Horizontal / Free, globe for
  Sphere); texts and stickers keep their order and are placed after the photos (Grid) — the owner can move them back.
- Sphere editing: the page area shows the globe preview; under it the photos in order, each with ◀ ▶ (move) and
  ✕ (take off). Photos come on with **＋ Add photos** (new uploads) or 🧩 → **Add the album's photos**.
- **＋ Add photos** (below the space, owner only): one multi-file pick, placed as one Grid batch after what is there.

### Server

- `POST /api/albums/:id/pages` refuses (400) when the album's mode has `maxPages` reached (`MODES.space.maxPages = 1`).
- Page validation as above (bounds from `space`); a guest's save keeps `space` unchanged (part of the structure).
- New album in mode `space` starts with an empty Vertical space of 3 tiles (`firstPage` = a template with `space`).

### Modes table additions

`ModeInfo` gets `maxPages: number | null` (null = no limit) and `space: boolean`; `MODES.space`:
`{ name: 'Space', maxPages: 1, space: true, ai: false, readingDirection: false, photoFilters: false, shootFirst: false,
boomerang: false, guestSets: false }`.

## Rounds

1. **Vertical + Horizontal**: data model, tile units, renderer, scrolling viewer + lightbox, editor scrolling,
   Longer / Shorter, Arrange (Grid / Scatter), carousel export, PDF, album list button, guide.
2. **Free**: two-way scrolling, zoom in the viewer, Bigger / Smaller, export of the whole board.
3. **Sphere**: the 3D globe viewer, ordering UI, spinning-globe video.

Each round is pushed for the owner to try on a phone before the next.

## As built (differences from the plan above)

- Changing shape keeps every item where it was within its tile (tile k maps across shapes), instead of laying
  frames out again; only switching to / from **Sphere** relays photos (to the globe in reading order / back as a Grid
  on a fresh 3-tile space; empty frames are dropped going to a sphere).
- Sphere reordering is ◀ ▶ buttons, not drag. The globe is 1 × 1; its frames' boxes sit inside the tile (unused).
- Free boards are n × n tiles (2–5), so a whole board stays 3:4 and shares / prints as one picture / sheet.
- Share for a sphere draws the globe on a canvas: a still picture, or an 8 s turn as a video (with the music).
- Added later: **＋ Add photos** for spaces (see Editing).

## Left to the builder

- Exact tile counts at creation, Grid / Scatter geometry (gaps, tilt range), Scatter randomness (seeded, so
  Arrange twice gives the same picture).
- Lightbox gestures and animation; lazy-loading thresholds.
- How the editor shows tile boundaries (faint guides, useful for the carousel cuts).
- Sphere radius / photo size for small and large counts (5 vs 60 photos).

## Calls I made (owner, please check)

- **One page only**, size set in tiles and changed with Longer / Bigger — not an infinite canvas.
- **Sphere is arranged by the app** (order only), and is the last round.
- Vertical / Horizontal export as a **carousel** of slides by default (Instagram / Facebook take up to 10–20);
  a single very long picture only via Download.
- Filters, Shoot-a-set, Boomerang stay photobooth features; not in Space for now.
- Texts and stickers in a space are sized per tile (they don't grow with the space).
