import { useEffect, useState, type FormEvent } from 'react';
import { api, type AiSettingsDTO } from '../api';

// "AI (Gemini)" on /manage: the key for "New album → ✨ AI" (write-only), the model name, and a test call.
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function AiSettings() {
  const [s, setS] = useState<AiSettingsDTO | null>(null);
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const show = (v: AiSettingsDTO) => { setS(v); setModel(v.model ?? ''); };
  useEffect(() => { api.aiSettings().then(show, (e) => setMsg(errText(e))); }, []);
  const act = async (f: () => Promise<AiSettingsDTO | void>) => {
    setBusy(true);
    setMsg(null);
    try {
      const v = await f();
      if (v) show(v);
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const saveKey = (e: FormEvent) => {
    e.preventDefault();
    const k = key.trim();
    if (k) void act(async () => { const v = await api.saveAiSettings({ key: k }); setKey(''); return v; });
  };

  return (
    <section className="manage-card" id="ai">
      <h2>AI (Gemini)</h2>
      <p>Dùng cho “New album → ✨ AI”: mô tả ngắn, AI dựng sẵn các trang. Lấy key miễn phí tại Google AI Studio.</p>
      {!s ? <p>Đang tải…</p> : (
        <>
          <p>{s.hasKey ? <>Đã có key <b>••••{s.last4}</b></> : 'Chưa có key'}</p>
          <form className="loc-actions" onSubmit={saveKey}>
            <input type="password" aria-label="Gemini API key" placeholder={s.hasKey ? 'Dán key mới để thay' : 'Dán Gemini API key'}
              autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
            <button type="submit" disabled={busy || !key.trim()}>Lưu key</button>
          </form>
          <form className="loc-actions" onSubmit={(e) => { e.preventDefault(); void act(() => api.saveAiSettings({ model: model.trim() })); }}>
            <input aria-label="Gemini model" value={model} onChange={(e) => setModel(e.target.value)} />
            <button type="submit" disabled={busy || !model.trim() || model.trim() === s.model}>Lưu model</button>
          </form>
          <div className="loc-actions">
            <button type="button" disabled={busy || !s.hasKey} onClick={() => void act(async () => {
              const r = await api.testAi();
              setMsg(r.ok ? 'Key chạy tốt ✓' : r.error ?? 'Lỗi');
            })}>Thử</button>
            {s.hasKey && <button type="button" className="danger" disabled={busy} onClick={() => {
              if (window.confirm('Xoá Gemini key?')) void act(() => api.removeAiKey());
            }}>Xoá key</button>}
          </div>
        </>
      )}
      {msg && <p className="manage-hint" role="status">{msg}</p>}
    </section>
  );
}
