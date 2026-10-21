import { useState } from 'react';
import { api, type ManagedFile, type StorageLocation } from '../api';
import { useT } from '../i18n';

// "Chuyển sang…": move the selected files to the VPS or a healthy bucket (not where they all already are).
export function MoveBar({ selected, locations, onMoved }: { selected: ManagedFile[]; locations: StorageLocation[]; onMoved(): void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const here = new Set(selected.map((f) => f.location ?? 'local'));
  const targets = [{ id: 'local', name: 'VPS' }, ...locations.filter((l) => l.status === 'ok')]
    .filter((t) => !(here.size === 1 && here.has(t.id)));
  const move = (to: string) => {
    setError(null);
    api.moveMedia(selected.map((f) => f.id), to).then(() => { setOpen(false); onMoved(); },
      (e) => setError(e instanceof Error ? e.message : String(e)));
  };
  return (
    <span className="move-bar">
      <button type="button" disabled={!selected.length} aria-expanded={open} onClick={() => setOpen(!open)}>{t('Move to…')}</button>
      {open && (
        <span className="move-targets" role="menu">
          {targets.map((t) => <button key={t.id} type="button" role="menuitem" onClick={() => move(t.id)}>{t.name}</button>)}
          {!targets.length && <small>{t('No usable location yet.')}</small>}
        </span>
      )}
      {error && <span className="error" role="alert">{error}</span>}
    </span>
  );
}
