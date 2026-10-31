// The Keyboard shortcuts reference (a read-only list: shortcuts cannot be
// rebound). The list is GENERATED: every candidate keystroke is run through the app's own pure key classifiers, the same
// functions the App listener calls (classifyWorkspaceKey, heldKeyCommand, replayShortcut, symbolEntryFromKey,
// classifyPaperShortcut, isMaximizeChord), and each binding they return becomes a row. A binding added to or removed from a
// classifier therefore appears in or leaves the list without editing this file. The keys handled inline in App, ChartPanel and
// the Electron main process have no pure classifier; LISTENER_ONLY_KEYS names them and a test checks them against the source.
// RENDERER_KEYS names the keys the chart renderer handles, checked against the pinned renderer bundle.
// Grouping, row wording and order are our own choice.
import { classifyWorkspaceKey, type FocusContext, type WorkspaceCommand, type WorkspaceKeyEvent } from './shortcut-dispatch';
import { heldKeyCommand, type HeldKeyCommand } from './held-key-gate';
import { classifyPaperShortcut } from './paper-shortcuts';
import { symbolEntryFromKey } from './symbol-search';
import { isMaximizeChord, isChartCycleKey } from './MultiChartGrid';
import { replayShortcut, type ReplaySession } from '../domain/replay-session';

// The shortcut groups, including a Watchlist group.
export type ShortcutGroup = 'General' | 'Chart' | 'Drawings' | 'Price and time scales' | 'Watchlist' | 'Bar replay' | 'Paper trading';
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = ['General', 'Chart', 'Drawings', 'Price and time scales', 'Watchlist', 'Bar replay', 'Paper trading'];
export interface ShortcutRow { group: ShortcutGroup; action: string; keys: string[] }

type Probe = WorkspaceKeyEvent & { label: string };
const MODS: Array<Pick<WorkspaceKeyEvent, 'ctrlKey' | 'altKey' | 'shiftKey'>> = [
  { ctrlKey: false, altKey: false, shiftKey: false }, { ctrlKey: false, altKey: false, shiftKey: true }, { ctrlKey: false, altKey: true, shiftKey: false },
  { ctrlKey: true, altKey: false, shiftKey: false }, { ctrlKey: true, altKey: false, shiftKey: true }, { ctrlKey: true, altKey: true, shiftKey: false }, { ctrlKey: false, altKey: true, shiftKey: true },
];
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split(''), DIGITS = '0123456789'.split('');
const NAMED: Record<string, string> = { ' ': 'Space', Escape: 'Esc', Delete: 'Delete', Backspace: 'Backspace', Enter: 'Enter', ArrowDown: 'Down', ArrowRight: 'Right', ArrowLeft: 'Left', ArrowUp: 'Up', Tab: 'Tab', '/': '/', '.': '.', ',': ',' };
/** Every keystroke the reference tries. Shift is combined only with keys whose value Shift does not change. */
function probes(): Probe[] {
  const out: Probe[] = [];
  for (const mod of MODS) for (const base of [...LETTERS, ...DIGITS, ...Object.keys(NAMED)]) {
    const letter = /^[a-z]$/.test(base);
    if (mod.shiftKey && !letter && !/^(Arrow|Escape|Delete|Backspace|Enter|Tab| )/.test(base)) continue;
    const key = letter && mod.shiftKey ? base.toUpperCase() : base;
    const label = [mod.ctrlKey ? 'Ctrl' : '', mod.altKey ? 'Alt' : '', mod.shiftKey ? 'Shift' : '', NAMED[base] ?? base.toUpperCase()].filter(Boolean).join('+');
    out.push({ key, ...mod, metaKey: false, repeat: false, isComposing: false, code: letter ? 'Key' + base.toUpperCase() : undefined, label });
  }
  return out;
}
const CONTEXT: FocusContext = { editable: false, composing: false, dialogOpen: false, menuOpen: false, dropdownOpen: false, chartFocus: true, loaded: true, placementActive: false, toolArmed: false, selectedDrawings: 0, hasSelection: false };
/** Escape and Delete depend on chart state, so the classifier is asked under each state that gives them a meaning. */
const CONTEXTS: FocusContext[] = [CONTEXT, { ...CONTEXT, placementActive: true }, { ...CONTEXT, toolArmed: true }, { ...CONTEXT, hasSelection: true, selectedDrawings: 1 }];
const REPLAYING = { phase: 'active', clock: 0 } as unknown as ReplaySession;

