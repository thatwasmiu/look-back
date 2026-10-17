import { useCallback, useEffect, useRef, useState } from 'react';
import type { PageLayout } from '@scrapbook/shared';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

// Debounced save of the current page. A pageId change means "a different page was loaded": its layout becomes
// the saved baseline (callers flush() before switching so the previous page's edits are never dropped).
// Also flushes when the tab goes hidden and on unmount (route leave).
export function useAutosave(
  pageId: string, layout: PageLayout, save: (id: string, l: PageLayout) => Promise<unknown>, delayMs = 1000,
): { status: SaveStatus; flush(): Promise<void> } {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const base = useRef({ pageId, layout });
  const pending = useRef<{ id: string; layout: PageLayout } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    setStatus('saving');
    try {
      await saveRef.current(p.id, p.layout);
      if (!pending.current) setStatus('saved'); // else a newer edit arrived mid-save and is already scheduled
    } catch {
      if (!pending.current) pending.current = p; // keep it: the next flush or edit retries
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (base.current.pageId !== pageId) {
      base.current = { pageId, layout };
      setStatus('saved');
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
    const onHide = () => { if (document.visibilityState === 'hidden') void flush(); };
    document.addEventListener('visibilitychange', onHide);
    return () => { document.removeEventListener('visibilitychange', onHide); void flush(); };
  }, [flush]);

  return { status, flush };
}
