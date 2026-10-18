import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';

export default function Login() {
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

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
    </main>
  );
}
