import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource/dancing-script/latin.css';
import '@fontsource/dancing-script/vietnamese.css';
import '@fontsource/patrick-hand/latin.css';
import '@fontsource/patrick-hand/vietnamese.css';
import './styles.css';
import './cqPolyfill';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
