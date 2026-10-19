import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FrameEl } from '@scrapbook/shared';
import { FrameCamera, frameAspect } from '../src/editor/FrameCamera';

const frame = (over: Partial<FrameEl> = {}): FrameEl => ({
  type: 'frame', id: 'f1', x: 0.1, y: 0.1, w: 0.4, h: 0.3, rotation: 0, z: 1, frameStyle: 'polaroid', mediaId: null,
  crop: { x: 0.5, y: 0.5, scale: 1 }, ...over,
});

let stop: ReturnType<typeof vi.fn>;
let gum: ReturnType<typeof vi.fn>;
let recorders: { start: ReturnType<typeof vi.fn>; stop(): void; ondataavailable?: (e: { data: Blob }) => void; onstop?: () => void; mimeType: string }[];

beforeEach(() => {
  stop = vi.fn();
  gum = vi.fn(async () => ({ getTracks: () => [{ stop }] }));
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: gum }, configurable: true });
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { value: 1920, configurable: true });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { value: 1080, configurable: true });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never;
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback, type?: string) { cb(new Blob(['jpg'], { type })); };
  recorders = [];
  class FakeRecorder {
    static isTypeSupported = (t: string) => t === 'video/mp4';
    mimeType = 'video/mp4';
    start = vi.fn();
    ondataavailable?: (e: { data: Blob }) => void;
    onstop?: () => void;
    constructor() { recorders.push(this as never); }
    stop() { this.ondataavailable?.({ data: new Blob(['vid'], { type: 'video/mp4' }) }); this.onstop?.(); }
  }
  vi.stubGlobal('MediaRecorder', FakeRecorder);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('frame aspect follows the frame on the 3:4 page', () => {
  expect(frameAspect(frame({ w: 0.4, h: 0.3 }))).toBeCloseTo((0.4 * 3) / (0.3 * 4)); // 1.0
  expect(frameAspect(frame({ w: 0.9, h: 0.3 }))).toBeCloseTo(2.25);
});

test('opens the back camera, shows the frame outline, a photo is cropped and handed over as JPEG', async () => {
  const user = userEvent.setup();
  const onCapture = vi.fn();
  render(<FrameCamera frame={frame({ frameStyle: 'circle' })} onCapture={onCapture} onClose={() => {}} />);
  await waitFor(() => expect(gum).toHaveBeenCalledWith({ video: { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false }));
  expect(document.querySelector('.camera-window.shape-circle')).not.toBeNull();
  await user.click(screen.getByRole('button', { name: 'Chụp' }));
  const file = onCapture.mock.calls[0][0] as File;
  expect(file.type).toBe('image/jpeg');
  expect(file.name).toMatch(/^camera-\d+\.jpg$/);
  expect(stop).toHaveBeenCalled(); // camera released after the shot
});

test('video mode records with sound and hands over the recording', async () => {
  const user = userEvent.setup();
  const onCapture = vi.fn();
  render(<FrameCamera frame={frame()} onCapture={onCapture} onClose={() => {}} />);
  await user.click(screen.getByRole('radio', { name: 'Video' }));
  await waitFor(() => expect(gum).toHaveBeenLastCalledWith({ video: { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: true }));
  await user.click(screen.getByRole('button', { name: 'Quay' }));
  expect(recorders[0].start).toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Dừng' }));
  const file = onCapture.mock.calls[0][0] as File;
  expect(file.type).toBe('video/mp4');
  expect(file.name).toMatch(/^camera-\d+\.mp4$/);
});

test('switching camera reopens with the front camera; closing releases it', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<FrameCamera frame={frame()} onCapture={() => {}} onClose={onClose} />);
  await waitFor(() => expect(gum).toHaveBeenCalled());
  await user.click(screen.getByRole('button', { name: 'Đổi camera' }));
  await waitFor(() => expect(gum).toHaveBeenLastCalledWith({ video: { facingMode: 'user', width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false }));
  await user.click(screen.getByRole('button', { name: 'Đóng' }));
  expect(onClose).toHaveBeenCalled();
  expect(stop).toHaveBeenCalled();
});

test('a camera that cannot open shows why and points to Take photo/video', async () => {
  gum.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
  render(<FrameCamera frame={frame()} onCapture={() => {}} onClose={() => {}} />);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Take photo/video'));
  await act(async () => {});
});
