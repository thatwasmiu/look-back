import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { lastGuestLink, parseShareInput } from '../guestLink';

export default function Login() {
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  // Someone else's album (an edit or view link): no password, just the link or its code.
  const last = lastGuestLink();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  async function openCode(e: FormEvent) {
    e.preventDefault();
    const p = parseShareInput(code);
    if (!p) return setCodeError('Link hoặc mã không đúng — dán nguyên link được gửi cho bạn.');
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
      setError(s === 401 ? 'Sai mật khẩu' : s === 429 ? 'Thử sai quá nhiều lần, hãy thử lại sau' : 'Có lỗi xảy ra');
    }
  }

  return (
    <main className="login">
      <form className="paper-card" onSubmit={submit}>
        <img className="brand-logo brand-logo-lg" src="/brand/logo.svg" alt="" />
        <h1>Look Back</h1>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </label>
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit">Enter</button>
      </form>
      <form className="paper-card share-code" onSubmit={openCode}>
        <h2>Được chia sẻ album?</h2>
        {last && <button type="button" onClick={() => nav(last)}>Mở album được chia sẻ lần trước</button>}
        <label>
          Link hoặc mã chia sẻ
          <input value={code} onChange={(e) => { setCode(e.target.value); setCodeError(''); }} placeholder="Dán link được gửi cho bạn" autoComplete="off" />
        </label>
        {codeError && <p role="alert" className="error">{codeError}</p>}
        <button type="submit" className="secondary">Mở</button>
      </form>
    </main>
  );
}
