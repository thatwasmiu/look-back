import { forwardRef, useImperativeHandle } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { PageLayout } from '@scrapbook/shared';

// Moveable stand-in: the target change resolves only when the test says so, like the real async re-measure.
const m = vi.hoisted(() => ({ resolve: () => {}, dragStart: vi.fn(), props: {} as { onClick?(e: { isDouble: boolean }): void } }));
vi.mock('react-moveable', () => ({
  default: forwardRef((p: object, ref) => {
    m.props = p;
    useImperativeHandle(ref, () => ({
      waitToChangeTarget: () => new Promise<void>((r) => { m.resolve = r; }),
      dragStart: m.dragStart,
      updateRect: () => {},
    }));
    return null;
  }),
}));
const { EditCanvas } = await import('../src/editor/EditCanvas');

afterEach(cleanup);
beforeEach(() => m.dragStart.mockClear());

const layout: PageLayout = { background: 'paper-cream', elements: [
  { type: 'sticker', id: 's1', x: 0.1, y: 0.1, w: 0.2, h: 0.15, rotation: 0, z: 1, stickerId: 'heart' },
] };
const setup = () => render(<EditCanvas layout={layout} media={new Map()} selectedId={null} onSelect={() => {}} onCommit={() => {}} />);

test('a quick click (released before the handles attach) selects only — no drag left stuck to the mouse', async () => {
  const { container } = setup();
  fireEvent.pointerDown(container.querySelector('[data-el="s1"]')!);
  fireEvent.pointerUp(window);
  await act(async () => m.resolve());
  expect(m.dragStart).not.toHaveBeenCalled();
});

test('press and hold on an unselected item still selects and drags in one gesture', async () => {
  const { container } = setup();
  fireEvent.pointerDown(container.querySelector('[data-el="s1"]')!);
  await act(async () => m.resolve());
  expect(m.dragStart).toHaveBeenCalledTimes(1);
});

test('tapping an empty frame deselects it, then opens the photo picker after the click is done', async () => {
  vi.useFakeTimers();
  try {
    const frame: PageLayout = { background: 'paper-cream', elements: [
      { type: 'frame', id: 'f1', x: 0.1, y: 0.1, w: 0.4, h: 0.3, rotation: 0, z: 1, frameStyle: 'polaroid', mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 } },
    ] };
    const onSelect = vi.fn();
    const onFrameAddMedia = vi.fn();
    render(<EditCanvas layout={frame} media={new Map()} selectedId="f1" onSelect={onSelect} onCommit={() => {}} onFrameAddMedia={onFrameAddMedia} />);
    act(() => m.props.onClick!({ isDouble: false }));
    expect(onSelect).toHaveBeenCalledWith(null); // nothing left for a stray drag to grab while the dialog is open
    expect(onFrameAddMedia).not.toHaveBeenCalled(); // not from inside the gesture
    act(() => { vi.runAllTimers(); });
    expect(onFrameAddMedia).toHaveBeenCalledWith('f1');
  } finally {
    vi.useRealTimers();
  }
});
