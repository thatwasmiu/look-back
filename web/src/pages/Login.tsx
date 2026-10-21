import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { lastGuestLink, parseShareInput } from '../guestLink';
import { LangSwitch, useT } from '../i18n';

export default function Login() {
  const nav = useNavigate();
  const t = useT();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  // Someone else's album (an edit or view link): no password, just the link or its code.
  const last = lastGuestLink();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  async function openCode(e: FormEvent) {
    e.preventDefault();
    const p = parseShareInput(code);
    if (!p) return setCodeError(t("That link or code doesn't look right — paste the whole link you were sent."));
    if (p.startsWith('/')) return nav(p);
    // A bare code: an edit link if it opens as one, else a view link (which says so if it's wrong too).
    const edit = await api.openEditLink(p).then(() => true, () => false);
    nav(edit ? `/e/${p}` : `/s/${p}`);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.login(password);
      nav('/');
    } catch (err) {
      const s = err instanceof ApiError ? err.status : 0;
      setError(t(s === 401 ? 'Wrong password' : s === 429 ? 'Too many tries — try again later' : 'Something went wrong'));
    }
  }

  return (
    <main className="login">
      <form className="paper-card" onSubmit={submit}>
        <img className="brand-logo brand-logo-lg" src="/brand/logo.svg" alt="" />
        <h1>Look Back</h1>
        <LangSwitch className="login-lang" />
        <label>
          {t('Password')}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </label>
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit">{t('Enter')}</button>
      </form>
      <form className="paper-card share-code" onSubmit={openCode}>
        <h2>{t('Shared an album with you?')}</h2>
        {last && <button type="button" onClick={() => nav(last)}>{t('Open the last shared album')}</button>}
        <label>
          {t('Shared link or code')}
          <input value={code} onChange={(e) => { setCode(e.target.value); setCodeError(''); }} placeholder={t('Paste the link you were sent')} autoComplete="off" />
        </label>
        {codeError && <p role="alert" className="error">{codeError}</p>}
        <button type="submit" className="secondary">{t('Open')}</button>
      </form>
    </main>
  );
}
