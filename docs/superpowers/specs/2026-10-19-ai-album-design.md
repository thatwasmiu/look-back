# AI album from a description — design

Date: 2026-10-19. Status: built (approved). See "Built since" at the end.

## Intent

Starting an album means picking page layouts one by one and writing every caption, bubble and narration line by
hand. The owner wants to type a short idea ("1 ngày đi làm: đi đường, thang máy, chấm vân tay, họp, về nhà") and get a
ready album skeleton: pages chosen, text written, stickers placed, frames empty for their own photos/videos. Model:
Google Gemini Flash on the free tier.

Alongside it, the app gets more built-in page templates (handmade, part of the code — not AI-made), so both the AI
and people picking "+ page" in the editor have more variety.

## Goals

1. **Gemini key in /manage.** New section "AI (Gemini)": paste an API key, Save, Remove, Test. Stored encrypted
   (same `encryptSecret`/`decryptSecret` as bucket secrets), never returned — the UI only shows "Đã có key ••••abcd"
   (last 4 chars). Test makes one tiny Gemini call and shows ok / the error.
2. **✨ AI card in "New album".** In both modes (Scrapbook and Manga) the Template row gets a "✨ AI" card. Choosing it
   shows a textarea, max **200 characters**, with a live counter. Create → server generates → album opens in the
   editor like any new album. Manga keeps the chosen reading direction.
   - No key saved: the card still shows but is disabled, with a note "Thêm Gemini key trong /manage".
   - While generating: button shows a busy state ("AI đang dựng album…"); takes a few seconds.
3. **What the AI decides:** 4–10 pages (its choice from the description), each page = one existing built-in page
   template of that mode; text for that template's text slots (title, captions / speech, thought, shout, narration,
   sfx); stickers from the app's sticker set; album background color and background effect from the allowed lists.
   Text is written in the language of the description.
4. **Frames stay empty.** No images are generated or fetched.
5. **Safe output.** The server builds the album from the AI's answer only through known pieces (template ids,
   slot indexes, sticker ids, enum colors/effects) and validates the result with `albumDesignSchema` before creating
   it, through the same path as `POST /api/albums { design }`. A bad or unusable answer → a clear Vietnamese error,
   no album created.
6. **More built-in templates:** about 8 new scrapbook and 8 new manga page templates (see below), available in the
   editor's "+ page" picker and to the AI.

## Non-goals

- AI-generated images, AI-invented layouts/coordinates, AI editing an existing album, regenerating single pages.
- Choosing the page count manually.
- Other AI providers or paid models. Usage limits / quotas UI.
- Streaming / progress per page.

## Anti-goals (failure even if it "works")

- The key leaks: returned by any API, put in a URL visible to the browser, logged, or included in backups in plain
  text.
- A generated album with overlapping/off-page elements or broken pages — the AI must never control coordinates.
- Hanging forever: generation has a timeout (≈60 s) and the user can keep using the dialog.
- Shipping copyrighted characters or song lyrics in templates or prompt examples.

## How it works (decided)

### Text and sticker slots on templates

Templates today contain placeholder text elements (e.g. "Tiêu đề") at fixed boxes, and the manga album templates in
`web/src/example/albumTemplates.ts` add bubbles at boxes aligned with panels. To let the AI fill text without placing
it, each page template carries **slots**: the text elements already in its layout, plus optional extra slot boxes
(bubble / narration / sfx boxes aligned with its panels, sticker spots). The AI answers per page with
`{ template, texts: string[], stickers: string[] }` — texts fill the template's text slots in order (missing →
the slot is removed, never left as a placeholder; extra → ignored), stickers fill sticker spots in order.
Each text slot declares its `textStyle` and a max length so the AI knows what goes where (title ≤ 30 chars, bubble
≤ 60, sfx ≤ 12 etc. — builder picks the numbers). Too-long text is cut on the server.

### Gemini call

- Server-side only (`POST /api/ai/album`, owner session required). Body `{ prompt (≤200), mode, readingDirection,
  title? }`. The server reads the key, calls Gemini `generateContent` over plain `fetch` (no SDK, like `drive.ts`),
  with `responseMimeType: application/json` and a `responseSchema` describing
  `{ title, backgroundColor, backgroundEffect, pages: [{ template, texts, stickers }] }` with enums for template ids,
  sticker ids, colors and effects.
