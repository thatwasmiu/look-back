import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { api } from './api';
import Login from './pages/Login';
import AlbumList from './pages/AlbumList';

// Placeholders until the viewer/editor tasks.
const Viewer = () => <p>Viewer {useParams().id}</p>;
const Editor = () => <p>Editor {useParams().id}</p>;

function Gate({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => { api.check().then(setOk); }, []);
  if (ok === null) return null;
  return ok ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Gate><AlbumList /></Gate>} />
        <Route path="/albums/:id" element={<Gate><Viewer /></Gate>} />
        <Route path="/albums/:id/edit" element={<Gate><Editor /></Gate>} />
      </Routes>
    </BrowserRouter>
  );
}
