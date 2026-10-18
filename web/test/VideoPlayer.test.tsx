import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MediaDTO } from '@scrapbook/shared';
import { VideoPlayer } from '../src/render/VideoPlayer';

const hls = vi.hoisted(() => ({
  loadSource: vi.fn(), attachMedia: vi.fn(), destroy: vi.fn(),
  onError: null as null | ((e: string, data: { fatal: boolean }) => void),
}));
vi.mock('hls.js', () => ({
  default: class {
    static isSupported = () => true;
    static Events = { ERROR: 'hlsError' };
    loadSource = hls.loadSource;
    attachMedia = hls.attachMedia;
    destroy = hls.destroy;
    on(_ev: string, cb: typeof hls.onError) { hls.onError = cb; }
  },
}));

beforeAll(() => {
  // jsdom has no media playback.
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => {};
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const video: MediaDTO = {
  id: 'v1', albumId: 'a1', kind: 'video', status: 'ready', width: 640, height: 480, durationSec: 6,
  blurDataUrl: null, error: null,
  variants: { poster: 'v1/poster.webp', hls: 'v1/hls/master.m3u8', original: 'v1/original.mp4' },
};

async function startPlaying(active = true) {
  const r = render(<VideoPlayer media={video} active={active} />);
  expect(r.container.querySelector('video')).toBeNull();
  expect(r.container.querySelector('img[src="/media/v1/poster.webp"]')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Play video' }));
  await waitFor(() => expect(hls.loadSource).toHaveBeenCalledWith('/media/v1/hls/master.m3u8'));
  expect(hls.attachMedia).toHaveBeenCalledWith(r.container.querySelector('video'));
  return r;
}

test('poster until tap, then hls attaches; destroy on unmount', async () => {
  const r = await startPlaying();
  r.unmount();
  expect(hls.destroy).toHaveBeenCalledTimes(1);
});

test('active=false destroys hls and returns to poster', async () => {
  const r = await startPlaying();
  r.rerender(<VideoPlayer media={video} active={false} />);
  expect(hls.destroy).toHaveBeenCalledTimes(1);
  expect(r.container.querySelector('video')).toBeNull();
  expect(screen.getByRole('button', { name: 'Play video' })).toBeTruthy();
});

test('fatal hls error falls back to poster with a chip', async () => {
  const r = await startPlaying();
  act(() => hls.onError!('hlsError', { fatal: false }));
  expect(r.container.querySelector('video')).toBeTruthy();
  act(() => hls.onError!('hlsError', { fatal: true }));
  expect(await screen.findByText("không phát được video")).toBeTruthy();
  expect(hls.destroy).toHaveBeenCalledTimes(1);
  expect(r.container.querySelector('video')).toBeNull();
});
