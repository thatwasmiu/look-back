import { readFileSync } from 'node:fs';
import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { AlbumBundle, MediaDTO, PageElement } from '@scrapbook/shared';
import { EditorView, type EditorApi } from '../src/pages/Editor';

afterEach(cleanup);
const setup = (api: EditorApi) => render(
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><EditorView bundle={bundle} api={api} /></MemoryRouter>,
);
const mediaApi = { getMedia: vi.fn(), deleteMedia: vi.fn(), updateAlbum: vi.fn() };
// Kinds of items to add sit behind the toolbar's "+ Add".
const addVia = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await user.click(screen.getByRole('button', { name }));
};
const okApi = (): EditorApi => ({ savePage: vi.fn().mockResolvedValue({}), addPage: vi.fn(), deletePage: vi.fn(), reorderPages: vi.fn(), ...mediaApi });

const bundle: AlbumBundle = {
  album: { id: 'a1', title: 'Trip', coverMediaId: null, backgroundEffect: 'none', backgroundColor: 'walnut', shareToken: null, musicMediaId: null, mode: 'scrapbook', readingDirection: 'ltr' },
  pages: [0, 1].map((i) => ({ id: `p${i}`, albumId: 'a1', position: i, layout: { background: 'paper-cream', elements: [] } })),
  media: [],
};

