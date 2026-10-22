import { useCallback, useEffect, useRef, useState } from 'react';
import type { PageLayout } from '@scrapbook/shared';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';
type Save = (id: string, l: PageLayout, opts?: { keepalive?: boolean }) => Promise<unknown>;

// Debounced save of the current page. Saves run one at a time (a newer save never races an older one), and
// flush() resolves true only once everything edited so far is saved: callers must not switch/delete/leave on false.
// A pageId change means "a different page was loaded": its layout becomes the baseline. A failed save stays
// pending (with its own page id) until a later flush succeeds. Tab hidden / unmount flush with fetch keepalive.
export function useAutosave(pageId: string, layout: PageLayout, save: Save, delayMs = 1000):
  { status: SaveStatus; flush(opts?: { keepalive?: boolean }): Promise<boolean>; reset(layout: PageLayout): void } {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const base = useRef({ pageId, layout });
  const pending = useRef<{ id: string; layout: PageLayout } | null>(null);
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback((opts?: { keepalive?: boolean }) => {
    clearTimeout(timer.current);
    chain.current = chain.current.then(async () => {
      while (pending.current) {
        const p = pending.current;
        pending.current = null;
        setStatus('saving');
        try {
          await (opts ? saveRef.current(p.id, p.layout, opts) : saveRef.current(p.id, p.layout));
        } catch {
          if (!pending.current) pending.current = p; // a newer edit supersedes it; else keep it for the retry
          setStatus('error');
          return false;
        }
      }
      setStatus('saved');
      return true;
    });
    return chain.current;
  }, []);

  // The page was replaced from outside (someone else's newer version): it is the baseline now, unsaved edits dropped.
  const reset = useCallback((l: PageLayout) => {
    base.current = { pageId: base.current.pageId, layout: l };
    if (pending.current?.id === base.current.pageId) pending.current = null;
    clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (base.current.pageId !== pageId) {
      base.current = { pageId, layout };
      if (!pending.current) setStatus('saved');
      return;
    }
    if (base.current.layout === layout) return;
    base.current.layout = layout;
    pending.current = { id: pageId, layout };
    setStatus('unsaved');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, delayMs);
  }, [pageId, layout, delayMs, flush]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') void flush({ keepalive: true }); };
    document.addEventListener('visibilitychange', onHide);
    return () => { document.removeEventListener('visibilitychange', onHide); void flush({ keepalive: true }); };
  }, [flush]);

  return { status, flush, reset };
}