const TOOLS: Record<string, string> = { trendline: 'Trend line', fibretracement: 'Fib retracement', box: 'Rectangle', hline: 'Horizontal line', hray: 'Horizontal ray', vline: 'Vertical line', crossline: 'Cross line' };
const SCALE: Record<string, string> = { invert: 'Invert the price scale', percent: 'Percent price scale', logarithmic: 'Logarithmic price scale', resetChart: 'Reset the chart view' };
/** Ctrl+Up and Ctrl+Down share the rows of the renderer's own zoom keys. */
const NAVIGATION: Record<string, string> = { 'zoom-in': 'Zoom in', 'zoom-out': 'Zoom out', 'scroll-left': 'Scroll the chart further', 'scroll-right': 'Scroll the chart further' };
/** The Alt+Shift chords and Shift+D. "Go to the first bar" shares its row with Home. */
const EXTRA: Record<string, [ShortcutGroup, string]> = {
  'first-bar': ['Chart', 'Go to the first bar'], 'switch-session': ['Chart', 'Switch extended and regular trading hours'],
  'toggle-dom': ['Paper trading', 'Open or close the DOM'], 'limit-buy-at-cursor': ['Paper trading', 'Limit buy at the pointer price'],
  'limit-sell-at-cursor': ['Paper trading', 'Limit sell at the pointer price'],
};
function workspaceRow(command: WorkspaceCommand): [ShortcutGroup, string] | null {
  switch (command.command) {
    case 'none': return null;
    case 'save': return ['General', 'Save the layout'];
    case 'undo': return ['General', 'Undo'];
    case 'redo': return ['General', 'Redo'];
    case 'open-layouts': return ['General', 'Open layouts'];
    case 'shortcuts': return ['General', 'Keyboard shortcuts'];
    case 'quick-search': return ['General', 'Quick search'];
    case 'snapshot': return ['Chart', command.mode === 'copy' ? 'Copy the chart image' : 'Save the chart image'];
    case 'fullscreen': return ['General', 'Fullscreen'];
    case 'interval-entry': return ['Chart', command.initial ? 'Change the interval (type it)' : 'Change the interval'];
    case 'indicators': return ['Chart', 'Indicators'];
    case 'go-to-date': return ['Chart', 'Go to date'];
    case 'add-to-watchlist': return ['Chart', 'Add the symbol to the watchlist'];
    case 'next-symbol': return ['Chart', 'Next watchlist symbol'];
    case 'previous-symbol': return ['Chart', 'Previous watchlist symbol'];
    case 'cancel-placement': return ['Drawings', 'Cancel the drawing in progress'];
    case 'return-to-cursor': return ['Drawings', 'Return to the cursor'];
    case 'clear-selection': return ['Drawings', 'Clear the selection'];
    case 'delete-drawing': return ['Drawings', 'Remove the selected drawing'];
    case 'paper-preset': return ['Paper trading', command.side === 'buy' ? 'Buy with the order preset' : 'Sell with the order preset'];
    case 'price-scale': return ['Price and time scales', SCALE[command.action] ?? command.action];
    case 'reset-time-scale': return ['Price and time scales', 'Reset the time scale'];
    case 'navigate': return ['Chart', NAVIGATION[command.action]];
    case 'extra-key': return EXTRA[command.action];
    case 'app-command': return command.id === 'data-window' ? ['Chart', 'Open the Data window'] : ['Paper trading', 'Open the trading panel'];
  }
}
function heldRow(command: HeldKeyCommand): [ShortcutGroup, string] | null {
  if (command.kind === 'arm') return ['Drawings', 'Draw: ' + (TOOLS[command.tool] ?? command.tool)];
  if (command.kind === 'place') return ['Drawings', (TOOLS[command.tool] ?? command.tool) + ' at the crosshair'];
  if (command.kind === 'hide-toggle') return ['Drawings', 'Hide or show all drawings'];
  if (command.kind === 'copy') return ['Drawings', 'Copy the selected drawing'];
  if (command.kind === 'paste') return ['Drawings', 'Paste a drawing'];
  // Ctrl+X was bound but never listed.
  if (command.kind === 'cut') return ['Drawings', 'Cut the selected drawing'];
  return null; // undo and redo are listed from classifyWorkspaceKey
}
/** Keys the App and ChartPanel listeners handle inline (no pure classifier). `source` is the code a test finds in the listener. */
export const LISTENER_ONLY_KEYS: ReadonlyArray<{ group: ShortcutGroup; action: string; keys: string[]; file: string; source: string }> = [
  { group: 'Chart', action: 'Create an alert', keys: ['Alt+A'], file: 'src/ui/App.tsx', source: "key==='a'&&loaded" },
  { group: 'Chart', action: 'Open notes for the symbol', keys: ['Alt+N'], file: 'src/ui/App.tsx', source: "e.key.toLowerCase()==='n'" },
  { group: 'Chart', action: 'Open the chart menu', keys: ['Shift+F10', 'Menu'], file: 'src/ui/ChartPanel.tsx', source: "event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey" },
  // The desktop window's own full screen. The main process handles F11 because the
  // application menu that carried it is removed (it claimed the chart's Alt chords).
  { group: 'General', action: 'Full screen window', keys: ['F11'], file: 'electron/main.cjs', source: "input.key==='F11'" },
  // The main window's Wick mode (main process, so it works with a text field focused too).
  { group: 'General', action: 'Wick mode', keys: ['Ctrl+Shift+M'], file: 'electron/main.cjs', source: "String(input.key).toLowerCase()==='m'" },
  // Alt+click maximizes a chart of a layout (Toggle maximize chart); the grid cell handles it.
  { group: 'Chart', action: 'Maximize or restore the chart in a layout', keys: ['Alt+click'], file: 'src/ui/MultiChartGrid.tsx', source: 'if(isMaximizeClick(event)&&props.state.layout.cells.length>1' },
  // The watchlist's own keys, while the watchlist table has focus (WatchlistPanel and selectWatchKey).
  // Shift+W opens the watchlist chooser while the watchlist panel is mounted (WatchlistPanel's own listener).
  { group: 'Watchlist', action: 'Open the watchlist chooser', keys: ['Shift+W'], file: 'src/ui/WatchlistPanel.tsx', source: "event.shiftKey&&!event.ctrlKey&&!event.altKey&&event.key.toLowerCase()==='w'" },
  { group: 'Watchlist', action: 'Next symbol', keys: ['Down'], file: 'src/watchlists/selection.ts', source: "index+(key==='ArrowDown'?1:-1)" },
  { group: 'Watchlist', action: 'Previous symbol', keys: ['Up'], file: 'src/watchlists/selection.ts', source: "index+(key==='ArrowDown'?1:-1)" },
  { group: 'Watchlist', action: 'First or last symbol', keys: ['Home', 'End'], file: 'src/watchlists/selection.ts', source: "key==='Home'?0:key==='End'?ids.length-1" },
  { group: 'Watchlist', action: 'Extend the selection', keys: ['Shift+Down', 'Shift+Up'], file: 'src/watchlists/selection.ts', source: 'if(modifiers.shift){const anchor' },
  { group: 'Watchlist', action: 'Select all symbols', keys: ['Ctrl+A'], file: 'src/watchlists/selection.ts', source: "modifiers.ctrl&&!modifiers.shift&&key.toLowerCase()==='a'" },
  { group: 'Watchlist', action: 'Move the symbol up or down', keys: ['Alt+Up', 'Alt+Down'], file: 'src/ui/WatchlistPanel.tsx', source: "event.altKey&&(event.key==='ArrowUp'||event.key==='ArrowDown')" },
  { group: 'Watchlist', action: 'Flag or unflag the symbol', keys: ['Alt+Enter'], file: 'src/ui/WatchlistPanel.tsx', source: "event.altKey&&event.key==='Enter'" },
  { group: 'Watchlist', action: 'Remove the selected symbols', keys: ['Delete'], file: 'src/ui/WatchlistPanel.tsx', source: "event.key==='Delete'&&selected.length" },
];
/** Keys the chart renderer handles itself (vela 0.8.4: KeyboardController, DrawingKeys and
 * the Shift press measure), with no OpenCandle classifier. `source` is the code a test finds in the pinned renderer bundle.
 * Vela's own "0" (reset the view) is not listed: the App window listener takes every digit first for interval typing
 * (classifyWorkspaceKey), so it never reaches the renderer; Alt+R resets the chart view. Escape and Delete are listed from the
 * classifier. Row wording is our own choice. */
