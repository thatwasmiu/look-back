# Scrapbook Album — Design

Date: 2026-10-17
Status: built. Later changes are listed at the end ("Built since").

## 1. Intent

A personal web app for keeping photos and videos as **scrapbook albums**.
The owner is the only user. Two modes:

- **Decorate mode**: build album pages on a free canvas. Templates pre-place
  frames, the owner drops photos/videos into them, then moves, resizes,
  rotates and decorates (tape, stickers, handwritten text).
- **View mode**: flip through the finished album like a book.

**Why it exists:** an album that feels hand-made and personal, not a grid
of thumbnails, that still opens fast even when it holds large phone videos.

## 2. Goals

1. Pages look **beautiful**: scrapbook style, deliberate placement.
2. Albums load **fast** in view mode, including pages with video.
3. Uploading large files (5-min phone video, ~0.5–2 GB) is reliable.
4. Layouts look identical on laptop and phone.
5. Can move media storage from the VPS to AWS later with a config change.

## 3. Non-goals

- Multiple users, sign-up, sharing, comments, permissions.
- Photo editing (crop filters, color correction) beyond placing in a frame.
- Native mobile apps.
- Search, tags, face recognition, AI features.
- Offline mode.

## 4. Anti-goals (would be failure even if it "works")

- **Ugly or clumsy placement.** Owner's top worry. Templates that look like
  plain boxes on a white page, misaligned frames, cheap-looking stickers.
- A flip shows empty/grey frames waiting for images.
- Video makes you wait for a full download before playing.
- A failed network blip forces re-uploading a 2 GB video from zero.

## 5. Scale assumptions

- Per album: ~50 photos, a few videos of ~5 min each.
- Album size on disk ≈ 2–5 GB including originals.
- Single owner, low traffic. Bottlenecks are bandwidth and encoding CPU,
  not request volume.

## 6. Decided by owner