test('a failed save blocks switching page; Save retries, then the switch goes through', async () => {
  const api: EditorApi = {
    savePage: vi.fn().mockRejectedValueOnce(new Error('500')).mockResolvedValue({}),
    addPage: vi.fn(), deletePage: vi.fn(), reorderPages: vi.fn(), ...mediaApi,
  };
  const user = userEvent.setup();
  setup(api);
  expect(screen.queryByRole('button', { name: 'Retry save' })).toBeNull(); // autosave: no button while saves succeed
  await addVia(user, 'Text');
  await user.click(screen.getByRole('button', { name: 'Page 2' }));
  expect((await screen.findByRole('alert')).textContent).toContain("isn't saved yet");
  expect(screen.getByRole('button', { name: 'Page 1' }).getAttribute('aria-current')).toBe('true');
  expect(screen.getByRole('status').textContent).toBe('Save failed');

  await user.click(screen.getByRole('button', { name: 'Retry save' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved'));
  expect(screen.queryByRole('button', { name: 'Retry save' })).toBeNull();
  expect(api.savePage).toHaveBeenLastCalledWith('p0', expect.objectContaining({ elements: [expect.objectContaining({ type: 'text' })] }), undefined);
  await user.click(screen.getByRole('button', { name: 'Page 2' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Page 2' }).getAttribute('aria-current')).toBe('true'));
});

test('arrow-key nudges of one element coalesce into a single undo step', async () => {
  const user = userEvent.setup();
  const { container } = setup(okApi());
  await addVia(user, 'Text'); // adds and selects the text
  const el = () => container.querySelector<HTMLElement>('.edit-page .el-text')!;
  const x0 = el().style.left;
  await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
  expect(el().style.left).not.toBe(x0);
  await user.click(screen.getByRole('button', { name: 'Undo' }));
  expect(el().style.left).toBe(x0);
});

test.each(['{Delete}', '{Backspace}'])('%s removes the selected element even while a toolbar button keeps focus', async (key) => {
  const user = userEvent.setup();
  const { container } = setup(okApi());
  await addVia(user, 'Text'); // adds + selects the text
  await user.click(screen.getByRole('button', { name: 'Bring forward' })); // focus stays on this button
  expect(document.activeElement?.tagName).toBe('BUTTON');
  await user.keyboard(key);
  expect(container.querySelector('.edit-page .el-text')).toBeNull();
});

test('deleting media from the tray empties its frames locally, so the next save carries no stale mediaId', async () => {
  const m = { id: 'm1', albumId: 'a1', kind: 'image' as const, status: 'ready' as const, width: 4, height: 3, durationSec: null, blurDataUrl: null, variants: { original: 'm1/o.jpg' }, error: null };
  const withFrame: AlbumBundle = { ...bundle, media: [m], pages: [{ ...bundle.pages[0], layout: { background: 'paper-cream', elements: [
    { type: 'frame', id: 'f1', x: 0.1, y: 0.1, w: 0.5, h: 0.4, rotation: 0, z: 1, frameStyle: 'polaroid', mediaId: 'm1', crop: { x: 0.3, y: 0.5, scale: 2 } },
  ] } }] };
  const api = { ...okApi(), deleteMedia: vi.fn().mockResolvedValue(undefined) };
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const user = userEvent.setup();
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><EditorView bundle={withFrame} api={api} /></MemoryRouter>);
  await user.click(screen.getByRole('button', { name: 'Delete from album' }));
  await waitFor(() => expect(api.deleteMedia).toHaveBeenCalledWith('m1'));
  await waitFor(() => expect(api.savePage).toHaveBeenCalledWith('p0', expect.objectContaining({
    elements: [expect.objectContaining({ id: 'f1', mediaId: null })] }), undefined), { timeout: 3000 });
  expect(screen.queryByRole('button', { name: 'Delete from album' })).toBeNull();
});

test('an upload id arriving early goes into its frame (uploading… chip); a frame not on this page reports false', () => {
  let onCreated: ((id: string, frameId?: string) => boolean | void) | null = null;
  const uploader = ((_a: string, cb: typeof onCreated) => { onCreated = cb; return { items: [], add: vi.fn(), retry: vi.fn() }; }) as never;
  const withEmpty: AlbumBundle = { ...bundle, pages: [{ ...bundle.pages[0], layout: { background: 'paper-cream', elements: [
    { type: 'frame', id: 'f1', x: 0.1, y: 0.1, w: 0.5, h: 0.4, rotation: 0, z: 1, frameStyle: 'polaroid', mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 } },
  ] } }] };
  const { container } = render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><EditorView bundle={withEmpty} api={okApi()} uploader={uploader} /></MemoryRouter>);
  let placed: boolean | void = undefined;
  act(() => { placed = onCreated!('u1', 'f1'); });
  expect(placed).toBe(true);
  expect(container.querySelector('.edit-page [data-frame-id=f1] .chip')?.textContent).toBe('uploading…');
  act(() => { placed = onCreated!('u2', 'gone'); });
  expect(placed).toBe(false);
});

const frameEmpty = { type: 'frame' as const, id: 'f1', x: 0.1, y: 0.1, w: 0.5, h: 0.4, rotation: 0, z: 1, frameStyle: 'polaroid' as const, mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 } };
const row = (status: 'uploading' | 'processing' | 'ready') => ({ id: 'u1', albumId: 'a1', kind: 'image' as const, status, width: 4, height: 3, durationSec: null, blurDataUrl: null, variants: status === 'ready' ? { original: 'u1/o.jpg', display: 'u1/d.webp' } : null, error: null });

test("after a reload, 'uploading' media from the bundle is polled until it settles", async () => {
  vi.useFakeTimers();
  try {
    const getMedia = vi.fn().mockResolvedValueOnce(row('uploading')).mockResolvedValueOnce(row('processing')).mockResolvedValue(row('ready'));
    const api = { ...okApi(), getMedia };
    const b: AlbumBundle = { ...bundle, media: [row('uploading')], pages: [{ ...bundle.pages[0], layout: { background: 'paper-cream', elements: [{ ...frameEmpty, mediaId: 'u1' }] } }] };
    const uploader = (() => ({ items: [], add: vi.fn(), retry: vi.fn() })) as never;
    const { container } = render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><EditorView bundle={b} api={api} uploader={uploader} /></MemoryRouter>);
    expect(container.querySelector('[data-frame-id=f1] .chip')?.textContent).toBe('uploading…');
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(getMedia).toHaveBeenCalledWith('u1');
    expect(container.querySelector('[data-frame-id=f1] .chip')).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test('a 4xx after the early frame assign leaves the media shown as failed, not stuck uploading', () => {
  let onCreated: ((id: string, frameId?: string) => boolean | void) | null = null;
  let items: unknown[] = [];
  const uploader = ((_a: string, cb: typeof onCreated) => { onCreated = cb; return { items, add: vi.fn(), retry: vi.fn() }; }) as never;
  const b: AlbumBundle = { ...bundle, pages: [{ ...bundle.pages[0], layout: { background: 'paper-cream', elements: [frameEmpty] } }] };
  const api = okApi();
  const ui = () => <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><EditorView bundle={b} api={api} uploader={uploader} /></MemoryRouter>;
  const { container, rerender } = render(ui());
  act(() => { onCreated!('u1', 'f1'); });
  expect(container.querySelector('[data-frame-id=f1] .chip')?.textContent).toBe('uploading…');
  items = [{ localId: 'l1', name: 'a.jpg', progress: 0.5, mediaId: 'u1', state: 'error', error: 'gone', retryable: false }];
  rerender(ui());
  expect(container.querySelector('[data-frame-id=f1] .chip')?.textContent).toBe('upload failed');
});

test('Frame opens a list of styles; with a frame selected, Frame style switches it', async () => {
  const user = userEvent.setup();
  const { container } = setup(okApi());
  await addVia(user, 'Frame');
  expect(screen.getAllByRole('button', { name: /frame$/i }).length).toBeGreaterThanOrEqual(14);
  await user.click(screen.getByRole('button', { name: 'Heart frame' }));
  expect(container.querySelector('.edit-page .frame-heart')).not.toBeNull();
  await user.click(screen.getByRole('button', { name: 'Frame style' }));
  await user.click(screen.getByRole('button', { name: 'Film strip frame' }));
  expect(container.querySelector('.edit-page .frame-heart')).toBeNull();
  expect(container.querySelectorAll('.edit-page .frame-film')).toHaveLength(1);
});

test('phone: Hide tools tucks the photos, pages and tools away; Show tools brings them back', async () => {
  const user = userEvent.setup();
  const { container } = setup(okApi());
  const main = () => container.querySelector('main.editor')!;
  await user.click(screen.getByRole('button', { name: 'Hide tools' }));
  expect(main().classList.contains('panels-hidden')).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Show tools' }));
  expect(main().classList.contains('panels-hidden')).toBe(false);
});

test('an open picker closes on a click outside it (and on Escape)', async () => {
  const user = userEvent.setup();
  const { container } = setup(okApi());
  await addVia(user, 'Sticker');
  expect(container.querySelector('.picker')).not.toBeNull();
  await user.click(container.querySelector('.edit-stage')!);
  expect(container.querySelector('.picker')).toBeNull();
  await addVia(user, 'Frame');
  expect(container.querySelector('.picker')).not.toBeNull();
  await user.keyboard('{Escape}');
  expect(container.querySelector('.picker')).toBeNull();
});

test('the add-page template list has Cancel and also closes on an outside click or Escape', async () => {
  const user = userEvent.setup();
  const { container } = setup(okApi());
  const open = () => user.click(screen.getByRole('button', { name: 'Add page' }));
  const list = () => screen.queryByRole('dialog', { name: 'Pick a template' });
  await open();
  await user.click(screen.getByRole('button', { name: 'Close' }));
  expect(list()).toBeNull();
  await open();
  await user.click(container.querySelector('.edit-stage')!);
  expect(list()).toBeNull();
  await open();
  await user.keyboard('{Escape}');
  expect(list()).toBeNull();
});

test('zoom: + / − step the page size, the percentage button fits it back; Ctrl+wheel zooms too', async () => {
  const user = userEvent.setup();
  const { container } = setup(okApi());
  const zoom = () => (container.querySelector<HTMLElement>('.edit-page')!).style.getPropertyValue('--zoom');
  expect(zoom()).toBe('1');
  await user.click(screen.getByRole('button', { name: 'Zoom in' }));
  await user.click(screen.getByRole('button', { name: 'Zoom in' }));
  expect(zoom()).toBe('1.5');
  await user.click(screen.getByRole('button', { name: 'Zoom out' }));
  expect(zoom()).toBe('1.25');
  await user.click(screen.getByRole('button', { name: /Fit page/ }));
  expect(zoom()).toBe('1');
  act(() => { container.querySelector('.edit-stage')!.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true })); });
  expect(zoom()).toBe('1.25');
});

test('Effect adds a page effect; Album background saves the album effect and shows it behind the page', async () => {
  const user = userEvent.setup();
  const api = { ...okApi(), updateAlbum: vi.fn().mockResolvedValue({}) };
  const { container } = setup(api);
  await addVia(user, 'Effect');
  await user.click(screen.getByRole('button', { name: 'Sparkles effect' }));
  expect(container.querySelector('.edit-page .el-effect .fx-sparkles')).not.toBeNull();
  await user.click(screen.getByRole('button', { name: 'Background' }));
  await user.click(screen.getByRole('button', { name: 'Snow background' }));
  expect(api.updateAlbum).toHaveBeenCalledWith('a1', { backgroundEffect: 'snow' });
  expect(container.querySelector('.edit-main .bgfx-snow')).not.toBeNull();
});

test('Album background also picks the desk color: saved for the album and applied behind the page', async () => {
  const user = userEvent.setup();
  const api = { ...okApi(), updateAlbum: vi.fn().mockResolvedValue({}) };
  const { container } = setup(api);
  expect(container.querySelector('main.editor')!.classList.contains('desk-walnut')).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Background' }));
  await user.click(screen.getByRole('button', { name: 'Ocean desk color' }));
  expect(api.updateAlbum).toHaveBeenCalledWith('a1', { backgroundColor: 'ocean' });
  expect(container.querySelector('main.editor')!.classList.contains('desk-ocean')).toBe(true);
});

test('Remove photo empties the selected frame (frame stays, one undo step); undo/redo sit in one row', async () => {
  const user = userEvent.setup();
  const m = { id: 'm1', albumId: 'a1', kind: 'image' as const, status: 'ready' as const, width: 4, height: 3, durationSec: null, blurDataUrl: null, variants: { original: 'm1/o.jpg', display: 'm1/d.webp' }, error: null };
  const b: AlbumBundle = { ...bundle, media: [m], pages: [{ ...bundle.pages[0], layout: { background: 'paper-cream', elements: [
    { type: 'frame', id: 'f1', x: 0.1, y: 0.1, w: 0.5, h: 0.4, rotation: 0, z: 1, frameStyle: 'polaroid', mediaId: 'm1', crop: { x: 0.3, y: 0.5, scale: 2 } },
  ] } }] };
  const { container } = render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><EditorView bundle={b} api={okApi()} /></MemoryRouter>);
  expect(screen.queryByRole('button', { name: 'Remove photo' })).toBeNull(); // nothing selected
  fireEvent.pointerDown(container.querySelector('[data-el="f1"]')!);
  await user.click(screen.getByRole('button', { name: 'Remove photo' }));
  expect(container.querySelector('[data-frame-id="f1"] .slot-empty')).not.toBeNull();
  expect(container.querySelector('[data-el="f1"]')).not.toBeNull();
  await user.click(screen.getByRole('button', { name: 'Undo' }));
  expect(container.querySelector('[data-frame-id="f1"] .slot-empty')).toBeNull();
  expect(screen.getByRole('button', { name: 'Undo' }).parentElement).toBe(screen.getByRole('button', { name: 'Redo' }).parentElement);
  expect(screen.getByRole('button', { name: 'Undo' }).parentElement!.classList.contains('row')).toBe(true);
});

