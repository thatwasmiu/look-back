import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { AlbumBundle } from '@scrapbook/shared';
import { EditorView, type EditorApi } from '../src/pages/Editor';

afterEach(cleanup);
const setup = (api: EditorApi) => render(
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><EditorView bundle={bundle} api={api} /></MemoryRouter>,
);
const mediaApi = { getMedia: vi.fn(), deleteMedia: vi.fn(), updateAlbum: vi.fn() };
const okApi = (): EditorApi => ({ savePage: vi.fn().mockResolvedValue({}), addPage: vi.fn(), deletePage: vi.fn(), reorderPages: vi.fn(), ...mediaApi });

const bundle: AlbumBundle = {
  album: { id: 'a1', title: 'Trip', coverMediaId: null },
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
  await user.click(screen.getByRole('button', { name: 'Text' }));
  await user.click(screen.getByRole('button', { name: 'Page 2' }));
  expect((await screen.findByRole('alert')).textContent).toContain("didn't save");
  expect(screen.getByRole('button', { name: 'Page 1' }).getAttribute('aria-current')).toBe('true');
  expect(screen.getByRole('status').textContent).toBe('Save failed');

  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved'));
  expect(api.savePage).toHaveBeenLastCalledWith('p0', expect.objectContaining({ elements: [expect.objectContaining({ type: 'text' })] }), undefined);
  await user.click(screen.getByRole('button', { name: 'Page 2' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Page 2' }).getAttribute('aria-current')).toBe('true'));
});

test('arrow-key nudges of one element coalesce into a single undo step', async () => {
  const user = userEvent.setup();
  const { container } = setup(okApi());
  await user.click(screen.getByRole('button', { name: 'Text' })); // adds and selects the text
  const el = () => container.querySelector<HTMLElement>('.edit-page .el-text')!;
  const x0 = el().style.left;
  await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
  expect(el().style.left).not.toBe(x0);
  await user.click(screen.getByRole('button', { name: 'Undo' }));
  expect(el().style.left).toBe(x0);
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