| Topic | Decision |
|---|---|
| Users | Personal, single owner |
| Modes | View mode + decorate mode |
| Canvas style | Free canvas: template pre-places frames, owner can drag/resize/rotate, add text and stickers |
| Visual style | **Scrapbook**: paper texture, polaroid frames, washi tape, slight tilt, handwritten fonts, stickers |
| Navigation in view mode | **Flip pages** like a book |
| Background loading | Required for images and video (see §9) |
| Page shape | **Portrait single page** (builder's call: 3:4). Laptop shows two pages side by side as a book spread; each page designed alone. Phone shows one page |
| Decorate on | **Laptop and phone**: editor must work with mouse and touch |
| VPS | **Small: 1–2 CPU, 2–4 GB RAM** |
| Hosting | Own VPS now; may move to AWS later if slow |
| Languages known | Java, Node.js |

## 7. Builder's calls (made in conversation, owner did not object; still open to change)

| Topic | Choice | Reason |
|---|---|---|
| Backend | Node.js (TypeScript) | `sharp` (libvips) is the fastest, simplest image pipeline; owner knows Node |
| Image processing | `sharp` | |
| Video processing | `ffmpeg` (CLI, via child process) | |
| Database | PostgreSQL | albums, pages, layout JSON, media records |
| Frontend | React (TypeScript) | canvas editor + flip viewer |
| Media serving | nginx serves media files directly from disk | app never streams media bytes |
| Large uploads | tus protocol (Uppy in browser, tus server in Node) | resumable chunked upload |
| Auth | Single owner login, password hash in config, session cookie | public server needs a lock; no sign-up |
| Deploy | Docker Compose on the VPS | |
| Speed-up before AWS | Cloudflare free plan in front of VPS | caches media near the viewer |

## 8. Architecture

```
Browser (React)
  ├─ API calls  ──────────► Node API ──► PostgreSQL
  ├─ tus upload ──────────► Node tus server ──► disk: uploads/tmp
  │                              └─► job queue ──► worker (sharp / ffmpeg) ──► disk: media/
  └─ media GET  ──────────► nginx ──► disk: media/   (long cache headers)
```

- **API** (Node): auth, albums, pages, layout save/load, media metadata,
  processing status.
- **Worker** (Node, same codebase, separate process): runs encoding jobs.
  Job queue backed by PostgreSQL (e.g. `pg-boss`) — no extra Redis.
- **nginx**: TLS, reverse proxy to API, serves `/media/*` statically with
  `Cache-Control: public, max-age=31536000, immutable` (file names include
  a content hash or media id, so they never change).

### Storage abstraction

- Every media file lives under one root: `media/<mediaId>/<variant>`.
- DB stores only relative keys (`<mediaId>/thumb.webp`), never absolute URLs.
- Frontend builds URLs from one config value `MEDIA_BASE_URL`.
- Moving to AWS = sync `media/` to S3, point `MEDIA_BASE_URL` at CloudFront,
  switch worker output to S3. Only the worker's write step changes.

## 9. Media pipeline and loading

### On image upload (worker)
Generate:
- `blur` — ~20px wide, inlined as base64 in the page JSON (instant preview).
- `thumb.webp` — ~400px long edge (album overview, idle preload).
- `display.avif` + `display.webp` — ~2048px long edge (what pages show).
- Keep `original`. Auto-rotate by EXIF, strip EXIF GPS on derived files.

### On video upload (worker)
Generate:
- `poster.webp` (+ blur) from a frame ~1s in.
- HLS: **720p only by default** (small VPS); 1080p rendition behind a config
  flag. ~4s segments, master playlist so adding 1080p later needs no player
  change.
- Encoding settings (renditions, preset, concurrency) in config.
  Concurrency = 1 job at a time; ffmpeg run at low priority (`nice`) so the
  API stays responsive.
- Keep `original`.
- 5-min video encode may take 15–30 min on the small VPS: job runs in
  background; frame shows poster + "processing…" until ready.
- Playback: `hls.js` (Safari plays HLS natively).

### Loading strategy in view mode
| What | When |
|---|---|
| Current page: blur placeholders | instantly (in page JSON) |
| Current page: display images, video posters | immediately |
| Pages ±2: display images, posters, first HLS segments | background, right after current page done |
| Rest of album: thumbnails | when network idle (`requestIdleCallback`) |
| Full videos, originals | never preloaded |

Images fade from blur to sharp. A flip must never show an empty frame.

## 10. Pages and layout model

- Pages have a **fixed portrait aspect ratio** (3:4). Same page scaled to
  fit any screen. Laptop view mode shows a two-page spread (two independent
  pages side by side); phone shows one page.
- Element positions stored in **page-relative units (0–1)**, so pages scale
  to any screen with identical placement.
- Page = background (paper texture) + ordered list of elements:

```json
{
  "id": "page_1",
  "background": "paper-cream",
  "elements": [
    { "type": "frame", "id": "e1", "x": 0.05, "y": 0.08, "w": 0.4, "h": 0.5,
      "rotation": -5, "z": 1, "frameStyle": "polaroid", "mediaId": "m_123" },
    { "type": "tape", "id": "e2", "x": 0.2, "y": 0.05, "w": 0.15, "h": 0.05,
      "rotation": -3, "z": 2, "tapeStyle": "yellow" },
    { "type": "sticker", "id": "e3", "...": "...", "stickerId": "flower-1" },
    { "type": "text", "id": "e4", "...": "...", "text": "Đà Lạt",
      "font": "handwritten-1", "color": "#6b4f2e" }
  ]
}
```

- Layout stored as JSON per page in PostgreSQL.

## 11. Decorate mode

- Create album (title, cover) → add pages → pick a template per page.
- **Album media tray** (builder's call): bulk-upload many files into the
  album, then drag them from a side tray into frames. Media belongs to the
  album, not the frame: swapping/reusing a photo is free, deleting a frame
  never deletes the file. Uploading directly into an empty frame also works.
- **Fit inside frame** (builder's call): media fills the frame (cover-crop);
  owner can drag to pan and scroll/pinch to zoom inside the frame. Stored as
  `crop: { x, y, scale }` on the frame element. Counts as placement, not
  photo editing.
- Templates: a starter set of scrapbook page templates with pre-placed
  polaroid frames, tape, maybe a title spot. Must look designed out of the
  box (anti-goal: ugly placement).
- Click/drop on an empty frame → upload photo/video into it.
- Select element → move, resize, rotate (handles), bring forward/back, delete.
- Add stickers and tape from a small built-in library; add handwritten text.
- Add, delete, reorder pages.
- Save explicitly + autosave (builder's call).
- Undo/redo.
- **Works on laptop and phone.** Mouse: drag, corner resize handles, rotate
  handle, keyboard shortcuts. Touch: drag, pinch to resize, two-finger
  rotate, large handles, bottom toolbar on phone. Canvas library must
  support touch gestures well.

## 12. View mode

- Album opens on a cover page.
- Flip: swipe (phone), arrow keys / click edges (laptop). Page-turn animation
  (builder's call: light slide/curl, not heavy 3D).
- Videos show poster; tap to play inside the frame.
- Album list page showing covers.

## 13. Security

- All pages and API behind login except the login page.
- Media URLs: protected too (personal photos). Builder's call: nginx
  `auth_request` against the API session, or signed URLs. Must still allow
  long browser caching.
- Upload limits: file type allow-list (images, common video), max size.
- HTTPS only.

## 14. Left to the builder

- Exact template designs (portrait 3:4), sticker/tape art and fonts (must meet §4 anti-goal).
- Page-turn animation details.
- Canvas library choice (e.g. `react-konva` or plain DOM + transforms).
- Folder structure, testing approach, migrations tool.
- Media-URL protection mechanism (§13).
- Whether originals are kept forever or optionally deleted to save disk.

## Built since

- **Users beyond the owner:** view-only share links (`/s/<code>`) and timed edit links (`/e/<code>`, see
  `2026-10-20-edit-links-design.md`). Still one owner account; **Log out** on the album list.
- **Pages:** a page can be hidden (kept in the editor, left out of viewing, sharing and print).
- **Decorate mode toolbar:** regrouped into a main row with **＋ Add** (all kinds of items) and a row of the selected
  item's tools; see `2026-10-21-languages-toolbar-design.md`.
- **Media:** in-app frame camera on phones; one-tap "+ add" even under other items; local preview while uploading.
- **Languages:** Vietnamese and English, switchable.
- **More:** multi-storage (R2/B2), Google Drive backup, AI album, 16 more page templates, PDF print, video trim.
