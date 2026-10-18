# Manga Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second album mode, "Manga", chosen at album creation: manga page layouts (panels with black borders), manga components (bubbles, narration, sound effects, speed/focus lines, screentone, B&W ink), and a per-album reading direction (LTR/RTL).

**Architecture:** No new element *types*. A manga panel is a `frame` with `frameStyle: 'panel'` (+ `shape`, `border`, `ink`, `tone`), so photo assignment, crop, +add menu, drag/paste, media cleanup and template copying keep working unchanged. Bubbles / narration / sound effects are `text` elements with a `textStyle`; speed lines, focus lines and screentone are page `effect` kinds. Manga rendering, CSS and toolbar live in `web/src/manga/`; the scrapbook code only dispatches to it. Album gains `mode` and `readingDirection`.

**Tech Stack:** TypeScript monorepo (`shared` zod schemas, `server` Fastify + pg, `web` React 18 + Vite), Vitest, Docker dev container.

**Spec:** `docs/superpowers/specs/2026-10-18-manga-mode-design.md`

**Deliberate refinement of the spec (data model only):** the spec lists new element types (`panel`, `bubble`, `narration`, `sfx`, `lines`, `tone`). This plan encodes them as variants of existing types (above) — same behaviour, far less code, and every frame/text code path (crop, media cleanup, `withoutMedia`, cover preview, text editing, Font/Color pickers) applies for free. Separate *code* (spec decision 2) is kept: manga visuals and tools live in `web/src/manga/`.

## Global Constraints

- All tests and builds run in the dev container: `docker compose -f deploy/compose.dev.yml run --rm dev sh -c "<cmd>"` (host Node is 16).
- Album `mode`: `'scrapbook' | 'manga'`, default `'scrapbook'`, immutable after creation. `readingDirection`: `'ltr' | 'rtl'`, default `'ltr'`, changeable via PATCH.
- Tool and item names in English; warnings / confirmations / errors in Vietnamese (existing app rule).
- All art original: panels, bubbles, lines, tones, lettering drawn from scratch; nothing from any real manga.
- Fonts openly licensed, bundled via `@fontsource`, must render Vietnamese diacritics.
- Sizes inside the page use page-relative units written as `cqh`/`cqw` in CSS (compiled to `var(--cqh)` by `web/vite.config.ts`) or `calc(N * var(--cqh))` inline — never raw `cqh` in inline styles (iOS < 16 fallback).
- Existing scrapbook albums and saved layouts must parse and render exactly as before.

## Review Focus

- **Vietnamese in SFX / bubbles** ("ĐÙNG!", "Thương ♡") must show diacritics in the chosen fonts → Task 3 test asserts the font family and a VN-glyph-capable `@fontsource` subset is imported.
- **Old data**: layouts saved before this change (frames without `shape`, texts without `textStyle`) parse unchanged → Task 1 test parses a pre-change layout fixture.
- **RTL spreads with odd page counts / phone single-page** flip in the mirrored direction and never skip or repeat a page → Task 6 tests (5 pages, spread and single).
- **Deleting a photo used in a panel / copying a manga album's design** empties panels like frames → Task 2 test.
- **Rotated slanted panel in crop mode** keeps the photo inside the panel shape (clip-path on the frame window, not the element) → Task 3 renderer test checks the clip-path sits on `.frame-window`.

---

### Task 1: Shared schema + manga page layouts

**Files:**
- Modify: `shared/src/layout.ts`, `shared/src/media.ts`, `shared/src/index.ts`
- Create: `shared/src/mangaTemplates.ts`
- Test: `shared/test/layout.test.ts`, `shared/test/mangaTemplates.test.ts`

**Interfaces:**
- Produces:
  - `ALBUM_MODES = ['scrapbook','manga'] as const`, `type AlbumMode`; `READING_DIRECTIONS = ['ltr','rtl'] as const`, `type ReadingDirection` (layout.ts)
  - frame schema: `frameStyle: z.enum([...FRAME_STYLES, 'panel'])` (FRAME_STYLES itself unchanged, so the scrapbook frame picker is unchanged); optional `shape?: [number, number][]` (3–8 points, each 0..1 within the element box), `border?: 'none'|'thin'|'normal'`, `ink?: boolean`, `tone?: boolean`
  - text schema: optional `textStyle?: 'plain'|'speech'|'shout'|'thought'|'narration'|'sfx'`, optional `tail?: 'bl'|'br'|'tl'|'tr'|'none'`; font enum adds `'bangers'`
  - `PAGE_EFFECTS` adds `'speed-lines','focus-lines','screentone'`; background enum adds `'paper-white'`
  - `AlbumDTO` gains `mode: AlbumMode; readingDirection: ReadingDirection`; `albumDesignSchema` gains optional `mode`, `readingDirection`
  - `mangaTemplates: Template[]` with ids `manga-grid, manga-slants, manga-splash, manga-tall-stack, manga-columns, manga-strips, manga-diagonal, manga-six, manga-bleed` (names per spec table), every layout `background: 'paper-white'`, panels = frames `frameStyle:'panel'`, `mediaId:null`
  - `findTemplate(id: string): Template | undefined` searching `templates` then `mangaTemplates`; `instantiateTemplate` uses it (throws on unknown id as today)

