import { Link, useLocation, useNavigate } from 'react-router-dom';

import { getLang, useT } from '../i18n';
import { GUIDE } from './guideContent';

// **bold** → <strong>, nothing else.
const rich = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));

export default function Guide() {
  const back = (useLocation().state as { back?: boolean } | null)?.back; // opened from the editor in the installed app
  const navigate = useNavigate();
  useT(); // re-render on a language change
  const g = GUIDE[getLang()];
  return (
    <main className="guide">
      <header>
        <Link to="/" onClick={(e) => { if (back) { e.preventDefault(); navigate(-1); } }}>{back ? g.back : g.albums}</Link>
        <h1>{g.title}</h1>
      </header>
      <nav className="guide-toc" aria-label={g.toc}>
        {g.sections.map((s) => <a key={s.id} href={`#${s.id}`}>{s.title}</a>)}
        <a href="#shortcuts">{g.shortcutsTitle}</a>
      </nav>
      {g.sections.map((s) => (
        <section key={s.id} id={s.id}>
          <h2>{s.title}</h2>
          {s.features.map((f) => (
            <article key={f.h}>
              <h3>{f.h}</h3>
              {f.p.map((t, i) => <p key={i}>{rich(t)}</p>)}
              {f.img && <img className={f.img === 'phone' ? 'guide-shot phone' : 'guide-shot'} src={`/guide/${f.img}.jpg`} alt={f.h} loading="lazy" />}
            </article>
          ))}
        </section>
      ))}
      <section id="shortcuts">
        <h2>{g.shortcutsTitle}</h2>
        <table>
          <tbody>{g.shortcuts.map(([k, v]) => <tr key={k}><th scope="row"><kbd>{k}</kbd></th><td>{v}</td></tr>)}</tbody>
        </table>
      </section>
    </main>
  );
}
