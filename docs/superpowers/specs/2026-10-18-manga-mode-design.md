# Manga mode — design

## Intent

Today every Look Back album is a scrapbook: paper, polaroid frames, tape, stickers. The owner wants a second
**album mode, "Manga"**: pages laid out like a manga page — photos in panels with thick black borders and white
gutters — decorated with manga components (speech / shout / thought bubbles, narration boxes, sound-effect
lettering, speed lines, focus lines, screentone). It is chosen once, when the album is created.

Mockups the owner reacted to (visual companion, 2026-10-18): they liked the **Dynamic slants** layout and wanted
**all eight components**; then asked for **every layout type to be offered** when adding a page.

## Decisions made by the owner

1. **Manga is an album mode** picked in the New album dialog (Scrapbook | Manga). Not per page, no mixing.
2. **Separate code**: manga lives in its own modules; scrapbook code paths stay as they are. Shared infrastructure
   (uploads, photos tray, pages strip, autosave, undo/redo, zoom, crop, pin, duplicate, copy/paste, share links,
   music, viewer flipping) is reused, not duplicated.
3. **All page layouts are offered** when adding a manga page (list below), like scrapbook page templates today.
4. **All eight components**: speech bubble, shout bubble, thought bubble, narration box, sound-effect text,
   speed lines, focus lines, screentone (incl. a black-and-white "ink" look for photos).
5. **Reading direction is the user's choice per manga album**: left-to-right or right-to-left (Japanese style).
   Chosen in the New album dialog when Manga is picked, changeable later in the album's settings.

## Calls made by Claude (owner may override)

- Mode is **fixed after creation** (no converting albums between modes). Default reading direction: left-to-right.
- Photos in panels keep their **colors by default**; "B&W ink" is a per-panel toggle (grayscale + contrast), with
  optional screentone overlay.
- Manga page background: plain white/newsprint paper; panels have thick black borders.
- The manga toolbar shows manga tools and **hides Tape, Sticker, Paper**. Text, Effect (page effects) and
  Background (desk color, album effect, music) stay.
- **No built-in manga album templates** in v1 (the New album "Template" cards are for scrapbook). A plain manga album
  starts with one page in the "Classic grid" layout. Manga templates can come later.
- "Copy the design of an album" copies the source album's mode and reading direction along with its pages.

## Goals

- Create a manga album; add pages from all manga layouts; put photos/videos in panels exactly as into frames today
  (+ add menu, drag from Photos, paste, crop with Size/Fit/Fill).
- Add, edit, move, resize, rotate, pin, duplicate, delete every component; bubble / narration / SFX text is typed by
  the user (Vietnamese diacritics must render correctly).
- View and share manga albums like any album; flip direction follows the album's reading direction (arrow keys,
  swipe, edge buttons, and two-page spreads all mirror for right-to-left).
- Works on phone and laptop, including the iOS < 16 container-unit fallback already in place (`var(--cqh)` units).

## Non-goals (v1)

- Converting existing scrapbook albums to manga, or mixing manga and scrapbook pages.
- Built-in manga album templates (with captions/stickers), AI "manga-ify" photo filters, drawing / pen tools.
- Showing scrapbook-only tools in manga albums.

## Anti-goals

- Any regression in scrapbook albums (rendering, editor, saved data).
- Copying real manga: every panel shape, bubble, line, tone and lettering is drawn from scratch in a generic style.
  No characters, panels or pages from any existing manga.

## Page layouts (manga page templates)

Each is a set of **panels** (photo slots) on a white page; every panel can afterwards be moved, resized, rotated.

| id | Name | Shape |
|----|------|-------|
| `manga-grid` | Classic grid | wide / two half / wide rows |
| `manga-slants` | Dynamic slants | angled gutters between panels |
| `manga-splash` | Splash + insets | one full-page panel, two small inset panels on top |
| `manga-tall-stack` | Tall + stacked | one tall panel beside two stacked |
| `manga-columns` | Two tall columns | |
| `manga-strips` | Three horizontal strips | |
| `manga-diagonal` | Diagonal split | one slash across the page |
| `manga-six` | Six-panel grid | 2 × 3 |
| `manga-bleed` | Full-bleed single panel | no border, edge to edge |

## Data model

