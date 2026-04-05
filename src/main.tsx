import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

const isZoomHotkey = (event: KeyboardEvent) => {
  if (!(event.ctrlKey || event.metaKey)) return false;
  return event.key === '+' || event.key === '-' || event.key === '=' || event.key === '0';
};

const shouldBlockPageZoom = () => {
  return document.documentElement.dataset.imagePreviewOpen !== '1';
};

window.addEventListener(
  'wheel',
  (event) => {
    if ((event.ctrlKey || event.metaKey) && shouldBlockPageZoom()) {
      event.preventDefault();
    }
  },
  { passive: false }
);

window.addEventListener('keydown', (event) => {
  if (isZoomHotkey(event) && shouldBlockPageZoom()) {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