test('click the album title to rename it: Enter saves, Escape cancels, empty names are ignored', async () => {
  const user = userEvent.setup();
  const api = { ...okApi(), updateAlbum: vi.fn().mockResolvedValue({}) };
  setup(api);
  await user.click(screen.getByRole('button', { name: /Rename album/ }));
  const input = screen.getByRole('textbox', { name: 'Album name' });
  await user.clear(input);
  await user.type(input, 'Summer 2026{Enter}');
  expect(api.updateAlbum).toHaveBeenCalledWith('a1', { title: 'Summer 2026' });
  expect(screen.getByRole('button', { name: /Rename album/ }).textContent).toContain('Summer 2026');

  await user.click(screen.getByRole('button', { name: /Rename album/ }));
  await user.type(screen.getByRole('textbox', { name: 'Album name' }), ' extra{Escape}');
  await user.click(screen.getByRole('button', { name: /Rename album/ }));
  await user.clear(screen.getByRole('textbox', { name: 'Album name' }));
  await user.keyboard('{Enter}');
  expect(api.updateAlbum).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: /Rename album/ }).textContent).toContain('Summer 2026');
});

test('Next page moves to the next page; on the last page it becomes New page and opens the template picker', async () => {
  const user = userEvent.setup();
  setup(okApi()); // 2 pages
  await user.click(screen.getByRole('button', { name: 'Next page' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Page 2' }).getAttribute('aria-current')).toBe('true'));
  expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'New page' }));
  expect(screen.getByRole('dialog', { name: 'Pick a template' })).toBeTruthy();
});

