import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import 'dockview-react/dist/styles/dockview.css';
import '@xterm/xterm/css/xterm.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root missing');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
