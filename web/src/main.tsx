import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource/dancing-script/latin.css';
import '@fontsource/dancing-script/vietnamese.css';
import '@fontsource/patrick-hand/latin.css';
import '@fontsource/patrick-hand/vietnamese.css';
import '@fontsource/bangers/latin.css';
import '@fontsource/bangers/vietnamese.css';
import './styles.css';
import './cqPolyfill';

// Offline viewing (public/sw.js). Production only: in dev it would serve stale modules.
if (import.meta.env.PROD && 'serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => {});

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