test('arrow keys flip pages when nothing is selected (→ on the last page offers a new page)', async () => {
  const user = userEvent.setup();
  setup(okApi()); // 2 pages
  const current = (n: number) => screen.getByRole('button', { name: `Page ${n}` }).getAttribute('aria-current');
  await user.keyboard('{ArrowRight}');
  await waitFor(() => expect(current(2)).toBe('true'));
  await user.keyboard('{ArrowLeft}');
  await waitFor(() => expect(current(1)).toBe('true'));
  await user.keyboard('{ArrowRight}');
  await waitFor(() => expect(current(2)).toBe('true'));
  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('dialog', { name: 'Pick a template' })).toBeTruthy();
});

test('the Pages tab folds the page thumbnails away and opens them again', async () => {
  const user = userEvent.setup();
  setup(okApi()); // 2 pages
  const tab = screen.getByRole('button', { name: /^Pages \(2\)/ });
  expect(tab.getAttribute('aria-expanded')).toBe('true');
  await user.click(tab);
  expect(screen.queryByRole('button', { name: 'Page 1' })).toBeNull();
  expect(tab.getAttribute('aria-expanded')).toBe('false');
  await user.click(tab);
  expect(screen.getByRole('button', { name: 'Page 1' })).toBeTruthy();
});

test('the ← button goes back a page and is hidden on the first page', async () => {
  const user = userEvent.setup();
  setup(okApi()); // 2 pages
  expect(screen.queryByRole('button', { name: 'Previous page' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Next page' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Page 2' }).getAttribute('aria-current')).toBe('true'));
  await user.click(screen.getByRole('button', { name: 'Previous page' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Page 1' }).getAttribute('aria-current')).toBe('true'));
});

test('on phones the Pages strip starts folded', async () => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('max-width: 699px'), addEventListener() {}, removeEventListener() {} }));
  try {
    setup(okApi());
    expect(screen.getByRole('button', { name: /^Pages \(2\)/ }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Page 1' })).toBeNull();
  } finally {
    vi.unstubAllGlobals();
  }
});

test('tapping the desk around the page clears the selection', () => {
  const b: AlbumBundle = { ...bundle, pages: [{ ...bundle.pages[0], layout: { background: 'paper-cream', elements: [
    { type: 'frame', id: 'f1', x: 0.1, y: 0.1, w: 0.5, h: 0.4, rotation: 0, z: 1, frameStyle: 'polaroid', mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 } },
  ] } }] };
  const { container } = render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><EditorView bundle={b} api={okApi()} /></MemoryRouter>);
  fireEvent.pointerDown(container.querySelector('[data-el="f1"]')!);
  const del = () => (screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled;
  expect(del()).toBe(false);
  fireEvent.pointerDown(container.querySelector('.edit-stage')!);
  expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull(); // item tools show only with something selected
});

test('a pinned item ignores arrow nudges until it is unpinned', async () => {
  const user = userEvent.setup();
  const { container } = setup(okApi());
  await addVia(user, 'Text');
  const el = () => container.querySelector<HTMLElement>('.edit-page .el-text')!;
  const x0 = el().style.left;
  await user.click(screen.getByRole('button', { name: '📌 Pin' }));
  expect(screen.getByRole('button', { name: '📌 Unpin' }).getAttribute('aria-pressed')).toBe('true');
  await user.keyboard('{ArrowRight}');
  expect(el().style.left).toBe(x0);
  await user.click(screen.getByRole('button', { name: '📌 Unpin' }));
  await user.keyboard('{ArrowRight}');
  expect(el().style.left).not.toBe(x0);
});

test('Pin all pins every item on the page; unpinning is one item at a time', async () => {
  const user = userEvent.setup();
  const { container } = setup(okApi());
  await addVia(user, 'Text');
  const el = () => container.querySelector<HTMLElement>('.edit-page .el-text')!;
  const x0 = el().style.left;
  await user.click(screen.getByRole('button', { name: 'Pin all' }));
  expect(screen.queryByRole('button', { name: 'Pin all' })).toBeNull(); // nothing left to pin; no "Unpin all"
  expect(screen.getByRole('button', { name: '📌 Unpin' }).getAttribute('aria-pressed')).toBe('true');
  await user.keyboard('{ArrowRight}');
  expect(el().style.left).toBe(x0);
  await user.click(screen.getByRole('button', { name: '📌 Unpin' }));
  expect(screen.getByRole('button', { name: 'Pin all' })).toBeTruthy();
});

