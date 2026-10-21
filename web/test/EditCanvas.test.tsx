import { forwardRef, useImperativeHandle } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { PageLayout } from '@scrapbook/shared';

// Moveable stand-in: the target change resolves only when the test says so, like the real async re-measure.
type Ev = Record<string, unknown>;
const m = vi.hoisted(() => ({ resolve: () => {}, dragStart: vi.fn(), props: {} as Record<string, (e: Ev) => void> }));
vi.mock('react-moveable', () => ({
  default: forwardRef((p: object, ref) => {
    m.props = p as Record<string, (e: Ev) => void>;
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

test('tapping "+ add" on an empty frame deselects it, then opens the photo picker after the click is done', async () => {
  vi.useFakeTimers();
  try {
    const frame: PageLayout = { background: 'paper-cream', elements: [
      { type: 'frame', id: 'f1', x: 0.1, y: 0.1, w: 0.4, h: 0.3, rotation: 0, z: 1, frameStyle: 'polaroid', mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 } },
    ] };
    const onSelect = vi.fn();
    const onFrameAddMedia = vi.fn();
    render(<EditCanvas layout={frame} media={new Map()} selectedId="f1" onSelect={onSelect} onCommit={() => {}} onFrameAddMedia={onFrameAddMedia} />);
    const add = document.querySelector('.slot-empty')!;
    act(() => m.props.onClick({ isDouble: false, inputTarget: add.parentElement })); // tap elsewhere on the frame
    expect(onSelect).not.toHaveBeenCalled();
    act(() => m.props.onClick({ isDouble: false, inputTarget: add }));
    expect(onSelect).toHaveBeenCalledWith(null); // nothing left for a stray drag to grab while the dialog is open
    expect(onFrameAddMedia).not.toHaveBeenCalled(); // not from inside the gesture
    act(() => { vi.runAllTimers(); });
    expect(onFrameAddMedia).toHaveBeenCalledWith('f1');
  } finally {
    vi.useRealTimers();
  }
});

test('an item only moves while the mouse button is held: a move with no button down ends the drag and changes nothing', () => {
  const onCommit = vi.fn();
  render(<EditCanvas layout={layout} media={new Map()} selectedId="s1" onSelect={() => {}} onCommit={onCommit} />);
  const stopDrag = vi.fn();
  act(() => {
    m.props.onDragStart({ inputEvent: { buttons: 1 } });
    m.props.onDrag({ left: 50, top: 60, inputEvent: { buttons: 0 }, stopDrag }); // button already released
    m.props.onDragEnd({});
  });
  expect(stopDrag).toHaveBeenCalled();
  expect(onCommit).not.toHaveBeenCalled();
});

test('the same rule holds for resize and rotate', () => {
  const onCommit = vi.fn();
  render(<EditCanvas layout={layout} media={new Map()} selectedId="s1" onSelect={() => {}} onCommit={onCommit} />);
  const stopDrag = vi.fn();
  act(() => {
    m.props.onResizeStart({ inputEvent: { buttons: 1 } });
    m.props.onResize({ width: 10, height: 10, drag: { beforeTranslate: [0, 0] }, inputEvent: { buttons: 0 }, stopDrag });
    m.props.onResizeEnd({});
    m.props.onRotateStart({ inputEvent: { buttons: 1 }, set: () => {} });
    m.props.onRotate({ rotation: 30, inputEvent: { buttons: 0 }, stopDrag });
    m.props.onRotateEnd({});
  });
  expect(stopDrag).toHaveBeenCalledTimes(2);
  expect(onCommit).not.toHaveBeenCalled();
});

test('a drag whose release was missed keeps the position from while the button was held, then stops', () => {
  const onCommit = vi.fn();
  const box = document.createElement('div');
  render(<EditCanvas layout={layout} media={new Map()} selectedId="s1" onSelect={() => {}} onCommit={onCommit} />, { container: document.body.appendChild(box) });
  const stopDrag = vi.fn();
  act(() => {
    m.props.onDragStart({ inputEvent: { buttons: 1 } });
    m.props.onDrag({ left: 0, top: 0, inputEvent: { buttons: 1 } }); // held: preview moves
    m.props.onDrag({ left: 0, top: 0, inputEvent: { buttons: 0 }, stopDrag }); // release was missed
    m.props.onDragEnd({});
  });
  expect(stopDrag).toHaveBeenCalled();
  expect(onCommit).toHaveBeenCalledTimes(1); // the held position, once — not again on drag end
});

test('crop mode has Remove photo: empties the frame and leaves crop mode', async () => {
  const filled: PageLayout = { background: 'paper-cream', elements: [
    { type: 'frame', id: 'f1', x: 0.1, y: 0.1, w: 0.4, h: 0.3, rotation: 0, z: 1, frameStyle: 'polaroid', mediaId: 'm1', crop: { x: 0.2, y: 0.5, scale: 2 } },
  ] };
  const onCommit = vi.fn();
  const onCrop = vi.fn();
  const { getByRole } = render(<EditCanvas layout={filled} media={new Map()} selectedId="f1" onSelect={() => {}} onCommit={onCommit} cropId="f1" onCrop={onCrop} />);
  fireEvent.click(getByRole('button', { name: 'Remove photo' }));
  expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ elements: [expect.objectContaining({ id: 'f1', mediaId: null })] }));
  expect(onCrop).toHaveBeenCalledWith(null);
});

test('crop mode Size slider can make the photo smaller than the frame; Fill resets it; Done commits', () => {
  const filled: PageLayout = { background: 'paper-cream', elements: [
    { type: 'frame', id: 'f1', x: 0.1, y: 0.1, w: 0.4, h: 0.3, rotation: 0, z: 1, frameStyle: 'polaroid', mediaId: 'm1', crop: { x: 0.5, y: 0.5, scale: 1 } },
  ] };
  const onCommit = vi.fn();
  const { getByRole } = render(<EditCanvas layout={filled} media={new Map()} selectedId="f1" onSelect={() => {}} onCommit={onCommit} cropId="f1" onCrop={() => {}} />);
  fireEvent.change(getByRole('slider', { name: 'Photo size' }), { target: { value: '0.6' } });
  expect((getByRole('slider', { name: 'Photo size' }) as HTMLInputElement).value).toBe('0.6');
  fireEvent.click(getByRole('button', { name: 'Done' }));
  expect(onCommit).toHaveBeenLastCalledWith(expect.objectContaining({ elements: [expect.objectContaining({ crop: { x: 0.5, y: 0.5, scale: 0.6 } })] }));
  fireEvent.click(getByRole('button', { name: 'Fill' }));
  expect((getByRole('slider', { name: 'Photo size' }) as HTMLInputElement).value).toBe('1');
});

test('one tap on "+ add" of an unselected frame opens the picker (no select first)', async () => {
  vi.useFakeTimers();
  try {
    const frame: PageLayout = { background: 'paper-cream', elements: [
      { type: 'frame', id: 'f1', x: 0.1, y: 0.1, w: 0.4, h: 0.3, rotation: 0, z: 1, frameStyle: 'polaroid', mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 } },
    ] };
    const onSelect = vi.fn();
    const onFrameAddMedia = vi.fn();
    render(<EditCanvas layout={frame} media={new Map()} selectedId={null} onSelect={onSelect} onCommit={() => {}} onFrameAddMedia={onFrameAddMedia} />);
    const add = document.querySelector('.slot-empty')!;
    act(() => { add.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    expect(onSelect).not.toHaveBeenCalledWith('f1'); // not selected, so no drag starts either
    act(() => { add.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })); vi.runAllTimers(); });
    expect(onFrameAddMedia).toHaveBeenCalledWith('f1');
  } finally {
    vi.useRealTimers();
  }
});