export const RENDERER_KEYS: ReadonlyArray<{ group: ShortcutGroup; action: string; keys: string[]; source: string }> = [
  // src/chart/vela-input-feel-transform.mjs: plain Left/Right scroll the chart by one bar,
  // and the crosshair step moved to Alt+Left/Right. These sources are found in the composed renderer bundle.
  { group: 'Chart', action: 'Scroll the chart by one bar', keys: ['Left', 'Right'], source: 'return { kind: "pan", bars: e.shiftKey ? -PAN_BARS : -1 };' },
  { group: 'Chart', action: 'Scroll the chart by 10 bars', keys: ['Shift+Left', 'Shift+Right'], source: 'return { kind: "pan", bars: e.shiftKey ? PAN_BARS : 1 };' },
  { group: 'Chart', action: 'Move the cursor one bar', keys: ['Alt+Left', 'Alt+Right'], source: 'if (e.altKey && !e.shiftKey) return { kind: "step", delta: -1 };' },
  { group: 'Chart', action: 'Scroll to the latest bar', keys: ['Alt+Shift+Right'], source: 'if (e.altKey && e.shiftKey) return { kind: "realtime" };' },
  { group: 'Chart', action: 'Zoom in', keys: ['+', '='], source: 'return { kind: "zoom", direction: 1 };' },
  { group: 'Chart', action: 'Zoom out', keys: ['-'], source: 'return { kind: "zoom", direction: -1 };' },
  { group: 'Chart', action: 'Go to the first bar', keys: ['Home'], source: 'return { kind: "edge", edge: "first" };' },
  { group: 'Chart', action: 'Go to the last bar', keys: ['End'], source: 'return { kind: "edge", edge: "last" };' },
  { group: 'Drawings', action: 'Duplicate the selected drawing', keys: ['Ctrl+D'], source: 'return ctx.hasSelection ? { kind: "duplicate" } : null;' },
  { group: 'Drawings', action: 'Nudge the selected drawing (Shift for 10 px)', keys: ['Up', 'Down', 'Left', 'Right'], source: 'return { kind: "nudge", dx: 0, dy: -s };' },
  { group: 'Drawings', action: 'Measure (hold Shift and press on the chart)', keys: ['Shift+click'], source: 'this.deps.drawingsMeasureStart?.(x, y, this.snapMode(e))' },
];
/** Keys with more than one meaning, depending on the chart state: Esc (placement, armed tool, selection), Left and Right (scroll the
 * chart, or nudge a selected drawing), Shift+Right and Shift+Left (Bar replay forward and back while replay runs, else scroll). Every
 * other key names one action. */