test('Ctrl+C / Ctrl+V pastes a copy of the selected item (also on another page); Duplicate does the same', async () => {
  const user = userEvent.setup();
  const { container } = setup(okApi());
  await addVia(user, 'Text');
  const count = () => container.querySelectorAll('.edit-page [data-el]').length;
  expect(count()).toBe(1);
  await user.keyboard('{Control>}c{/Control}');
  fireEvent(window, Object.assign(new Event('paste'), { clipboardData: { files: [] } }));
  expect(count()).toBe(2);
  await user.click(screen.getByRole('button', { name: '⧉ Duplicate' }));
  expect(count()).toBe(3);
  await user.click(screen.getByRole('button', { name: 'Next page' }));
  await waitFor(() => expect(count()).toBe(0));
  fireEvent(window, Object.assign(new Event('paste'), { clipboardData: { files: [] } }));
  expect(count()).toBe(1);
});

test('pasting a clipboard image uploads it into the selected empty frame', () => {
  const add = vi.fn();
  const uploader = (() => ({ items: [], add, retry: vi.fn() })) as never;
  const b: AlbumBundle = { ...bundle, pages: [{ ...bundle.pages[0], layout: { background: 'paper-cream', elements: [frameEmpty] } }] };
  const { container } = render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><EditorView bundle={b} api={okApi()} uploader={uploader} /></MemoryRouter>);
  const png = new File(['x'], 'shot.png', { type: 'image/png' });
  fireEvent(window, Object.assign(new Event('paste'), { clipboardData: { files: [png] } }));
  expect(add).toHaveBeenLastCalledWith([png], undefined); // nothing selected → Photos
  fireEvent.pointerDown(container.querySelector('[data-el="f1"]')!);
  fireEvent(window, Object.assign(new Event('paste'), { clipboardData: { files: [png] } }));
  expect(add).toHaveBeenLastCalledWith([png], 'f1');
});

test('with text selected, Font opens one panel for typeface, size and color', async () => {
  const user = userEvent.setup();
  const { container } = setup(okApi());
  expect(screen.queryByRole('button', { name: 'Font' })).toBeNull();
  await addVia(user, 'Text');
  await user.click(screen.getByRole('button', { name: 'Font' }));
  await user.click(screen.getByRole('button', { name: 'ink #a33a2a' }));
  expect(container.querySelector<HTMLElement>('.edit-page .el-text .text')!.style.color).toBe('rgb(163, 58, 42)');
  expect(screen.getAllByRole('button', { name: 'Aa' })).toHaveLength(2);
  const fontSize = () => parseFloat(container.querySelector<HTMLElement>('.edit-page .el-text .text')!.style.fontSize.replace(/[^\d.]/g, ''));
  const before = fontSize();
  await user.click(screen.getByRole('button', { name: 'Bigger text' }));
  await user.click(screen.getByRole('button', { name: 'Bigger text' }));
  expect(fontSize()).toBeGreaterThan(before);
  await user.click(screen.getByRole('button', { name: 'Undo' })); // both taps were one change
  expect(fontSize()).toBe(before);
});

test('Font panel: align, line spacing and outline restyle the text', async () => {
  const user = userEvent.setup();
  const { container } = setup(okApi());
  await addVia(user, 'Text');
  await user.click(screen.getByRole('button', { name: 'Font' }));
  const style = () => container.querySelector<HTMLElement>('.edit-page .el-text .text')!.style;
  await user.click(screen.getByRole('button', { name: 'Align right' }));
  expect(style().textAlign).toBe('right');
  expect(screen.getByRole('button', { name: 'Align right' }).getAttribute('aria-pressed')).toBe('true');
  await user.click(screen.getByRole('button', { name: 'More line spacing' }));
  expect(style().lineHeight).toBe('1.15');
  expect(screen.getByLabelText('Line spacing').textContent).toBe('1.1');
  await user.click(screen.getByRole('button', { name: 'Outline' }));
  expect(style().getPropertyValue('-webkit-text-stroke') || style().webkitTextStroke).toContain('#');
  expect(screen.getByRole('button', { name: 'Outline' }).getAttribute('aria-pressed')).toBe('true');
});

test('Background → Music shows the track by file name; Play previews it and keeps playing with the picker closed', async () => {
  const user = userEvent.setup();
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: false, configurable: true });
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: true, configurable: true });
    this.dispatchEvent(new Event('pause'));
  });
  const song = { id: 'm9', albumId: 'a1', kind: 'audio' as const, status: 'ready' as const, width: null, height: null, durationSec: 160, blurDataUrl: null, error: null, name: 'Biển xanh.mp3', variants: { audio: 'm9/audio.m4a', original: 'm9/audio.m4a' } };
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <EditorView bundle={{ ...bundle, album: { ...bundle.album, musicMediaId: 'm9' }, media: [song] }} api={okApi()} />
  </MemoryRouter>);
  expect(screen.queryByRole('button', { name: /audio/ })).toBeNull(); // music is not in Photos
  await user.click(screen.getByRole('button', { name: 'Background' }));
  expect(screen.getByText('♪ Biển xanh')).toBeTruthy();
  expect(screen.getByText('2:40')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: '▶ Play' }));
  expect(play).toHaveBeenCalled();
  await user.keyboard('{Escape}'); // picker closes, music keeps playing
  await user.click(screen.getByRole('button', { name: 'Pause music' }));
  expect(screen.queryByRole('button', { name: 'Pause music' })).toBeNull();
});

