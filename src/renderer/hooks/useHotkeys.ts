import { useHotkeys } from 'react-hotkeys-hook';
import { useLayoutPrefs } from '../stores/layout';
import { useDockview } from '../stores/dockview';

const mod = navigator.platform.toLowerCase().includes('mac') ? 'meta' : 'ctrl';

// react-hotkeys-hook v4 swallows events when focus is inside <input>/<textarea>/<select>.
// xterm uses a textarea, so without this every shortcut silently fails while the
// terminal has focus. We need our app-level chords to work everywhere.
const opts = { enableOnFormTags: true as const, enableOnContentEditable: true as const, preventDefault: true };

export function useGlobalHotkeys(): void {
  const toggleLeft = useLayoutPrefs((s) => s.toggleLeft);

  useHotkeys(`${mod}+b`, () => toggleLeft(), opts);
  useHotkeys(`${mod}+shift+enter`, () => useDockview.getState().toggleZoom(), opts);

  // new terminal as a tab in the active group
  useHotkeys(`${mod}+t`, () => void useDockview.getState().createTerminal(), opts);

  // close current pane (⌘⌫ is reserved for shell "kill whole line" — see TerminalView)
  useHotkeys(`${mod}+w`, () => useDockview.getState().closeFocused(), opts);

  // splits (4 directions)
  useHotkeys(`${mod}+d`, () => useDockview.getState().splitFocused('right'), opts);
  useHotkeys(`${mod}+shift+d`, () => useDockview.getState().splitFocused('below'), opts);
  useHotkeys(`${mod}+alt+d`, () => useDockview.getState().splitFocused('left'), opts);
  useHotkeys(`${mod}+alt+shift+d`, () => useDockview.getState().splitFocused('above'), opts);

  // directional focus
  useHotkeys(`${mod}+alt+left`, () => useDockview.getState().focusDirection('left'), opts);
  useHotkeys(`${mod}+alt+right`, () => useDockview.getState().focusDirection('right'), opts);
  useHotkeys(`${mod}+alt+up`, () => useDockview.getState().focusDirection('up'), opts);
  useHotkeys(`${mod}+alt+down`, () => useDockview.getState().focusDirection('down'), opts);
}
