import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom';
import { api } from './api';
import Login from './pages/Login';
import AlbumList from './pages/AlbumList';
import Viewer from './pages/Viewer';

// Placeholder until the editor task.
const Editor = () => <p>Editor {useParams().id}</p>;

// Dev-only renderer/viewer showcases; import.meta.env.DEV is false in builds, so they're tree-shaken out.
const Preview = import.meta.env.DEV ? lazy(() => import('./dev/Preview')) : null;
const ViewerPreview = import.meta.env.DEV ? lazy(() => import('./dev/ViewerPreview')) : null;

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
        {ViewerPreview && <Route path="/dev/viewer" element={<Suspense><ViewerPreview /></Suspense>} />}
        <Route element={<Gate />}>
          <Route path="/" element={<AlbumList />} />
          <Route path="/albums/:id" element={<Viewer />} />
          <Route path="/albums/:id/edit" element={<Editor />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