const mangaBundle = (elements: PageElement[] = []): AlbumBundle => ({
  ...bundle, album: { ...bundle.album, mode: 'manga' },
  pages: bundle.pages.map((p) => ({ ...p, layout: { background: 'paper-white', elements } })),
});
const mangaPanel: PageElement = { type: 'frame', id: 'p1', x: 0.1, y: 0.1, w: 0.5, h: 0.4, rotation: 0, z: 1, frameStyle: 'panel', mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 } };
const renderEditor = (b: AlbumBundle, api: EditorApi = { ...okApi(), updateAlbum: vi.fn().mockResolvedValue({}) }) => ({ api, ...render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><EditorView bundle={b} api={api} /></MemoryRouter>) });

test('manga album: the toolbar has manga tools and no Tape / Sticker / Paper; a scrapbook album keeps its tools', async () => {
  const user = userEvent.setup();
  renderEditor(mangaBundle());
  await user.click(screen.getByRole('button', { name: 'Add' }));
  for (const name of ['Panel', 'Bubble', 'Narration', 'Sound effect', 'Lines', 'Screentone', 'Text', 'Effect']) expect(screen.getByRole('button', { name })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Tone' })).toBeNull(); // the panel Tone toggle only shows with a panel selected
  for (const name of ['Tape', 'Sticker', 'Paper']) expect(screen.queryByRole('button', { name })).toBeNull();
  cleanup();
  setup(okApi());
  await user.click(screen.getByRole('button', { name: 'Add' }));
  for (const name of ['Tape', 'Sticker', 'Paper', 'Frame']) expect(screen.getByRole('button', { name })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Bubble' })).toBeNull();
});

test('manga: Bubble → Shout adds a shout bubble, selected, with Font / Color tools', async () => {
  const user = userEvent.setup();
  const { container } = renderEditor(mangaBundle());
  await addVia(user, 'Bubble');
  await user.click(screen.getByRole('button', { name: 'Shout' }));
  expect(container.querySelector('.edit-page .manga-shout')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Font' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Font' }));
  expect(screen.getAllByRole('button', { name: 'Aa' })).toHaveLength(3); // Bangers is offered in manga albums
});

test('manga: Ink on a selected panel is one saved, undoable change', async () => {
  const user = userEvent.setup();
  const { api, container } = renderEditor(mangaBundle([mangaPanel]));
  fireEvent.pointerDown(container.querySelector('[data-el="p1"]')!);
  await user.click(screen.getByRole('button', { name: 'Ink' }));
  expect(screen.getByRole('button', { name: 'Ink' }).getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('[data-frame-id="p1"] .frame-window.ink')).not.toBeNull();
  await waitFor(() => expect(api.savePage).toHaveBeenLastCalledWith('p0', expect.objectContaining({ elements: [expect.objectContaining({ id: 'p1', ink: true })] }), undefined));
  await user.click(screen.getByRole('button', { name: 'Undo' }));
  expect(container.querySelector('[data-frame-id="p1"] .frame-window.ink')).toBeNull();
});

test('manga: Add page offers the manga layouts, not the scrapbook templates', async () => {
  const user = userEvent.setup();
  renderEditor(mangaBundle());
  await user.click(screen.getByRole('button', { name: 'Add page' }));
  const picker = screen.getByRole('dialog', { name: 'Pick a template' });
  for (const name of ['Classic grid', 'Dynamic slants', 'Splash + insets', 'Full-bleed single panel']) expect(picker.textContent).toContain(name);
  expect(picker.textContent).not.toContain('Two tilted'); // a scrapbook-only template
});

test('manga: Background → Right → left saves the reading direction', async () => {
  const user = userEvent.setup();
  const { api } = renderEditor(mangaBundle());
  await user.click(screen.getByRole('button', { name: 'Background' }));
  await user.click(screen.getByRole('button', { name: 'Right → left' }));
  expect(api.updateAlbum).toHaveBeenCalledWith('a1', { readingDirection: 'rtl' });
  expect(screen.getByRole('button', { name: 'Right → left' }).getAttribute('aria-pressed')).toBe('true');
});

const mangaText = (id: string, textStyle: 'speech' | 'sfx', color: string): PageElement =>
  ({ type: 'text', id, x: 0.2, y: 0.5, w: 0.36, h: 0.2, rotation: 0, z: 3, text: 'BÙM!', font: textStyle === 'sfx' ? 'bangers' : 'patrick-hand', color, size: 0.06, textStyle, tail: 'bl' });

test('manga: editing a bubble keeps its bubble/box, hides only its own drawn words; sound-effect text is readable while typing', () => {
  const { container } = renderEditor(mangaBundle([mangaText('s1', 'sfx', '#ffffff')]));
  fireEvent.doubleClick(container.querySelector('[data-el="s1"]')!);
  const editor = container.querySelector<HTMLElement>('[data-el="s1"] .text-editing')!;
  expect(editor).not.toBeNull();
  expect(editor.style.color).toBe('rgb(17, 17, 17)'); // white SFX would be invisible on white paper while typing
  expect(container.querySelector('.edit-page')!.classList.contains('editing')).toBe(true);
  expect(editor.classList.contains('manga-edit')).toBe(true); // laid out like the drawn words (centred, padded)
  const css = readFileSync('src/styles.css', 'utf8');
  expect(css).toContain('.el-text:has(.text-editing) .manga-words { visibility: hidden; }');
  expect(css).not.toContain('.edit-page.editing .el-text .manga-text'); // the bubble shape stays visible
});

