export type History<T> = { past: T[]; present: T; future: T[] };

const CAP = 100;

export const initHistory = <T>(v: T): History<T> => ({ past: [], present: v, future: [] });

export const push = <T>(h: History<T>, v: T): History<T> =>
  ({ past: [...h.past, h.present].slice(-CAP), present: v, future: [] });

export const undo = <T>(h: History<T>): History<T> =>
  h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h;

export const redo = <T>(h: History<T>): History<T> =>
  h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h;