// Up, Down, Home, End, Delete, Alt+Enter and Shift+Down also act in the watchlist when
// its table has focus (Shift+Down plays or pauses Bar replay from the chart).
export const CONTEXT_DEPENDENT_KEYS: readonly string[] = ['Esc', 'Left', 'Right', 'Shift+Right', 'Shift+Left', 'Up', 'Down', 'Home', 'End', 'Delete', 'Alt+Enter', 'Shift+Down'];

/** Collapses a full run of letters or digits into one range label ("A to Z", "0 to 9"). */
function collapse(keys: string[]): string[] {
  const out = [...keys], range = (set: string[], label: string) => { if (set.every(key => out.includes(key))) { const at = out.indexOf(set[0]); for (const key of set) out.splice(out.indexOf(key), 1); out.splice(at, 0, label); } };
  range(LETTERS.map(letter => letter.toUpperCase()), 'A to Z'); range(DIGITS, '0 to 9');
  return out;
}
/** Some classifiers ignore extra modifiers (Ctrl+Shift+S still saves). A key whose action the same key with fewer modifiers
 * already gives is left out, so the list names the plain chord. */
function plainest(keys: string[]): string[] {
  const parts = (label: string) => { const all = label.split('+'); return { base: all[all.length - 1], mods: all.slice(0, -1) }; };
  return keys.filter(label => { const own = parts(label); return !keys.some(other => { const o = parts(other); return other !== label && o.base === own.base && o.mods.length < own.mods.length && o.mods.every(mod => own.mods.includes(mod)); }); });
}
/** The reference list: one row per action, keys in probe order, groups in SHORTCUT_GROUPS order. */
export function keyboardShortcutRows(): ShortcutRow[] {
  const rows = new Map<string, ShortcutRow>();
  const add = (entry: [ShortcutGroup, string] | null, key: string) => { if (!entry) return; const id = entry.join('|'); const row = rows.get(id) ?? { group: entry[0], action: entry[1], keys: [] }; if (!row.keys.includes(key)) row.keys.push(key); rows.set(id, row); };
  for (const probe of probes()) {
    const replay = replayShortcut({ ...probe, metaKey: false, isComposing: false, focus: 'chart' }, REPLAYING);
    if (replay) { add(['Bar replay', replay === 'toggle-play' ? 'Play or pause' : replay === 'step-back' ? 'Back one step' : 'Forward one step'], probe.label); continue; }
    const symbol = symbolEntryFromKey(probe, false);
    if (symbol) { add(['Chart', symbol.origin === 'shortcut' ? 'Symbol search' : 'Symbol search (type the symbol)'], probe.label); continue; }
    for (const context of CONTEXTS) add(workspaceRow(classifyWorkspaceKey(probe, context)), probe.label);
    const held = heldKeyCommand(probe); if (held) add(heldRow(held), probe.label);
    const paper = classifyPaperShortcut(probe, { dialogOpen: false, menuOpen: false, presetSelected: true, oneClick: true });
    if (paper.kind === 'place') add(['Paper trading', paper.side === 'buy' ? 'Buy with the order preset' : 'Sell with the order preset'], probe.label);
    if (isMaximizeChord(probe)) add(['Chart', 'Maximize or restore the chart in a layout'], probe.label);
    if (isChartCycleKey(probe)) add(['Chart', probe.shiftKey ? 'Previous chart in a layout' : 'Next chart in a layout'], probe.label);
  }
  for (const row of LISTENER_ONLY_KEYS) for (const key of row.keys) add([row.group, row.action], key);
  for (const row of RENDERER_KEYS) for (const key of row.keys) add([row.group, row.action], key);
  return [...rows.values()].map(row => ({ ...row, keys: collapse(plainest(row.keys)) })).sort((a, b) => SHORTCUT_GROUPS.indexOf(a.group) - SHORTCUT_GROUPS.indexOf(b.group));
}
/** Ctrl+/ opens this list (shortcut-dispatch 'shortcuts'); the label the Help menu shows beside the entry. */
export const KEYBOARD_SHORTCUTS_KEY = 'Ctrl+/';
