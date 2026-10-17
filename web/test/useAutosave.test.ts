import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { PageLayout } from '@scrapbook/shared';
import { useAutosave } from '../src/editor/useAutosave';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const L = (n: number): PageLayout => ({ background: 'paper-cream', elements: Array.from({ length: n }, (_, i) => ({
  type: 'tape', id: `t${i}`, x: 0, y: 0, w: 0.1, h: 0.1, rotation: 0, z: i, tapeStyle: 'yellow',
})) });

const setup = (save: (id: string, l: PageLayout) => Promise<unknown>) =>
  renderHook(({ id, layout }) => useAutosave(id, layout, save), { initialProps: { id: 'p1', layout: L(0) } });

test('two changes within 1000 ms → one save with the latest layout', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const { result, rerender } = setup(save);
  expect(result.current.status).toBe('saved');
  const latest = L(2);
  rerender({ id: 'p1', layout: L(1) });
  expect(result.current.status).toBe('unsaved');
  await act(() => vi.advanceTimersByTimeAsync(500));
  rerender({ id: 'p1', layout: latest });
  await act(() => vi.advanceTimersByTimeAsync(999));
  expect(save).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith('p1', latest);
  expect(result.current.status).toBe('saved');
});

test('flush() saves immediately and cancels the pending timer', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const { result, rerender } = setup(save);
  const l = L(1);
  rerender({ id: 'p1', layout: l });
  await act(() => result.current.flush());
  expect(save).toHaveBeenCalledWith('p1', l);
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(save).toHaveBeenCalledTimes(1);
  await act(() => result.current.flush()); // nothing pending
  expect(save).toHaveBeenCalledTimes(1);
});

test('failed save → status error', async () => {
  const save = vi.fn().mockRejectedValue(new Error('500'));
  const { result, rerender } = setup(save);
  rerender({ id: 'p1', layout: L(1) });
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(result.current.status).toBe('error');
});

test('switching page resets: the new page layout is not saved', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const { result, rerender } = setup(save);
  rerender({ id: 'p2', layout: L(3) });
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(save).not.toHaveBeenCalled();
  expect(result.current.status).toBe('saved');
});