test('manga: a selected speech bubble can point its tail at any corner', async () => {
  const user = userEvent.setup();
  const { container } = renderEditor(mangaBundle([mangaText('b1', 'speech', '#111111')]));
  fireEvent.pointerDown(container.querySelector('[data-el="b1"]')!);
  await user.click(screen.getByRole('button', { name: 'Tail bottom-right' }));
  expect(container.querySelector('[data-el="b1"] .manga-speech.tail-br')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Tail bottom-right' }).getAttribute('aria-pressed')).toBe('true');
});

test('manga: with a panel selected, new speed lines start over that panel instead of covering the page', async () => {
  const user = userEvent.setup();
  const { container } = renderEditor(mangaBundle([mangaPanel]));
  fireEvent.pointerDown(container.querySelector('[data-el="p1"]')!);
  await addVia(user, 'Lines');
  await user.click(screen.getByRole('button', { name: 'Speed lines' }));
  const fx = container.querySelector<HTMLElement>('.edit-page .el-effect')!;
  expect([fx.style.left, fx.style.top, fx.style.width, fx.style.height]).toEqual(['10%', '10%', '50%', '40%']);
});

test('manga: Shape lets each corner of a panel move on its own; Done saves it as one change, Reset squares it', async () => {
  const user = userEvent.setup();
  const { api, container } = renderEditor(mangaBundle([mangaPanel]));
  fireEvent.pointerDown(container.querySelector('[data-el="p1"]')!);
  await user.click(screen.getByRole('button', { name: 'Shape' }));
  const corner3 = screen.getByRole('button', { name: 'Corner 3' }); // bottom-right
  corner3.focus();
  await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowUp}');
  await user.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(api.savePage).toHaveBeenLastCalledWith('p0', expect.objectContaining({
    elements: [expect.objectContaining({ id: 'p1', x: 0.1, y: 0.1, shape: [[0, 0], [1, 0], [0.96, 0.98], [0, 1]] })],
  }), undefined));
  expect(container.querySelector<HTMLElement>('[data-frame-id="p1"] .frame-window')!.style.clipPath).toBe('polygon(0% 0%, 100% 0%, 96% 98%, 0% 100%)');

  await user.click(screen.getByRole('button', { name: 'Shape' }));
  await user.click(screen.getByRole('button', { name: 'Reset' }));
  await user.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(api.savePage).toHaveBeenLastCalledWith('p0', expect.objectContaining({
    elements: [expect.objectContaining({ id: 'p1', shape: [[0, 0], [1, 0], [1, 1], [0, 1]] })],
  }), undefined));
});

test('manga: dragging a Shape corner moves it, even when the browser refuses pointer capture', async () => {
  const user = userEvent.setup();
  const w = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(200);
  const h = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200);
  const cap = vi.fn(() => { throw new DOMException('Invalid pointer id', 'NotFoundError'); });
  (HTMLElement.prototype as unknown as { setPointerCapture: unknown }).setPointerCapture = cap;
  try {
    const { container } = renderEditor(mangaBundle([mangaPanel]));
    fireEvent.pointerDown(container.querySelector('[data-el="p1"]')!);
    await user.click(screen.getByRole('button', { name: 'Shape' }));
    const handle = screen.getByRole('button', { name: 'Corner 3' });
    const overlay = container.querySelector('.shape-overlay')!;
    // jsdom has no PointerEvent (clientX would be dropped): pointer-typed MouseEvents carry the coordinates.
    const ptr = (type: string, x: number, y: number) => new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    fireEvent(handle, ptr('pointerdown', 300, 300));
    fireEvent(overlay, ptr('pointermove', 260, 280)); // −40px, −20px of a 200px box
    fireEvent(overlay, ptr('pointerup', 260, 280));
    expect(container.querySelector('.shape-outline polygon')!.getAttribute('points')).toBe('0,0 100,0 80,90 0,100');
  } finally {
    w.mockRestore(); h.mockRestore();
    delete (HTMLElement.prototype as unknown as { setPointerCapture?: unknown }).setPointerCapture;
  }
});

test('manga: Shape, Ink and Tone sit together in one panel group', () => {
  const { container } = renderEditor(mangaBundle([mangaPanel]));
  fireEvent.pointerDown(container.querySelector('[data-el="p1"]')!);
  const group = screen.getByRole('group', { name: 'Panel' });
  expect(group.classList.contains('row')).toBe(true);
  for (const name of ['Shape', 'Ink', 'Tone']) expect(screen.getByRole('button', { name }).parentElement).toBe(group);
});

