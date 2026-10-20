import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { AlbumBundle } from '@scrapbook/shared';

// The canvas's "+ add" click goes through Moveable (no jsdom support); stand in a button that calls the same prop.
vi.mock('../src/editor/EditCanvas', () => ({
  EditCanvas: (p: { onFrameAddMedia(id: string): void }) => <button type="button" onClick={() => p.onFrameAddMedia('f1')}>+ add</button>,
}));
const { EditorView } = await import('../src/pages/Editor');

afterEach(cleanup);
const m = { id: 'm1abcdefgh', albumId: 'a1', kind: 'image' as const, status: 'ready' as const, width: 4, height: 3, durationSec: null, blurDataUrl: null, variants: { original: 'm1/o.jpg', display: 'm1/d.webp', thumb: 'm1/t.webp' }, error: null };
const bundleWith = (media: AlbumBundle['media']): AlbumBundle => ({
  album: { id: 'a1', title: 'Trip', coverMediaId: null, backgroundEffect: 'none', backgroundColor: 'walnut', shareToken: null, musicMediaId: null, mode: 'scrapbook', readingDirection: 'ltr' },
  pages: [{ id: 'p0', albumId: 'a1', position: 0, layout: { background: 'paper-cream', elements: [
    { type: 'frame', id: 'f1', x: 0.1, y: 0.1, w: 0.5, h: 0.4, rotation: 0, z: 1, frameStyle: 'polaroid', mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 } },
  ] } }],
  media,
});
const api = () => ({ savePage: vi.fn().mockResolvedValue({}), addPage: vi.fn(), deletePage: vi.fn(), reorderPages: vi.fn(), getMedia: vi.fn(), deleteMedia: vi.fn(), updateAlbum: vi.fn() });
const setup = (b: AlbumBundle, a = api()) => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><EditorView bundle={b} api={a} /></MemoryRouter>);
  return a;
};

test('"+ add" offers Upload first, then the uploaded photos; picking one puts it in the frame', async () => {
  const user = userEvent.setup();
  setup(bundleWith([m]));
  await user.click(screen.getByRole('button', { name: '+ add' }));
  const dialog = screen.getByRole('dialog', { name: 'Add photo or video' });
  // Actions sit in their own row above the photo grid (in the grid their wrapped labels overflowed onto the photos).
  const options = dialog.querySelectorAll('.frame-menu-actions button');
  expect(dialog.querySelector('.frame-menu-grid .frame-menu-upload')).toBeNull();
  expect(options[0].textContent).toContain('Chụp theo khung'); // phones only (CSS)
  expect(options[1].textContent).toContain('Take photo/video'); // phones only (CSS)
  expect(options[2].textContent).toContain('Upload');
  await user.click(screen.getByRole('button', { name: 'Use image m1abcdef' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Undo' })); // the pick was one layout change
  expect(screen.getByRole('button', { name: 'Redo' })).toHaveProperty('disabled', false);
});

test('"+ add" with nothing uploaded goes straight to the file dialog', async () => {
  const user = userEvent.setup();
  setup(bundleWith([]));
  const input = screen.getByLabelText('Upload into frame') as HTMLInputElement;
  const click = vi.spyOn(input, 'click');
  await user.click(screen.getByRole('button', { name: '+ add' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(click).toHaveBeenCalled();
});

test('"Take photo/video" opens the camera input (capture) for that frame', async () => {
  const user = userEvent.setup();
  setup(bundleWith([m]));
  const camera = screen.getByLabelText('Take photo or video') as HTMLInputElement;
  expect(camera.getAttribute('capture')).toBe('environment');
  const click = vi.spyOn(camera, 'click');
  await user.click(screen.getByRole('button', { name: '+ add' }));
  await user.click(screen.getByRole('button', { name: /Take photo\/video/ }));
  expect(click).toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('"Chụp theo khung" opens the in-app camera for that frame', async () => {
  const user = userEvent.setup();
  setup(bundleWith([m]));
  await user.click(screen.getByRole('button', { name: '+ add' }));
  await user.click(screen.getByRole('button', { name: /Chụp theo khung/ }));
  expect(screen.queryByRole('dialog', { name: 'Add photo or video' })).toBeNull();
  expect(screen.getByRole('dialog', { name: 'Chụp theo khung' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Đóng' }));
  expect(screen.queryByRole('dialog', { name: 'Chụp theo khung' })).toBeNull();
});

test('inside Zalo on iPhone the frame camera is left out (it would open as a fullscreen player) with a hint', async () => {
  const ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Zalo iOS/24.5.1');
  try {
    const user = userEvent.setup();
    setup(bundleWith([m]));
    await user.click(screen.getByRole('button', { name: '+ add' }));
    expect(screen.queryByRole('button', { name: /Chụp theo khung/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Take photo\/video/ })).toBeTruthy();
    expect(screen.getByText(/mở bằng Safari/)).toBeTruthy();
  } finally {
    ua.mockRestore();
  }
});
