import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { UpdateNotice } from './UpdateNotice';
import { api } from './api';
import Login from './pages/Login';
import AlbumList from './pages/AlbumList';
import Viewer from './pages/Viewer';
import Editor from './pages/Editor';
import SharedAlbum from './pages/SharedAlbum';
import Guide from './pages/Guide';

// Dev-only renderer/viewer showcases; import.meta.env.DEV is false in builds, so they're tree-shaken out.
const Preview = import.meta.env.DEV ? lazy(() => import('./dev/Preview')) : null;
const ViewerPreview = import.meta.env.DEV ? lazy(() => import('./dev/ViewerPreview')) : null;
const TemplatesPreview = import.meta.env.DEV ? lazy(() => import('./dev/Templates')) : null;
const EditorPreview = import.meta.env.DEV ? lazy(() => import('./dev/EditorPreview')) : null;

// Layout route: check() runs once on load for all protected routes.
function Gate() {
  const [state, setState] = useState<'wait' | 'ok' | 'out' | 'down'>('wait');
  useEffect(() => {
    api.check().then((ok) => setState(ok ? 'ok' : 'out'), () => setState('down'));
  }, []);
  if (state === 'wait') return null;
  if (state === 'down') return <p className="empty">Không kết nối được server</p>;
  return state === 'ok' ? <Outlet /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/s/:token" element={<SharedAlbum />} /> {/* public share link: outside the login gate */}
        {Preview && <Route path="/dev/preview" element={<Suspense><Preview /></Suspense>} />}
        {ViewerPreview && <Route path="/dev/viewer" element={<Suspense><ViewerPreview /></Suspense>} />}
        {TemplatesPreview && <Route path="/dev/templates" element={<Suspense><TemplatesPreview /></Suspense>} />}
        {EditorPreview && <Route path="/dev/editor" element={<Suspense><EditorPreview /></Suspense>} />}
        <Route element={<Gate />}>
          <Route path="/" element={<AlbumList />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/albums/:id" element={<Viewer />} />
          <Route path="/albums/:id/edit" element={<Editor />} />
        </Route>
      </Routes>
      <UpdateNotice />
    </BrowserRouter>
  );
}
