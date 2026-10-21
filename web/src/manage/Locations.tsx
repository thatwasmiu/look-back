import { useState, type FormEvent } from 'react';
import { api, type NewLocation, type StorageLocation } from '../api';
import { fmtBytes } from './fmtBytes';
import { t as tt, useT } from '../i18n';

// "Nơi lưu" on /manage: the VPS disk plus the owner's buckets — add, check, re-key, cap, remove, drop.
const PRESETS = {
  r2: { label: 'Cloudflare R2', endpoint: 'https://<account-id>.r2.cloudflarestorage.com', region: 'auto' },
  b2: { label: 'Backblaze B2', endpoint: 'https://s3.<region>.backblazeb2.com', region: '' },
  s3: { label: 'Other S3', endpoint: 'https://', region: 'auto' },
} as const;
type Preset = keyof typeof PRESETS;

export const statusText = (l: StorageLocation) =>
  l.status === 'ok' ? 'OK' : l.status === 'needs-keys' ? tt('keys needed again') : tt("Can't connect: {error}", { error: l.statusMessage ?? '' });
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Props = { locations: StorageLocation[]; disk: { total: number; free: number }; vpsBytes: number; vpsFiles: number; reload(): void };

export function Locations({ locations, disk, vpsBytes, vpsFiles, reload }: Props) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [dropping, setDropping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = (f: () => Promise<unknown>) => { setError(null); f().then(reload, (e) => setError(errText(e))); };

  return (
    <section className="manage-card">
      <h2>{t('Storage locations')}</h2>
      <table className="manage-table">
        <thead><tr><th>{t('Location')}</th><th>{t('Files')}</th><th>{t('Used')}</th><th>{t('Status')}</th></tr></thead>
        <tbody>
          <tr><td>VPS</td><td>{vpsFiles}</td><td>{fmtBytes(vpsBytes)} · {t('free')} {fmtBytes(disk.free)}</td><td>OK</td></tr>
          {locations.map((l) => (
            <tr key={l.id}>
              <td>{l.name}<br /><small>{l.bucket}</small></td>
              <td>{l.files}</td>
              <td>{fmtBytes(l.bytes)}{l.capBytes ? ` / ${fmtBytes(l.capBytes)}` : ''}</td>
              <td className={l.status === 'ok' ? '' : 'error'}>
                {statusText(l)}
                <div className="loc-actions">
                  <button type="button" onClick={() => run(() => api.checkLocation(l.id))}>{t('Check')}</button>
                  <button type="button" onClick={() => setEditing(editing === l.id ? null : l.id)}>{t('Edit')}</button>
                  <button type="button" disabled={l.files + l.pendingDeletes > 0} title={t('Can only be removed when it holds no files')}
                    onClick={() => run(() => api.deleteLocation(l.id))}>{t('Delete')}</button>
                  <button type="button" className="danger" onClick={() => setDropping(dropping === l.id ? null : l.id)}>{t('Drop this location')}</button>
                </div>
                {editing === l.id && <EditForm l={l} onDone={() => { setEditing(null); reload(); }} />}
                {dropping === l.id && <DropForm l={l} onDone={() => { setDropping(null); reload(); }} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p className="error" role="alert">{error}</p>}
      {adding ? <AddForm onDone={() => { setAdding(false); reload(); }} onCancel={() => setAdding(false)} />
        : <button type="button" className="btn" onClick={() => setAdding(true)}>+ {t('Add a location')}</button>}
    </section>
  );
}

function AddForm({ onDone, onCancel }: { onDone(): void; onCancel(): void }) {
  const t = useT();
  const [preset, setPreset] = useState<Preset>('r2');
  const [f, setF] = useState({ name: '', endpoint: PRESETS.r2.endpoint as string, region: PRESETS.r2.region as string, bucket: '', accessKeyId: '', secretAccessKey: '', capGb: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const pick = (p: Preset) => { setPreset(p); setF({ ...f, endpoint: PRESETS[p].endpoint, region: PRESETS[p].region }); };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body: NewLocation = { name: f.name.trim(), endpoint: f.endpoint.trim(), bucket: f.bucket.trim(), accessKeyId: f.accessKeyId.trim(),
      secretAccessKey: f.secretAccessKey, ...(f.region.trim() && { region: f.region.trim() }), ...(f.capGb && { capBytes: Math.round(Number(f.capGb) * 2 ** 30) }) };
    try {
      await api.addLocation(body);
      onDone();
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };
  const cors = JSON.stringify([{ AllowedOrigins: [window.location.origin], AllowedMethods: ['GET', 'HEAD'], AllowedHeaders: ['*'], MaxAgeSeconds: 3600 }]);
  return (
    <form className="loc-form" onSubmit={submit}>
      <div className="mode-switch" role="radiogroup" aria-label={t('Type')}>
        {(Object.keys(PRESETS) as Preset[]).map((p) => <button key={p} type="button" role="radio" aria-checked={preset === p} onClick={() => pick(p)}>{t(PRESETS[p].label)}</button>)}
      </div>
      <label>{t('Name')}<input required value={f.name} onChange={set('name')} placeholder={t('My R2')} /></label>
      <label>Endpoint<input required value={f.endpoint} onChange={set('endpoint')} /></label>
      <label>Region<input value={f.region} onChange={set('region')} placeholder="auto" /></label>
      <label>Bucket<input required value={f.bucket} onChange={set('bucket')} /></label>
      <label>Access key ID<input required value={f.accessKeyId} onChange={set('accessKeyId')} autoComplete="off" /></label>
      <label>Secret key<input required type="password" value={f.secretAccessKey} onChange={set('secretAccessKey')} autoComplete="new-password" /></label>
      <label>{t('Cap (GB, optional)')}<input type="number" min="0.1" step="0.1" value={f.capGb} onChange={set('capGb')} /></label>
      <p className="manage-hint">{t("Turn on CORS for the bucket (for videos and offline viewing) — paste this rule in the bucket's settings:")}</p>
      <code className="cors-rule">{cors}</code>
      <p className="manage-hint">{t("Keys are stored encrypted and never shown again. On save the app writes, reads and deletes a small test file; if that fails nothing is saved.")}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="secondary" onClick={onCancel}>{t('Cancel')}</button>
        <button type="submit" disabled={busy}>{busy ? t('Checking…') : t('Save')}</button>
      </div>
    </form>
  );
}

function EditForm({ l, onDone }: { l: StorageLocation; onDone(): void }) {
  const t = useT();
  const [name, setName] = useState(l.name);
  const [capGb, setCapGb] = useState(l.capBytes ? String(Math.round((l.capBytes / 2 ** 30) * 10) / 10) : '');
  const [accessKeyId, setKeyId] = useState('');
  const [secretAccessKey, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    api.updateLocation(l.id, {
      name: name.trim(), capBytes: capGb ? Math.round(Number(capGb) * 2 ** 30) : null,
      ...(accessKeyId && { accessKeyId }), ...(secretAccessKey && { secretAccessKey }),
    }).then(onDone, (err) => setError(errText(err)));
  };
  return (
    <form className="loc-form" onSubmit={submit}>
      <label>{t('Name')}<input required value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>{t('Cap (GB)')}<input type="number" min="0.1" step="0.1" value={capGb} onChange={(e) => setCapGb(e.target.value)} /></label>
      <label>{t('New access key ID')}<input value={accessKeyId} onChange={(e) => setKeyId(e.target.value)} placeholder={l.accessKeyId} autoComplete="off" /></label>
      <label>{t('New secret key')}<input type="password" value={secretAccessKey} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit">{t('Save changes')}</button>
    </form>
  );
}

function DropForm({ l, onDone }: { l: StorageLocation; onDone(): void }) {
  const t = useT();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="inline-confirm" role="alert">
      {t('The {n} files stored here are lost for good. Type the location name to confirm.', { n: l.files })}
      <input aria-label={t('Location name')} value={typed} onChange={(e) => setTyped(e.target.value)} />
      <button type="button" className="danger" disabled={typed !== l.name}
        onClick={() => api.dropLocation(l.id, typed).then(onDone, (err) => setError(errText(err)))}>{t('Drop location')}</button>
      {error && <span className="error">{error}</span>}
    </div>
  );
}
