import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AlbumBundle } from '@scrapbook/shared';

vi.mock('html-to-image', () => ({ toJpeg: vi.fn(async () => 'data:image/jpeg;base64,/9j/AA==') }));
const { FORMATS, fitPage, SocialShare } = await import('../src/viewer/SocialShare');
const { toJpeg } = await import('html-to-image');

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.mocked(toJpeg).mockClear(); });

const bundle = (shareToken: string | null = null): AlbumBundle => ({
  album: { id: 'a1', title: 'Đi chơi', coverMediaId: null, backgroundEffect: 'none', backgroundColor: 'rose', shareToken, musicMediaId: null, mode: 'manga', readingDirection: 'ltr' },
  pages: [0, 1, 2].map((i) => ({ id: `p${i}`, albumId: 'a1', position: i, layout: { background: 'paper-white', elements: [], ...(i === 1 ? { hidden: true } : {}) } })),
  media: [],
});

test('a 3:4 page fits inside each format with a margin, centred; the bare page format is exactly the page', () => {
  for (const f of ['post', 'story'] as const) {
    const { w, h } = FORMATS[f];
    const r = fitPage(f);
    expect(r.width / r.height).toBeCloseTo(3 / 4, 3);
    expect(r.left).toBeGreaterThan(0);
    expect(r.top).toBeGreaterThan(0);
    expect(r.left * 2 + r.width).toBeCloseTo(w, 0);
    expect(r.top * 2 + r.height).toBeCloseTo(h, 0);
  }
  expect(FORMATS.post).toEqual({ w: 1080, h: 1350 });
  expect(FORMATS.story).toEqual({ w: 1080, h: 1920 });
  expect(fitPage('page')).toEqual({ width: 1080, height: 1440, left: 0, top: 0 });
});

test('makes one image per visible page and hands them to the share menu', async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share });
  render(<SocialShare bundle={bundle()} onClose={() => {}} />);
  expect(screen.getAllByRole('checkbox')).toHaveLength(2); // the hidden page is left out
  await userEvent.click(screen.getByRole('radio', { name: /Story/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Make images' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Share…' }));
  expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy(); // keeping them on the device is offered too
  expect(toJpeg).toHaveBeenCalledTimes(2);
  const files = share.mock.calls[0][0].files as File[];
  expect(files.map((f) => f.name)).toEqual(['Đi chơi-1.jpg', 'Đi chơi-2.jpg']);
  expect(files[0].type).toBe('image/jpeg');
});

test('without a share menu the images are downloaded; unchecked pages are skipped', async () => {
  vi.stubGlobal('navigator', { ...navigator, canShare: undefined, share: undefined });
  const clicks: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicks.push(this.download); });
  render(<SocialShare bundle={bundle()} onClose={() => {}} />);
  await userEvent.click(screen.getAllByRole('checkbox')[1]);
  await userEvent.click(screen.getByRole('button', { name: 'Make images' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Download' }));
  await waitFor(() => expect(clicks).toEqual(['Đi chơi-1.jpg']));
});

test('Facebook can share the view link when the album has one', () => {
  render(<SocialShare bundle={bundle('T'.repeat(43))} onClose={() => {}} />);
  const fb = screen.getByRole('link', { name: /Facebook/ });
  expect(fb.getAttribute('href')).toBe(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${location.origin}/s/${'T'.repeat(43)}`)}`);
  cleanup();
  render(<SocialShare bundle={bundle()} onClose={() => {}} />);
  expect(screen.queryByRole('link', { name: /Facebook/ })).toBeNull();
});

test('a viewer of a share link can post that link on Facebook too', () => {
  render(<SocialShare bundle={bundle()} onClose={() => {}} viewLink="https://lookback.test/s/abc" />);
  expect(screen.getByRole('link', { name: /Facebook/ }).getAttribute('href')).toContain(encodeURIComponent('https://lookback.test/s/abc'));
});

test('Make video is only offered where the browser can record one', () => {
  render(<SocialShare bundle={bundle()} onClose={() => {}} />);
  expect(screen.queryByRole('button', { name: 'Make video' })).toBeNull(); // jsdom records nothing
});

test('on Safari a picture is drawn again until it stops growing (photos still decoding), keeping the fullest one', async () => {
  const { drawSettled } = await import('../src/viewer/SocialShare');
  const sizes = ['a'.repeat(100), 'a'.repeat(300), 'a'.repeat(600), 'a'.repeat(600), 'a'.repeat(600), 'a'.repeat(900)];
  let n = 0;
  const draw = vi.fn(async () => sizes[n++]);
  const url = await drawSettled(draw, 8, 0);
  expect(url).toHaveLength(600);
  expect(draw).toHaveBeenCalledTimes(4); // stopped once a draw added nothing
  const once = vi.fn(async () => 'x');
  expect(await drawSettled(once, 1, 0)).toBe('x');
  expect(once).toHaveBeenCalledTimes(1); // elsewhere: one draw
});
