import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { THEME } from './config.js';
import './styles/app.css';

document.documentElement.dataset.theme = THEME;
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME === 'gold' ? '#1c120a' : '#f7d9f0');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
