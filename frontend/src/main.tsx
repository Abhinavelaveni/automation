import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import DisableDevtool from 'disable-devtool';
import App from './App';
import './styles/global.css';

DisableDevtool({
  disableMenu: true,
  disableSelect: false,
  disableCopy: false,
  disableCut: false,
  disablePaste: false,
  interval: 300,
  url: 'about:blank',
  timeOutUrl: 'about:blank',
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