- `albums`: add `mode text not null default 'scrapbook'` (`'scrapbook' | 'manga'`) and
  `reading_direction text not null default 'ltr'` (`'ltr' | 'rtl'`). DTOs (`AlbumDTO`, `AlbumSummary`) gain
  `mode` and `readingDirection`. `POST /api/albums` accepts `mode` and `readingDirection`; `PATCH` accepts
  `readingDirection` only (mode is immutable). The `design` path (built-in templates) and `fromAlbumId` path keep
  working; `fromAlbumId` copies mode and direction.
- New page background `paper-white`.
- New page element types in the shared zod union (same geometry fields as today: x, y, w, h, rotation, z, pinned):
  - `panel`: like `frame` (`mediaId`, `crop`) plus `shape` (polygon points, page-relative 0..1 within its box, so
    slanted panels are possible), `border` (thin | normal | none), `ink` (boolean B&W filter), `tone` (boolean).
  - `bubble`: `kind` (speech | shout | thought), `text`, `tail` (direction/position of the tail), `font size`.
  - `narration`: `text`.
  - `sfx`: `text`, `color`, outline.
  - `lines`: `kind` (speed | focus), `angle` (speed lines).
  - `tone`: screentone overlay (dot density).
- Server validation stays mode-agnostic (any element type is valid in any album); the editor decides what to offer.
- Media cleanup that empties frames on delete must also empty `panel.mediaId`; template copy (`withoutMedia`) must
  empty panels too. Album card cover preview (first page) must render panels.

## Code organisation ("separate code")

- `shared/src/mangaTemplates.ts`: the manga page layouts (own list, own `instantiate…`), separate from `templates.ts`.
  `POST /api/albums/:id/pages` accepts ids from either list.
- `web/src/manga/`: manga render components (PanelView, Bubble, Narration, Sfx, Lines, Tone), `manga.css`, the manga
  toolbar and pickers, manga layout picker. `PageRenderer` delegates the manga element types to this module.
- `EditCanvas` (selection, Moveable, crop overlay, text editing) is reused; panels behave like frames for photos and
  crop; bubble / narration / sfx behave like text for double-click editing.
- Editor chooses toolbar + page-template list by `album.mode`.
- Viewer `useFlip` / spread logic take the reading direction.

## UI

- New album dialog: a **Scrapbook | Manga** switch at the top. Manga shows a **Reading direction** choice
  (Left → right / Right → left) and hides scrapbook templates; "copy the design of" lists albums of the chosen mode.
- Album settings for a manga album (in the editor's Background picker): reading direction toggle.
- Manga toolbar: Panel (layout picker for a new panel shape), Bubble (speech / shout / thought), Narration,
  Sound effect, Lines (speed / focus), Tone, Text, Effect, Background; plus the shared row (layer ↑↓, delete, pin,
  duplicate, undo/redo, zoom). Selecting a panel shows Crop, Remove photo, **Ink** (B&W) toggle, **Tone** toggle,
  Border.
- Wording follows the app's rule: tool and item names in English, warnings / confirmations / errors in Vietnamese.
- Usage guide (/guide) gains a "Manga" section with screenshots (regenerate via `web/src/dev/guide-shots.mjs`).

## Constraints

- All art original (see anti-goals). Fonts must be openly licensed and support Vietnamese (bundled via @fontsource
  like the existing fonts).
- Keep using page-relative geometry and `var(--cqh)` / compiled cq units so the iOS < 16 fallback keeps working.
- Migration is additive; existing albums become `mode='scrapbook', reading_direction='ltr'`.
- Tests alongside the existing suites (server: create/patch/copy with mode; web: renderer for each new element,
  editor toolbar per mode, viewer RTL flipping, New album dialog).

## Left to the builder

- Exact panel geometry of each layout, bubble/tail drawing, SFX lettering style, tone pattern, CSS details.
- Choice of fonts (within the constraints), component default sizes, toolbar ordering details.
- Whether `tone` is its own element or only a panel toggle (both described above; one is enough if it keeps the UI
  simpler).

## Built since

- 8 more manga layouts (4-koma, five with slants, big panel + insets, dialogue, action slashes, flashback, chapter
  opener, ending) — 18 in all; each has AI text slots (`MANGA_AI`), narration boxes two lines tall.
- Manga tools moved into the toolbar's **＋ Add** list (Panel, Bubble, Narration, Sound effect, Lines, Screentone);
  panel and tail tools show in the selected-item row.
- Editing a bubble/narration keeps its drawn shape while typing; tapping away keeps the new words.
- Panel shape edits are kept however shape mode is left.
- Edit-link guests can't add, delete, move or reshape panels (they can fill them and letter everything).
