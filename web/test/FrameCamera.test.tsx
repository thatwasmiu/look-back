import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function withTrack(caps: Record<string, unknown>) {
  const applyConstraints = vi.fn(async () => {});
  const track = { stop, getCapabilities: () => caps, applyConstraints };
  gum.mockImplementation(async () => ({ getTracks: () => [track], getVideoTracks: () => [track] }));
  return applyConstraints;
}

test('hardware zoom: the slider drives the camera zoom (photos and videos)', async () => {
  const apply = withTrack({ zoom: { min: 1, max: 5, step: 0.1 } });
  const user = userEvent.setup();
  render(<FrameCamera frame={frame()} onCapture={() => {}} onClose={() => {}} />);
  const slider = await screen.findByRole('slider', { name: 'Zoom' });
  expect(slider.getAttribute('max')).toBe('5');
  fireEvent.change(slider, { target: { value: '2' } });
  await waitFor(() => expect(apply).toHaveBeenLastCalledWith({ advanced: [{ zoom: 2 }] }));
  expect((document.querySelector('.camera-feed') as HTMLElement).style.transform).not.toContain('scale(2');
  await user.click(screen.getByRole('radio', { name: 'Video' }));
  expect(await screen.findByRole('slider', { name: 'Zoom' })).toBeTruthy();
});

test('digital zoom without camera zoom: scales the preview, photos only', async () => {
  withTrack({});
  const user = userEvent.setup();
  render(<FrameCamera frame={frame()} onCapture={() => {}} onClose={() => {}} />);
  const slider = await screen.findByRole('slider', { name: 'Zoom' });
  expect(slider.getAttribute('max')).toBe('4');
  fireEvent.change(slider, { target: { value: '2' } });
  expect((document.querySelector('.camera-feed') as HTMLElement).style.transform).toBe('scale(2)');
  await user.click(screen.getByRole('radio', { name: 'Video' }));
  await waitFor(() => expect(screen.queryByRole('slider', { name: 'Zoom' })).toBeNull());
  expect((document.querySelector('.camera-feed') as HTMLElement).style.transform).toBe('');
});

test('pinching with two fingers zooms in', async () => {
  withTrack({});
  render(<FrameCamera frame={frame()} onCapture={() => {}} onClose={() => {}} />);
  await screen.findByRole('slider', { name: 'Zoom' });
  const cam = document.querySelector('.camera') as HTMLElement;
  const p = (type: string, id: number, x: number) => cam.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, clientX: x, clientY: 300 }), { pointerId: id }));
  act(() => { p('pointerdown', 1, 100); p('pointerdown', 2, 200); p('pointermove', 2, 300); p('pointerup', 1, 100); p('pointerup', 2, 300); });
  expect((screen.getByRole('slider', { name: 'Zoom' }) as HTMLInputElement).value).toBe('2');
});

test('flash (torch) toggles only where the camera has one', async () => {
  const apply = withTrack({ torch: true });
  const user = userEvent.setup();
  render(<FrameCamera frame={frame()} onCapture={() => {}} onClose={() => {}} />);
  const btn = await screen.findByRole('button', { name: '⚡ Đèn' });
  await user.click(btn);
  expect(apply).toHaveBeenLastCalledWith({ advanced: [{ torch: true }] });
  expect(btn.getAttribute('aria-pressed')).toBe('true');
  await user.click(btn);
  expect(apply).toHaveBeenLastCalledWith({ advanced: [{ torch: false }] });
  cleanup();
  withTrack({});
  render(<FrameCamera frame={frame()} onCapture={() => {}} onClose={() => {}} />);
  await screen.findByRole('slider', { name: 'Zoom' });
  expect(screen.queryByRole('button', { name: '⚡ Đèn' })).toBeNull();
});

