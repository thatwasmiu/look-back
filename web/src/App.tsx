import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom';
import { api } from './api';
import Login from './pages/Login';
import AlbumList from './pages/AlbumList';

// Placeholders until the viewer/editor tasks.
const Viewer = () => <p>Viewer {useParams().id}</p>;
const Editor = () => <p>Editor {useParams().id}</p>;

// Dev-only renderer showcase; import.meta.env.DEV is false in builds, so it's tree-shaken out.
const Preview = import.meta.env.DEV ? lazy(() => import('./dev/Preview')) : null;

// Layout route: check() runs once on load for all protected routes.
function Gate() {
  const [state, setState] = useState<'wait' | 'ok' | 'out' | 'down'>('wait');
  useEffect(() => {
    api.check().then((ok) => setState(ok ? 'ok' : 'out'), () => setState('down'));
  }, []);
  if (state === 'wait') return null;
  if (state === 'down') return <p className="empty">Can't reach server</p>;
  return state === 'ok' ? <Outlet /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        {Preview && <Route path="/dev/preview" element={<Suspense><Preview /></Suspense>} />}
        <Route element={<Gate />}>
          <Route path="/" element={<AlbumList />} />
          <Route path="/albums/:id" element={<Viewer />} />
          <Route path="/albums/:id/edit" element={<Editor />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
