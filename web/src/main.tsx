import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource/caveat/latin.css';
import '@fontsource/caveat/latin-ext.css';
import '@fontsource/patrick-hand/latin.css';
import '@fontsource/patrick-hand/vietnamese.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
