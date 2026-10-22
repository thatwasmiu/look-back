# Edit links, installing from a shared link, hidden pages — design (as built)

Date: 2026-10-20. Status: built. Written after the fact from the owner's requests in chat; this is the record of
what was decided.

## Intent

The owner builds an album's structure (pages, frames/panels, bubbles) and wants friends or family — who rarely know
how to lay out a page — to add their own photos and words, for a limited time, without a password. Separately, a
page should be able to disappear from what others see without being deleted, and people opening a shared link on
a phone should be able to install it as an app that opens that album.

## Goals

1. **Edit link per album**, made from the Share dialog: the owner types the **hours** (1–168, default 8), copies
   `/e/<code>`, can **Extend** (same code, new expiry) or **Revoke** (locks at once).
2. **What a guest may do:** everything on a page except its structure — fill frames (upload, frame camera, crop,
   trim, remove photo), add/change/delete text, bubbles, narration, sound effects, stickers, tape, effects, paper,
   layers, undo.
3. **What a guest may not do:** add/delete/reorder/hide pages; add/delete/move/resize/rotate/restyle/reshape frames or
   panels; album settings (title, music, desk colour, background effect, reading direction, cover); delete media;
   anything on another album or on /manage.
4. **Enforced on the server**, not just hidden in the UI: every guest save is compared with the stored page.
5. **Hidden pages:** **Hide / Show** under the current page's thumbnail; hidden pages stay in the editor (faded,
   "Hidden" badge, a note on the page) but are left out of the viewer, share links (server-side, with media only they
   show) and print/PDF. The viewer↔editor `?page=N` mapping skips hidden pages.
6. **Install from a link:** "Add to Home Screen" on `/e/<code>` or `/s/<code>` installs an app that opens that album
   (iPhone Home Screen apps don't share Safari's cookies). The login screen offers the last shared link and a box
   to paste a link or bare code.

## Anti-goals

- A guest changing the layout by calling the API directly.
- A share (view) bundle or a guest bundle exposing the share or edit code.
- An expired or revoked link still working for an already-open guest session.
- The owner's own installed app being turned into a single-album app.

## How it works (decided)

- `albums.edit_token`, `albums.edit_expires_at` (migration 010). `POST /api/albums/:id/edit-link {hours?}` keeps a
  valid code and sets `now + hours`; without hours it returns the current link. `DELETE` clears both columns.
- `GET /api/edit/:code` (public) checks code + expiry, stores `guest {albumId, token}` in the session and returns the
  bundle with `shareToken`/`editToken` null and `editExpiresAt`.
- The auth guard lets a guest reach only `PUT /api/pages/:id`, `GET /api/media/:id` and tus uploads (not DELETE), and
  re-checks the code against the album on every request. Handlers keep the guest to their album; uploads must be
  image/video into that album; continuing an upload only for that album's media.
- `guestEditAllowed(before, after)`: same `hidden`; the same set of frames by id, each identical apart from
  `mediaId`, `crop`, `trim` and `z`. Everything else is free. Violations → 403 with a Vietnamese message.
- Media access: `/api/auth/check` and bucket media accept the guest for files of their album.
- Web: `/e/:code` → `GuestEdit` → `EditorView guest` (no page tools, no frame/panel/Background/Pin all/rename; frames
  locked in the canvas; the toolbar keeps the rest).
- Hidden pages: `PageLayout.hidden?: true`; `hideHiddenPages` for share bundles; preview page count excludes them.
- Manifest: `GET /api/manifest/<e|s>/<code>` (public) with `id`/`start_url` = the link; nginx substitutes it into the
  HTML of those paths (`$request_uri` map + `sub_filter`); the service worker never stores those pages as the shell.
- Last link: `localStorage lb.guestLink`, set when a link opens, cleared when it is gone; parsing accepts full links,
  `/e|s/<code>` paths and bare 43-character codes (a bare code is tried as an edit link first).

## Left as is (owner's calls)

- Edit links default to 8 hours, max 168. One edit link per album.
- A guest's session cookie lasts like the owner's; the code check on each request is what limits it.

## Built since

- Guests get **Pin all**: it pins what they may edit (text, stickers, bubbles…), never frames/panels.
- People who open a view link can use **Share to social** too; its Facebook link posts that view link.
- Owner and guest editing at once: a save over a newer version of the page is refused (409) and the editor loads
  that version with a note, instead of overwriting.
