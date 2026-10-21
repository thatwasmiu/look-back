import { useEffect, useState, type FormEvent } from 'react';
import { api, type AiSettingsDTO } from '../api';
import { useT } from '../i18n';

// "AI (Gemini)" on /manage: the key for "New album → ✨ AI" (write-only), the model name, and a test call.
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function AiSettings() {
  const t = useT();
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
      <p>{t('For “New album → ✨ AI”: a short description, and the AI builds the pages. Get a free key at Google AI Studio.')}</p>
      {!s ? <p>{t('Loading…')}</p> : (
        <>
          <p>{s.hasKey ? <>{t('Key saved')} <b>••••{s.last4}</b></> : t('No key yet')}</p>
          <form className="loc-actions" onSubmit={saveKey}>
            <input type="password" aria-label="Gemini API key" placeholder={t(s.hasKey ? 'Paste a new key to replace it' : 'Paste a Gemini API key')}
              autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
            <button type="submit" disabled={busy || !key.trim()}>{t('Save key')}</button>
          </form>
          <form className="loc-actions" onSubmit={(e) => { e.preventDefault(); void act(() => api.saveAiSettings({ model: model.trim() })); }}>
            <input aria-label="Gemini model" value={model} onChange={(e) => setModel(e.target.value)} />
            <button type="submit" disabled={busy || !model.trim() || model.trim() === s.model}>{t('Save model')}</button>
          </form>
          <div className="loc-actions">
            <button type="button" disabled={busy || !s.hasKey} onClick={() => void act(async () => {
              const r = await api.testAi();
              setMsg(r.ok ? t('The key works ✓') : r.error ?? t('Error'));
            })}>{t('Test')}</button>
            {s.hasKey && <button type="button" className="danger" disabled={busy} onClick={() => {
              if (window.confirm(t('Remove the Gemini key?'))) void act(() => api.removeAiKey());
            }}>{t('Remove key')}</button>}
          </div>
        </>
      )}
      {msg && <p className="manage-hint" role="status">{msg}</p>}
    </section>
  );
}
