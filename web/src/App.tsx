import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { UpdateNotice } from './UpdateNotice';
import { api } from './api';
import Login from './pages/Login';
import AlbumList from './pages/AlbumList';
import Viewer from './pages/Viewer';
import Editor from './pages/Editor';
import SharedAlbum from './pages/SharedAlbum';
import GuestEdit from './pages/GuestEdit';
import Guide from './pages/Guide';
import PrintAlbum from './pages/PrintAlbum';
import { t } from './i18n';

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
  if (state === 'down') return <p className="empty">{t("Couldn't reach the server. Try again later.")}</p>;
  return state === 'ok' ? <Outlet /> : <Navigate to="/login" replace />;
}

// The hidden /manage page is its own chunk: album viewers (and installed apps) never download it.
const Manage = lazy(() => import('./pages/Manage'));

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/s/:token" element={<SharedAlbum />} /> {/* public share link: outside the login gate */}
        <Route path="/e/:token" element={<GuestEdit />} /> {/* edit link: outside the login gate too */}
        {Preview && <Route path="/dev/preview" element={<Suspense><Preview /></Suspense>} />}
        {ViewerPreview && <Route path="/dev/viewer" element={<Suspense><ViewerPreview /></Suspense>} />}
        {TemplatesPreview && <Route path="/dev/templates" element={<Suspense><TemplatesPreview /></Suspense>} />}
        {EditorPreview && <Route path="/dev/editor" element={<Suspense><EditorPreview /></Suspense>} />}
        <Route element={<Gate />}>
          <Route path="/" element={<AlbumList />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/albums/:id" element={<Viewer />} />
          <Route path="/albums/:id/edit" element={<Editor />} />
          <Route path="/albums/:id/print" element={<PrintAlbum />} />
          <Route path="/manage" element={<Suspense><Manage /></Suspense>} /> {/* hidden: linked from nowhere */}
        </Route>
      </Routes>
      <UpdateNotice />
    </BrowserRouter>
  );
}