- [ ] **Step 1: Write failing tests** — `layout.test.ts`: (a) a pre-change layout fixture (polaroid frame without shape, dancing-script text without textStyle) parses unchanged; (b) a frame `{frameStyle:'panel', shape:[[0,0],[1,0],[1,0.8],[0,1]], ink:true}` parses; (c) `shape` with 2 points or a coordinate 1.2 is rejected; (d) text `{textStyle:'sfx', font:'bangers'}` parses; (e) effects `speed-lines` and background `paper-white` parse. `mangaTemplates.test.ts`: every manga template parses with `pageLayoutSchema`, ids are the nine above, every element is a `panel` frame or text, every panel lies within the page (`x>=0, y>=0, x+w<=1, y+h<=1`), `instantiateTemplate('manga-slants', id)` returns fresh ids.
- [ ] **Step 2: Run** `docker compose -f deploy/compose.dev.yml run --rm dev sh -c "cd shared && npx vitest run"` — Expected: FAIL (unknown enum values / missing module).
- [ ] **Step 3: Implement** the schema additions and `mangaTemplates.ts` (geometry left to you; slants use `shape`, bleed uses `border:'none'` and the full page box; keep gutters ≈ 0.02–0.03 of page).
- [ ] **Step 4: Run** the same command — Expected: PASS; then `npm test --workspaces --if-present` in the container — Expected: server and web suites still PASS (they may need `mode`/`readingDirection` added to `AlbumDTO` fixtures: add `mode: 'scrapbook', readingDirection: 'ltr'` wherever `musicMediaId: null` appears in web/src/dev, web/src/example and web/test).
- [ ] **Step 5: Commit** `feat(shared): manga mode schema and page layouts`

### Task 2: Server — album mode, reading direction, manga pages

**Files:**
- Create: `server/src/migrations/006_manga_mode.sql`
- Modify: `server/src/albums.ts`, `server/src/pages.ts`
- Test: `server/test/albums.test.ts`, `server/test/pages.test.ts` (or wherever add-page is tested)

**Interfaces:**
- Consumes: Task 1 `ALBUM_MODES`, `READING_DIRECTIONS`, `findTemplate`, `instantiateTemplate`
- Produces: `POST /api/albums` body `{ title, mode?, readingDirection?, fromAlbumId?, design? }` → `AlbumDTO` with `mode`, `readingDirection`; first page = `manga-grid` when `mode==='manga'` (no fromAlbumId/design), `cover` otherwise. `PATCH /api/albums/:id` accepts `readingDirection` (400 for any `mode` key). `fromAlbumId` copies source `mode` and `reading_direction`; `design.mode/readingDirection` honoured. `POST /api/albums/:id/pages` accepts manga template ids. `GET /api/albums` summaries carry `mode`.