test('?page=2 (Edit from the viewer) opens on that page', () => {
  render(<MemoryRouter initialEntries={['/albums/a1/edit?page=2']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><EditorView bundle={bundle} api={okApi()} /></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Page 2' }).getAttribute('aria-current')).toBe('true');
  expect(screen.getByRole('link', { name: '← Done' }).getAttribute('href')).toBe('/albums/a1?page=2'); // back to this page
});

test('Snap is on by default and the choice is remembered on this device', async () => {
  const user = userEvent.setup();
  localStorage.removeItem('lb.snap');
  setup(okApi());
  const snapBtn = () => screen.getByRole('button', { name: 'Snap' });
  expect(snapBtn().getAttribute('aria-pressed')).toBe('true');
  await user.click(snapBtn());
  expect(snapBtn().getAttribute('aria-pressed')).toBe('false');
  expect(localStorage.getItem('lb.snap')).toBe('off');
  localStorage.removeItem('lb.snap');
});

test('✂ Trim on a frame with a video saves the clip range; Full video clears it', async () => {
  const user = userEvent.setup();
  const v: MediaDTO = { id: 'v1', albumId: 'a1', kind: 'video', status: 'ready', width: 640, height: 480, durationSec: 10, blurDataUrl: null, error: null,
    variants: { poster: 'v1/poster.webp', hls: 'v1/hls/master.m3u8', original: 'v1/original.mp4' } };
  const b: AlbumBundle = { ...bundle, media: [v], pages: [{ ...bundle.pages[0], layout: { background: 'paper-cream', elements: [
    { type: 'frame', id: 'f1', x: 0.1, y: 0.1, w: 0.5, h: 0.4, rotation: 0, z: 1, frameStyle: 'polaroid', mediaId: 'v1', crop: { x: 0.5, y: 0.5, scale: 1 } },
  ] } }, bundle.pages[1]] };
  const { container } = render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><EditorView bundle={b} api={okApi()} /></MemoryRouter>);
  fireEvent.pointerDown(container.querySelector('[data-el="f1"]')!);
  await user.click(screen.getByRole('button', { name: '✂ Trim' }));
  fireEvent.change(screen.getByLabelText('Trim start'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('Trim end'), { target: { value: '7.5' } });
  expect(screen.getByText(/Start 0:03.0/)).toBeTruthy();
  expect(screen.getByText(/End 0:07.5/)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Full video' }));
  expect(screen.getByText(/End 0:10.0/)).toBeTruthy();
});

test('Hide page keeps the page in the editor, marks it, saves hidden, and Done points at the visible page', async () => {
  const user = userEvent.setup();
  const api = okApi();
  setup(api); // 2 pages, on page 1
  await user.click(screen.getByRole('button', { name: 'Hide page' }));
  expect(screen.getByText(/This page is hidden/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Page 1' }).closest('.thumb')!.className).toContain('is-hidden');
  await user.click(screen.getByRole('button', { name: 'Page 2' })); // switching saves page 1
  await waitFor(() => expect(api.savePage).toHaveBeenCalledWith('p0', expect.objectContaining({ hidden: true }), undefined));
  expect(screen.getByRole('link', { name: '← Done' }).getAttribute('href')).toBe('/albums/a1?page=1');
  await user.click(screen.getByRole('button', { name: 'Page 1' }));
  await user.click(screen.getByRole('button', { name: 'Show page' }));
  expect(screen.queryByText(/This page is hidden/)).toBeNull();
});

test('guest (edit link): page and frame tools are gone; text, stickers and the rest stay editable', async () => {
  const user = userEvent.setup();
  const els: PageElement[] = [
    { type: 'frame', id: 'f1', x: 0.1, y: 0.1, w: 0.5, h: 0.4, rotation: 0, z: 1, frameStyle: 'polaroid', mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 } },
    { type: 'text', id: 't1', x: 0.1, y: 0.7, w: 0.6, h: 0.1, rotation: 0, z: 2, text: 'Chào', font: 'patrick-hand', color: '#111111', size: 0.04 },
  ];
  const b: AlbumBundle = { ...bundle, album: { ...bundle.album, editExpiresAt: new Date(Date.now() + 3600_000).toISOString() },
    pages: bundle.pages.map((p, i) => (i === 0 ? { ...p, layout: { ...p.layout, elements: els } } : p)) };
  const { container } = render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><EditorView bundle={b} api={okApi()} guest /></MemoryRouter>);
  // Structure and album settings: owner only.
  for (const name of ['Background', 'Add page', 'Delete page', 'Hide page', 'Move page right', 'Pin all']) {
    expect(screen.queryByRole('button', { name }), name).toBeNull();
  }
  expect(screen.queryByRole('link', { name: '← Done' })).toBeNull();
  expect(screen.queryByRole('button', { name: /Rename album/ })).toBeNull();
  expect(screen.getByText(/Edit link · until/)).toBeTruthy();
  // Everything else is there.
  expect(screen.getByRole('button', { name: 'Paper' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Add' }));
  for (const name of ['Text', 'Sticker', 'Tape', 'Effect']) expect(screen.getByRole('button', { name }), name).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Frame' })).toBeNull();
  await user.keyboard('{Escape}');
  // A frame can't be deleted, duplicated, pinned or restyled…
  fireEvent.pointerDown(container.querySelector('[data-el="f1"]')!);
  expect(screen.queryByRole('button', { name: /Duplicate/ })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Frame style' })).toBeNull();
  expect(screen.queryByRole('button', { name: /Pin/ })).toBeNull();
  expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true);
  await user.keyboard('{Delete}');
  expect(container.querySelector('[data-el="f1"]')).not.toBeNull();
  expect(container.querySelector('[data-el="f1"] .slot-empty')).not.toBeNull(); // still takes a photo
  // …but text can.
  fireEvent.pointerDown(container.querySelector('[data-el="t1"]')!);
  expect(screen.getByRole('button', { name: /Duplicate/ })).toBeTruthy();
  await user.keyboard('{Delete}');
  expect(container.querySelector('[data-el="t1"]')).toBeNull();
  // The page arrow on the last page doesn't offer a new page.
  await user.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.queryByRole('button', { name: 'New page' })).toBeNull();
});
