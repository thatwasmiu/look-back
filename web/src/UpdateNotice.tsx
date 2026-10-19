import { useEffect, useState } from 'react';

// Set by vite.config.ts: the build time of this bundle ('dev' on the dev server). Each build also writes
// /version.json with the same value.
declare const __APP_VERSION__: string;

// A newer build is on the server: offer a reload. Checked only on open and when the app comes back to the
// foreground (no timer: one tiny request per visit). "Để sau" hides it until the next new build.
export function UpdateNotice({ current = __APP_VERSION__ }: { current?: string }) {
  const [latest, setLatest] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    if (current === 'dev') return;
    const check = () => document.visibilityState === 'hidden' ? undefined : fetch('/version.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { version?: string } | null) => { if (d?.version && d.version !== current) setLatest(d.version); }, () => {});
    const onVisible = () => void check();
    void check();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [current]);

  if (!latest || latest === dismissed) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="update-h">
        <h2 id="update-h">Có bản cập nhật mới</h2>
        <p>Tải lại để dùng phiên bản mới nhất. Nếu đang trang trí, chờ chữ “Saved” rồi hãy cập nhật.</p>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={() => setDismissed(latest)}>Để sau</button>
          <button type="button" onClick={() => window.location.reload()} autoFocus>Cập nhật</button>
        </div>
      </div>
    </div>
  );
}