test('frameWindowShape measures the photo area: its proportions and corner rounding (as percentages)', async () => {
  const { frameWindowShape } = await import('../src/editor/FrameCamera');
  const el = document.createElement('div');
  Object.defineProperty(el, 'offsetWidth', { value: 200 });
  Object.defineProperty(el, 'offsetHeight', { value: 100 });
  el.style.borderRadius = '20px';
  document.body.appendChild(el);
  expect(frameWindowShape(el)).toEqual({ aspect: 2, radius: '10% / 20%' }); // 20px on a 200×100 area
  el.style.borderRadius = '50%';
  expect(frameWindowShape(el)!.radius).toBe('50%');
  el.style.borderRadius = '0px';
  expect(frameWindowShape(el)!.radius).toBe('0px');
  el.remove();
  const empty = document.createElement('div');
  expect(frameWindowShape(empty)).toBeNull(); // not laid out: caller falls back to the frame's own proportions
});

test('the camera window takes the measured photo area: proportions and rounding, no extra rounding', () => {
  render(<FrameCamera frame={frame()} windowShape={{ aspect: 0.8, radius: '5% / 4%' }} onCapture={() => {}} onClose={() => {}} />);
  const w = document.querySelector('.camera-window') as HTMLElement;
  expect(w.style.aspectRatio).toBe('0.8');
  expect(w.style.borderRadius).toBe('5% / 4%');
});

function orientation(portrait: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('portrait') ? portrait : !portrait, addEventListener() {}, removeEventListener() {} }));
}

test('a wide frame held upright asks to turn the phone sideways', async () => {
  orientation(true);
  render(<FrameCamera frame={frame()} windowShape={{ aspect: 2.5, radius: '0px' }} onCapture={() => {}} onClose={() => {}} />);
  expect((await screen.findByRole('note')).textContent).toContain('Xoay ngang điện thoại');
});

test('no hint once the phone is sideways, or for a frame that fits', async () => {
  orientation(false);
  render(<FrameCamera frame={frame()} windowShape={{ aspect: 2.5, radius: '0px' }} onCapture={() => {}} onClose={() => {}} />);
  await waitFor(() => expect(gum).toHaveBeenCalled());
  expect(screen.queryByRole('note')).toBeNull();
  cleanup();
  orientation(true);
  render(<FrameCamera frame={frame()} windowShape={{ aspect: 0.9, radius: '0px' }} onCapture={() => {}} onClose={() => {}} />);
  await waitFor(() => expect(gum).toHaveBeenCalled());
  expect(screen.queryByRole('note')).toBeNull();
});

test('a tall frame held sideways asks to turn the phone upright', async () => {
  orientation(false);
  render(<FrameCamera frame={frame()} windowShape={{ aspect: 0.5, radius: '0px' }} onCapture={() => {}} onClose={() => {}} />);
  expect((await screen.findByRole('note')).textContent).toContain('Xoay dọc điện thoại');
});

test('leaving the app releases the camera; coming back opens it again (iOS kills the stream in the background)', async () => {
  render(<FrameCamera frame={frame()} onCapture={() => {}} onClose={() => {}} />);
  await waitFor(() => expect(gum).toHaveBeenCalledTimes(1));
  const vis = (state: 'hidden' | 'visible') => {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  };
  vis('hidden');
  expect(stop).toHaveBeenCalled();
  vis('visible');
  await waitFor(() => expect(gum).toHaveBeenCalledTimes(2));
});

test('a stream that the phone ends is reopened', async () => {
  const listeners: Record<string, () => void> = {};
  const track = { stop, addEventListener: (t: string, f: () => void) => { listeners[t] = f; }, removeEventListener() {} };
  gum.mockImplementation(async () => ({ getTracks: () => [track], getVideoTracks: () => [track] }));
  render(<FrameCamera frame={frame()} onCapture={() => {}} onClose={() => {}} />);
  await waitFor(() => expect(listeners.ended).toBeTypeOf('function'));
  act(() => listeners.ended());
  await waitFor(() => expect(gum).toHaveBeenCalledTimes(2));
});
