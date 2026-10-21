# Vietnamese/English and the compact toolbar — design (as built)

Date: 2026-10-21. Status: built. Written after the fact from the owner's requests in chat.

## Intent

The editor toolbar took three or four rows on a phone, and the UI was a mix of English labels and Vietnamese
messages. The owner asked whether Vietnamese alone would make the toolbar smaller (it wouldn't, ~10–15%), then asked
for the regrouping plus a proper two-language app.

## Goals

1. **Toolbar:** a main row — **＋ Add** (one list of every kind of item; kinds with several looks open their own list),
   Paper (scrapbook), Background (owner), Pin all (owner), undo/redo, zoom, Snap, save status — and, only with an item
   selected, a second row of that item's tools (Font, Frame style, Crop, Trim, Remove photo, panel/bubble tools,
   Duplicate, Pin, layer up/down, delete). On desktop the toolbar is a side column: one full-width button per line,
   small groups (tail corners, layers, zoom) sharing a line.
2. **Languages:** every screen in Vietnamese and English — album list, login, editor (incl. guest mode), viewer,
   share view, print, camera, /manage, the guide. The first language follows the device; an **EN/VI** button on the
   album list, the editor and the login screen switches and is remembered per device.
3. Vietnamese labels the owner chose: Snap = **Đối xứng**, text alignment = **Căn lề**, Font = **Chữ & màu**,
   Add = **Thêm**.

## Non-goals

- Translating server error messages (they stay Vietnamese).
- More languages, plural rules, translated screenshots.

## How it works (decided)

- `web/src/i18n.tsx`: `t(english, vars)`; English text is the key; `VI` table in `i18n.vi.ts`; missing entries fall
  back to English; `{name}` placeholders. `useT()` re-renders on a switch (`useSyncExternalStore`); `setLang` saves
  `lb.lang` and sets `<html lang>`. Labels kept in data (frame styles, effects, desk colours, stickers, template
  names) are translated at render time.
- The guide's content lives in `guideContent.ts` in both languages, rewritten for the current UI.
- Tests run in English; `i18n.test.tsx` checks every Vietnamese entry keeps the same placeholders.

## Left to the builder (taken)

- Short Vietnamese words for buttons; the "+ add" pill on empty frames reads "+ thêm".