- [ ] **Step 1: Write failing tests**: create `{title:'M', mode:'manga', readingDirection:'rtl'}` → 201, DTO `mode:'manga', readingDirection:'rtl'`, its only page has frames with `frameStyle:'panel'`; plain create → `mode:'scrapbook', readingDirection:'ltr'`; PATCH `{readingDirection:'ltr'}` → 200 and changed; PATCH `{mode:'scrapbook'}` → 400; invalid `mode:'comic'` → 400; add page `templateId:'manga-six'` → 201; copy design (`fromAlbumId`) of a manga album → new album `mode:'manga'`, panels emptied (`mediaId:null`); deleting a media used in a panel → that panel's `mediaId` becomes null.
- [ ] **Step 2: Run** `docker compose -f deploy/compose.dev.yml run --rm dev sh -c "cd server && npx vitest run test/albums.test.ts"` — Expected: FAIL.
- [ ] **Step 3: Implement**: migration `alter table albums add column mode text not null default 'scrapbook', add column reading_direction text not null default 'ltr';` (+ check constraints on both); `toAlbumDTO` maps both; create/patch/copy as in Interfaces (PATCH schema `additionalProperties: false` is not used today — reject `mode` explicitly); pages.ts uses `findTemplate`.
- [ ] **Step 4: Run** server suite — Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): album mode and reading direction`

### Task 3: Manga rendering (`web/src/manga/`)

**Files:**
- Create: `web/src/manga/manga.css`, `web/src/manga/render.tsx`
- Modify: `web/src/render/FrameView.tsx` (dispatch `panel`), `web/src/render/PageRenderer.tsx` (text `textStyle` → manga text), `web/src/render/effects.tsx` (+ the three static effects), `web/src/render/render.css` (`.bg-paper-white`), `web/src/main.tsx` (Bangers latin + vietnamese css), `web/package.json` (`@fontsource/bangers`)
- Test: `web/test/MangaRender.test.tsx`

**Interfaces:**
- Produces: `PanelFrame({ el, children }: { el: FrameEl; children: ReactNode })` — wraps the existing frame window; sets `clip-path: polygon(...)` from `el.shape` on `.frame-window` (not the element), border class from `el.border`, class `ink` when `el.ink` (CSS `filter: grayscale(1) contrast(1.15)` on the photo), a `.tone` overlay when `el.tone`. `MangaText({ el }: { el: TextEl })` renders `.manga-text manga-${textStyle}` with tail class `tail-${tail}`; `fontFamily` map gains `bangers: "'Bangers', Impact, sans-serif"`. Effect classes `.fx-speed-lines`, `.fx-focus-lines`, `.fx-screentone` are static (no animation).

- [ ] **Step 1: Write failing tests**: render a page with a panel frame `{shape:[[0,0],[1,0],[1,0.8],[0,1]], ink:true, tone:true}` → `.frame-panel .frame-window` has inline `clip-path` containing `polygon(0% 0%, 100% 0%, 100% 80%, 0% 100%)`, has class `ink`, contains `.tone`; texts with each `textStyle` render class `manga-speech|manga-shout|manga-thought|manga-narration|manga-sfx` and the text content "ĐÙNG!"; an SFX with `font:'bangers'` has `font-family` starting `'Bangers'`; `textStyle` absent → existing `.text` rendering unchanged (regression); effects `speed-lines` render `.fx-speed-lines` with no `<i>` particles; `main.tsx` imports `@fontsource/bangers/vietnamese.css` (assert via `import.meta.glob` or a source read — `readFileSync('src/main.tsx')` contains it).
- [ ] **Step 2: Run** `docker compose -f deploy/compose.dev.yml run --rm dev sh -c "cd web && npx vitest run test/MangaRender.test.tsx"` — Expected: FAIL.
- [ ] **Step 3: Implement**; install `@fontsource/bangers` in the container (`npm i -w web @fontsource/bangers`) and confirm `vietnamese.css` exists in it — if it doesn't, pick another OFL display font that has a `vietnamese.css` subset and record the choice in the commit message. All visuals original: bubbles via border-radius / clip-path, shout bubble as a spiky polygon, focus lines via `repeating-conic-gradient` masked to the edges, screentone via `radial-gradient` dots, page sizes in `cqh`.
- [ ] **Step 4: Run** web suite — Expected: PASS (all existing tests too).
- [ ] **Step 5: Commit** `feat(web): manga panels, bubbles, sound effects and line/tone effects`

### Task 4: Editor in manga mode

**Files:**
- Create: `web/src/manga/MangaTools.tsx`
- Modify: `web/src/editor/Toolbar.tsx` (prop `mode`, renders `<MangaTools>` instead of the scrapbook add-buttons when manga; Tape/Sticker/Paper hidden), `web/src/pages/Editor.tsx` (pass `mode`; add-page picker lists `mangaTemplates` for manga albums; reading-direction toggle row in the Background picker via Toolbar props `readingDirection`, `setReadingDirection`), `web/src/editor/layoutOps.ts` (`newPanel()`, `newMangaText(style)`)
- Test: `web/test/EditorView.test.tsx`

**Interfaces:**
- Consumes: Task 1 types, Task 3 rendering, Task 2 PATCH `readingDirection`
- Produces: `MangaTools({ layout, selected, add, commit }: {...})` with buttons **Panel** (adds `newPanel()`), **Bubble** (picker: Speech / Shout / Thought), **Narration**, **Sound effect**, **Lines** (picker: Speed / Focus), **Tone**; with a panel selected: **Ink** and **Tone** toggles (`aria-pressed`) and **Border** (None / Thin / Normal). `newPanel(): FrameEl` (frameStyle 'panel', no shape, border 'normal'), `newMangaText(style: 'speech'|'shout'|'thought'|'narration'|'sfx'): TextEl` (sfx → font 'bangers', larger size; others 'patrick-hand').

- [ ] **Step 1: Write failing tests**: a manga bundle (`album.mode:'manga'`) shows buttons Panel, Bubble, Narration, Sound effect, Lines, Tone and **no** Tape / Sticker / Paper; a scrapbook bundle shows the old set and no Bubble (regression); Bubble → Shout adds a text element with `textStyle:'shout'` (selected, so Font/Color appear); selecting a panel and clicking Ink sets `ink:true` in the saved layout (one undo step); the add-page picker for a manga album lists "Classic grid" … "Full-bleed single panel" and not "Cover"; Background → reading direction "Right → left" calls `api.updateAlbum(id, { readingDirection: 'rtl' })`.
- [ ] **Step 2: Run** `... cd web && npx vitest run test/EditorView.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** (double-click editing already works for any `text`; crop/+add already work for any `frame`).
- [ ] **Step 4: Run** web suite — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): manga editor tools`

### Task 5: New album dialog — mode and reading direction

**Files:**
- Modify: `web/src/pages/AlbumList.tsx`, `web/src/api.ts` (`createAlbum` sends `mode`, `readingDirection`), `web/src/styles.css`
- Test: `web/test/AlbumList.test.tsx`

**Interfaces:**
- Consumes: Task 2 create API
- Produces: dialog radiogroup "Mode" with **Scrapbook** / **Manga**; when Manga: radiogroup "Reading direction" **Left → right** (default) / **Right → left**, built-in template cards hidden, "Chép thiết kế của album" lists only manga albums (scrapbook mode lists only scrapbook albums).

- [ ] **Step 1: Write failing tests**: choosing Manga + Right → left + Create posts `{ title, mode:'manga', readingDirection:'rtl' }`; in Manga mode the radios "Trip"/"2 3 con mực" are absent; copy-design list filters by mode (a scrapbook album "Trip" is not offered in Manga mode); default Scrapbook create body has no `mode` key or `mode:'scrapbook'` (either is fine — assert `mode !== 'manga'`).
- [ ] **Step 2: Run** `... npx vitest run test/AlbumList.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** web suite — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): choose Manga mode and reading direction for a new album`

### Task 6: Right-to-left viewing

**Files:**
- Modify: `web/src/viewer/useFlip.ts` (`useFlip(total, spread, rtl = false)`), `web/src/pages/Viewer.tsx` (pass `album.readingDirection === 'rtl'`; mirror `slotOf` and edge buttons)
- Test: `web/test/Viewer.test.tsx`, `web/test/spread.test.ts` (if present; else in Viewer test)

**Interfaces:**
- Produces: in RTL, physical inputs are mirrored — ArrowLeft / left edge button / swipe right ⇒ next; ArrowRight / right edge / swipe left ⇒ previous; in spreads the lower page index sits on the **right**, the cover alone on the **left**. Page order (`nextIndex`/`prevIndex`/`visiblePages`) is unchanged.

- [ ] **Step 1: Write failing tests** (5-page manga album, `readingDirection:'rtl'`): phone (single): ArrowLeft goes 1→2→…→5 and stops at 5, ArrowRight goes back to 1, never skipping; spread mode: cover shown alone, then pages [1,2] with page 1 in the right slot; LTR album behaviour unchanged (regression).
- [ ] **Step 2: Run** `... npx vitest run test/Viewer.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** web suite — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): right-to-left reading for manga albums`

### Task 7: Guide, screenshots, live check

**Files:**
- Modify: `web/src/pages/Guide.tsx` (new section "Manga": creating a manga album, layouts, components, Ink/Tone, reading direction), `web/src/dev/guide-shots.mjs` (+ `manga-editor`, `manga-new-album` shots), `web/src/dev/EditorPreview.tsx` only if needed for a manga sample
- Test: `web/test/Guide.test.tsx` (TOC/sections still consistent; heading "Manga" exists)

- [ ] **Step 1: Write failing test**: Guide has an h2 containing "Manga" and h3 "Đọc từ phải sang trái" (or the chosen reading-direction heading).
- [ ] **Step 2: Run** `... npx vitest run test/Guide.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** the section; regenerate screenshots (Vite preview + Playwright command documented at the top of `guide-shots.mjs`).
- [ ] **Step 4: Verify**: all three suites PASS; `docker compose -f deploy/compose.yml up -d --build`; in the browser create a manga album (RTL), add a "Dynamic slants" page, put a photo in a panel, add a shout bubble with "ĐÙNG!", speed lines, toggle Ink; view it and flip with ArrowLeft; open a scrapbook album and confirm it looks unchanged.
- [ ] **Step 5: Commit** `docs(guide): manga mode`