test('"+ add" under an effect layer (speed lines over a panel) still opens with one tap', async () => {
  vi.useFakeTimers();
  try {
    const layout: PageLayout = { background: 'paper-cream', elements: [
      { type: 'frame', id: 'f1', x: 0.1, y: 0.1, w: 0.4, h: 0.3, rotation: 0, z: 1, frameStyle: 'panel', mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 } },
      { type: 'effect', id: 'e1', x: 0, y: 0, w: 1, h: 1, rotation: 0, z: 2, effect: 'speed-lines' },
    ] };
    const onFrameAddMedia = vi.fn();
    render(<EditCanvas layout={layout} media={new Map()} selectedId={null} onSelect={() => {}} onCommit={() => {}} onFrameAddMedia={onFrameAddMedia} />);
    const add = document.querySelector('.slot-empty')!;
    const fx = document.querySelector('[data-el="e1"]')!;
    document.elementsFromPoint = () => [fx, add];
    act(() => { fx.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    act(() => { fx.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })); vi.runAllTimers(); });
    expect(onFrameAddMedia).toHaveBeenCalledWith('f1');
  } finally {
    vi.useRealTimers();
  }
});

test('"+ add" partly covered by a neighbour (an unselected bubble) still opens with one tap', async () => {
  vi.useFakeTimers();
  try {
    const layout: PageLayout = { background: 'paper-cream', elements: [
      { type: 'frame', id: 'f1', x: 0.1, y: 0.1, w: 0.4, h: 0.3, rotation: 0, z: 1, frameStyle: 'panel', mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 } },
      { type: 'text', id: 't1', x: 0.2, y: 0.2, w: 0.3, h: 0.1, rotation: 0, z: 7, text: 'Chào', font: 'patrick-hand', color: '#111111', size: 0.032, textStyle: 'speech', tail: 'bl' },
    ] };
    const onSelect = vi.fn();
    const onFrameAddMedia = vi.fn();
    render(<EditCanvas layout={layout} media={new Map()} selectedId={null} onSelect={onSelect} onCommit={() => {}} onFrameAddMedia={onFrameAddMedia} />);
    const add = document.querySelector('.slot-empty')!;
    const bubble = document.querySelector('[data-el="t1"]')!;
    document.elementsFromPoint = () => [bubble, add];
    act(() => { bubble.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    act(() => { bubble.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })); vi.runAllTimers(); });
    expect(onFrameAddMedia).toHaveBeenCalledWith('f1');
    expect(onSelect).not.toHaveBeenCalledWith('t1');
  } finally {
    vi.useRealTimers();
  }
});