- The prompt sent to Gemini lists, for the chosen mode, every template: id, a one-line description of what the page
  is good for, panel/frame count, and its slots (style + max length). Plus sticker ids with a short word each.
- Model name: a setting in /manage next to the key, default the current free Flash model; builder checks the current
  name at implementation time. *Built:* `gemini-3.8-flash` (`gemini-2.5-flash` is closed to new users); a real run
  with the owner's key made a 5-page manga in ~20 s.
- *Built:* keys may be the classic `AIza…` or the newer AI Studio `AQ.…` form (contains a dot); both are accepted.
- Errors map to Vietnamese messages: no key, invalid key (401/403), free quota exhausted (429: "Hết lượt miễn phí,
  thử lại sau"), timeout, unusable answer.
- Album title: the user's title field if filled, otherwise the AI's `title`.
- The response creates the album server-side (same code as `design` creation, refactored into a shared function)
  and returns the album, so the web just navigates to it. *Built:* instead of a refactor, the route hands the design
  to `POST /api/albums` in-process (`app.inject` with the owner's cookie) — one create path.
- *Built after review:* Gemini timeout 45 s with nginx `/api/ai/` at 90 s (no 504 for an album that is then created),
  text cut by characters (an emoji is never split), unknown model → its own message, the New album dialog can't be
  closed while generating.

### Storage

New single-row table (or a `settings` key/value table if simpler) holding `gemini_key_enc`, `gemini_model`.
Backups: the table is left out of backups, like `drive_backup` (after a restore the key is entered again).

### New built-in page templates

Scrapbook (≈8): six small photos grid, round "sticker" photos, photobooth strip of 3, one big photo with a note
card, overlapping tilted pair, journey/map page (path of small frames), big quote + one photo, closing "The End"
page.

Manga (≈8): 4-koma vertical strip, 5-panel with diagonals, big panel with 2 inset panels, two-column dialogue page,
action page with strongly slanted panels, round flashback panel, chapter opener with title box, closing page.

All original; panel geometry follows `mangaTemplates.ts` conventions (margin 0.04, gutter 0.025, 3:4 page). Each
gets a name and the AI description line. They must render correctly in the template picker preview, editor and
viewer, and print/PDF.

## Constraints

- Monorepo `shared` / `server` / `web`; tests in Docker via vitest (existing pattern). Fake Gemini server in tests
  (like `fakeGoogle.ts`); no real network in tests.
- Sticker ids live in `web/src/render/decor.tsx`; the server needs the id list → move the list (ids + one-word
  description) into `shared`, the drawings stay in web.
- /manage UI is lazy-loaded; the AI card code in New album stays small (no heavy deps).
- PWA/service worker: `/api/ai/*` is a POST → not cached already; nothing to change.

## Left to the builder

- Exact slot max lengths, prompt wording, the per-template description lines.
- Exact geometry of the new templates.
- Whether settings live in a new table or a generic key/value table.
- Refactor shape for sharing "create album from design" between the two routes.
- Gemini default model name (latest free Flash at build time).

## Calls I made (owner, please check)

- Key entered in /manage (owner said so); **model name editable in /manage too** — my call, so a renamed/retired model
  doesn't need a deploy.
- AI card visible-but-disabled without a key (rather than hidden) — my call, so the feature is discoverable.
- Text in the description's language — my call.
- Unfilled slots are removed rather than left as "Tiêu đề" — my call.
- Album title: user's title wins, else AI's — my call.
- ~8 new templates per mode — my call on count and on the list above.

## Built since

- Manga narration slots are two lines tall (text up to 40 characters no longer overflows).
- Gemini answers are read from all non-thought text parts; `AQ.…` keys accepted; 503 shown as "busy".
- The web UI around it (✨ AI card, /manage section) is translated (Vietnamese/English); server messages stay Vietnamese.
- Owner preference recorded: content can also be written by hand instead of Gemini (the AI is optional).
