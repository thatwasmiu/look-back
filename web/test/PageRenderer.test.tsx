import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { FrameEl, MediaDTO, PageElement, PageLayout } from '@scrapbook/shared';
import { PageRenderer } from '../src/render/PageRenderer';

afterEach(cleanup);

const frame = (mediaId: string | null): FrameEl => ({
  type: 'frame', id: 'f1', x: 0.1, y: 0.2, w: 0.3, h: 0.4, rotation: -5, z: 1,
  frameStyle: 'polaroid', mediaId, crop: { x: 0.5, y: 0.5, scale: 1 },
});
const media = (id: string, over: Partial<MediaDTO>): MediaDTO => ({
  id, albumId: 'a1', kind: 'image', status: 'ready', width: 100, height: 100, durationSec: null,
  blurDataUrl: 'data:image/webp;base64,AAAA', error: null,
  variants: { thumb: `${id}/thumb.webp`, display: `${id}/display.webp`, displayAvif: `${id}/display.avif`, original: `${id}/original.jpg` },
  ...over,
});

function setup(elements: PageElement[], list: MediaDTO[] = [], mode: 'view' | 'edit' = 'view') {
  const layout: PageLayout = { background: 'paper-cream', elements };
  return render(<PageRenderer layout={layout} media={new Map(list.map((m) => [m.id, m]))} mode={mode} />);
}

test('element geometry maps to percentages and rotation', () => {
  const { container } = setup([frame(null)]);
  const el = container.querySelector<HTMLElement>('[data-el="f1"]')!;
  expect(el.style.left).toBe('10%');
  expect(el.style.top).toBe('20%');
  expect(el.style.width).toBe('30%');
  expect(el.style.height).toBe('40%');
  expect(el.style.transform).toBe('rotate(-5deg)');
});

test('processing media shows chip and no display image', () => {
  const { container } = setup([frame('m1')], [media('m1', { status: 'processing', variants: null })]);
  expect(screen.getByText('đang xử lý…')).toBeTruthy();
  expect(container.querySelector('img[src$="/display.webp"]')).toBeNull();
});

test('processing media never loads display even if variants are present', () => {
  const { container } = setup([frame('m1')], [media('m1', { status: 'processing' })]);
  expect(container.querySelector('img[src$="/display.webp"]')).toBeNull();
});

test('failed media shows upload failed', () => {
  const { container } = setup([frame('m1')], [media('m1', { status: 'failed', variants: null })]);
  expect(screen.getByText('tải lên lỗi')).toBeTruthy();
  expect(container.querySelector('img')).toBeNull();
});

test('ready image renders avif source and webp img', () => {
  const { container } = setup([frame('m1')], [media('m1', {})]);
  expect(container.querySelector('source[type="image/avif"]')?.getAttribute('srcset')).toBe('/media/m1/display.avif');
  expect(container.querySelector('img[src="/media/m1/display.webp"]')).toBeTruthy();
});

test('empty frame: "+ add" only in edit mode', () => {
  setup([frame(null)]);
  expect(screen.queryByText('+ add')).toBeNull();
  cleanup();
  setup([frame(null)], [], 'edit');
  expect(screen.getByText('+ add')).toBeTruthy();
});

test('unknown sticker renders nothing and does not crash', () => {
  const { container } = setup([{ type: 'sticker', id: 's1', x: 0, y: 0, w: 0.1, h: 0.1, rotation: 0, z: 0, stickerId: 'nope' }]);
  expect(container.querySelector('[data-el="s1"]')?.childElementCount).toBe(0);
});

test('every frame style renders its class; photo corners add four corner tabs', async () => {
  const { FRAME_STYLES } = await import('@scrapbook/shared');
  for (const s of FRAME_STYLES) {
    const { container, unmount } = setup([{ ...frame(null), frameStyle: s }]);
    expect(container.querySelector(`.frame-${s}`)).not.toBeNull();
    expect(container.querySelectorAll('.frame-corner')).toHaveLength(s === 'corners' ? 4 : 0);
    unmount();
  }
});

test('page effects render particles inside their box; unknown-free and deterministic', async () => {
  const { PAGE_EFFECTS } = await import('@scrapbook/shared');
  for (const effect of PAGE_EFFECTS) {
    const el = { type: 'effect' as const, id: 'fx', x: 0, y: 0, w: 0.5, h: 0.5, rotation: 0, z: 9, effect };
    const a = setup([el]);
    const box = a.container.querySelector(`.el-effect .fx-${effect}`)!;
    expect(box).not.toBeNull();
    const html = box.innerHTML;
    a.unmount();
    expect(setup([el]).container.querySelector(`.fx-${effect}`)!.innerHTML).toBe(html); // same particles every render
    cleanup();
  }
});

test('album background effect renders particles; none renders nothing', async () => {
  const { BackgroundEffectView } = await import('../src/render/effects');
  const { BACKGROUND_EFFECTS } = await import('@scrapbook/shared');
  for (const kind of BACKGROUND_EFFECTS) {
    const { container, unmount } = render(<BackgroundEffectView kind={kind} />);
    if (kind === 'none') expect(container.innerHTML).toBe('');
    else expect(container.querySelectorAll(`.bgfx-${kind} > i`).length).toBeGreaterThan(5);
    unmount();
  }
});