test('the selected item stays draggable even where it covers a "+ add"', async () => {
  const layout: PageLayout = { background: 'paper-cream', elements: [
    { type: 'frame', id: 'f1', x: 0.1, y: 0.1, w: 0.4, h: 0.3, rotation: 0, z: 1, frameStyle: 'panel', mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 } },
    { type: 'text', id: 't1', x: 0.2, y: 0.2, w: 0.3, h: 0.1, rotation: 0, z: 7, text: 'Chào', font: 'patrick-hand', color: '#111111', size: 0.032, textStyle: 'speech', tail: 'bl' },
  ] };
  const onFrameAddMedia = vi.fn();
  render(<EditCanvas layout={layout} media={new Map()} selectedId="t1" onSelect={() => {}} onCommit={() => {}} onFrameAddMedia={onFrameAddMedia} />);
  const add = document.querySelector('.slot-empty')!;
  const bubble = document.querySelector('[data-el="t1"]')!;
  document.elementsFromPoint = () => [bubble, add];
  act(() => { bubble.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
  act(() => { bubble.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })); });
  await new Promise((r) => setTimeout(r, 0));
  expect(onFrameAddMedia).not.toHaveBeenCalled();
});

test('"+ add" on a selected PINNED frame still opens the picker with one tap', async () => {
  vi.useFakeTimers();
  try {
    const frame: PageLayout = { background: 'paper-cream', elements: [
      { type: 'frame', id: 'f1', x: 0.1, y: 0.1, w: 0.4, h: 0.3, rotation: 0, z: 1, frameStyle: 'panel', pinned: true, mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 } },
    ] };
    const onFrameAddMedia = vi.fn();
    render(<EditCanvas layout={frame} media={new Map()} selectedId="f1" onSelect={() => {}} onCommit={() => {}} onFrameAddMedia={onFrameAddMedia} />);
    const add = document.querySelector('.slot-empty')!;
    act(() => { add.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    act(() => { add.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })); vi.runAllTimers(); });
    expect(onFrameAddMedia).toHaveBeenCalledWith('f1');
  } finally {
    vi.useRealTimers();
  }
});
