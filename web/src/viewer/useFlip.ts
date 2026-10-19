import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type PointerEvent } from 'react';
import { nextIndex, prevIndex, visiblePages } from './spread';

export const FLIP_MS = 350;
const SWIPE_PX = 50;
const SPREAD_QUERY = '(min-width: 900px) and (orientation: landscape)';

export function useSpread(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia(SPREAD_QUERY);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => matchMedia(SPREAD_QUERY).matches,
  );
}

export type Turn = { from: number[]; dir: 1 | -1 };

// Page index + the outgoing pages of the turn in progress (null when idle or with reduced motion).
// rtl: right-to-left reading (manga) — the physical inputs mirror: ← / swipe right / left edge go forward.
// startPage: the page to open on (Done in the editor comes back to the page that was being edited).
export function useFlip(total: number, spread: boolean, rtl = false, startPage = 0) {
  const [index, setIndex] = useState(() => Math.min(Math.max(0, startPage), Math.max(0, total - 1)));
  const [turn, setTurn] = useState<Turn | null>(null);
  const timer = useRef<number>();
  const visible = visiblePages(index, total, spread);

  const go = (dir: 1 | -1) => {
    const n = dir > 0 ? nextIndex(index, total, spread) : prevIndex(index, total, spread);
    if (visiblePages(n, total, spread)[0] === visible[0]) return;
    clearTimeout(timer.current);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) setTurn(null);
    else {
      setTurn({ from: visible, dir });
      timer.current = window.setTimeout(() => setTurn(null), FLIP_MS);
    }
    setIndex(n);
  };
  const goRef = useRef(go);
  goRef.current = go;
  const rtlRef = useRef(rtl);
  rtlRef.current = rtl;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if ((e.target as Element | null)?.closest?.('input, textarea, select, video')) return; // video: arrows seek
      if (e.key === 'ArrowRight') goRef.current(rtlRef.current ? -1 : 1);
      else if (e.key === 'ArrowLeft') goRef.current(rtlRef.current ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(timer.current); };
  }, []);

  // Horizontal swipe; mostly-vertical drags and drags on a playing <video> (its seek bar) are ignored.
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const swipe = {
    onPointerDown: (e: PointerEvent) => {
      swiped.current = false;
      start.current = e.isPrimary && !(e.target as Element).closest('video') ? { x: e.clientX, y: e.clientY } : null;
    },
    onPointerUp: (e: PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
        swiped.current = true;
        goRef.current((dx < 0) !== rtlRef.current ? 1 : -1);
      }
    },
    onPointerCancel: () => { start.current = null; },
    // A swipe that ends on the play button must not also start the video.
    onClickCapture: (e: MouseEvent) => {
      if (swiped.current) { swiped.current = false; e.stopPropagation(); e.preventDefault(); }
    },
  };

  return { index, visible, turn, go, swipe };
}
