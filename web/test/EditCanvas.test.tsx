import { forwardRef, useImperativeHandle } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { PageLayout } from '@scrapbook/shared';

// Moveable stand-in: the target change resolves only when the test says so, like the real async re-measure.
const m = vi.hoisted(() => ({ resolve: () => {}, dragStart: vi.fn() }));
vi.mock('react-moveable', () => ({
  default: forwardRef((_p, ref) => {
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
