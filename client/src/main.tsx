import 'leaflet/dist/leaflet.css';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import ServerWaking from './components/ServerWaking.tsx';
import { followDeviceTheme } from './lib/theme.ts';

followDeviceTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <ServerWaking />
  </StrictMode>,
);
