import { createRoot } from 'react-dom/client';
import { App } from './App';
import 'dockview-react/dist/styles/dockview.css';
import '@xterm/xterm/css/xterm.css';

// xterm.js (5.x) has a known race where a deferred internal callback
// (Viewport.syncScrollArea) reads renderService.dimensions on a
// terminal whose renderer was torn down mid-async. The throw escapes
// our try-catch boundaries (it's invoked from xterm's own scheduler),
// so we swallow it here as a last-resort net. Real bugs are still
// surfaced because we log them.
const XTERM_DIMENSIONS_RE = /Cannot read properties of undefined \(reading 'dimensions'\)/;
window.addEventListener('error', (e) => {
  if (XTERM_DIMENSIONS_RE.test(e.message ?? '')) {
    console.warn('[xterm] post-dispose dimensions access — suppressed', e.error);
    e.preventDefault();
    e.stopImmediatePropagation();
  }
});
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason instanceof Error ? e.reason.message : String(e.reason ?? '');
  if (XTERM_DIMENSIONS_RE.test(msg)) {
    console.warn('[xterm] post-dispose dimensions access (rejection) — suppressed', e.reason);
    e.preventDefault();
  }
});

const container = document.getElementById('root');
if (!container) throw new Error('#root missing');
// NOTE: StrictMode disabled intentionally — its mount/cleanup/remount
// pattern is hostile to external-resource managers like PTYs and
// xterm instances, and amplifies the race that produces the
// "dimensions" error above. We rely on production-equivalent behavior
// in dev.
createRoot(container).render(<App />);
