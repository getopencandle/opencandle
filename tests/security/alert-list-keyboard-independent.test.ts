import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AlertDialog, type AlertDialogProps } from '../../src/ui/AlertDialog';
import { createLocalAlert, editLocalAlert, type AlertNotification, type LocalAlert } from '../../src/domain/alerts';
import { fixtureDataset } from '../../src/domain/fixtures';

// Actual component handlers/effects, small synthetic records and explicit DOM
// identity doubles. This is not browser focus, scrolling or executable evidence.
const hooks = vi.hoisted(() => ({ cells: [] as any[], cursor: 0, pending: [] as Array<() => void>, cleanup: [] as Array<(() => void) | undefined> }));
vi.mock('react', async () => {
  const memo = (run: () => unknown, deps: unknown[]) => {
    const i = hooks.cursor++, old = hooks.cells[i];
    if (!old || deps.length !== old.deps.length || deps.some((value, j) => !Object.is(value, old.deps[j]))) hooks.cells[i] = { deps, value: run() };
    return hooks.cells[i].value;
  };
  const effect = (run: () => void | (() => void), deps?: unknown[]) => {
    const i = hooks.cursor++, old = hooks.cells[i];
    if (!old || !deps || deps.length !== old.length || deps.some((value, j) => !Object.is(value, old[j]))) {
      hooks.cells[i] = deps;
      hooks.pending.push(() => { hooks.cleanup[i]?.(); hooks.cleanup[i] = run() || undefined; });
    }
  };
  return { ...await vi.importActual<any>('react'), useState(initial: any) { const i = hooks.cursor++; if (!(i in hooks.cells)) hooks.cells[i] = typeof initial === 'function' ? initial() : initial; return [hooks.cells[i], (next: any) => { hooks.cells[i] = typeof next === 'function' ? next(hooks.cells[i]) : next; }]; }, useRef(initial: any) { const i = hooks.cursor++; if (!(i in hooks.cells)) hooks.cells[i] = { current: initial }; return hooks.cells[i]; }, useEffect: effect, useLayoutEffect: effect, useMemo: memo, useCallback: (fn: () => unknown, deps: unknown[]) => memo(() => fn, deps) };
});

const dataset = fixtureDataset('GME', 5), now = 1791979200;
function saved(id: string, name: string, mode: 'ordinary' | 'replay' = 'ordinary'): LocalAlert {
  return createLocalAlert({ id, name, message: 'SYNTHETIC keyboard only', instrumentId: dataset.instrument.id, sourceId: 'close', mode, runId: mode === 'replay' ? 'SYNTHETIC replay run' : 'ordinary', createdAt: now, expiresAt: null, condition: { kind: 'greater', value: 10 }, frequency: 'every-time' });
}
function notification(id: string, alertId: string, at: number, sequence: number, replay = false): AlertNotification {
  return { id, alertId, name: 'SYNTHETIC recorded ' + id, message: 'SYNTHETIC recorded text', value: 11, at, sequence, barId: 'SYNTHETIC bar ' + id, mode: replay ? 'replay' : 'ordinary', runId: replay ? 'SYNTHETIC prior replay' : 'ordinary', local: true };
}
function rows() {
  const z = saved('z', 'SYNTHETIC Zulu'), a = saved('a', 'SYNTHETIC Alpha', 'replay'), m = saved('m', 'SYNTHETIC Alpha');
  z.history = [notification('z-new', 'z', now + 30, 3), notification('z-tie', 'z', now + 20, 2)];
  a.history = [notification('a-tie', 'a', now + 20, 2, true)];
  m.history = [notification('m-sequence', 'm', now + 20, 9)];
  a.status = 'paused'; m.status = 'waiting-for-data';
  return [z, a, m];
}
function text(value: any): string { return typeof value === 'string' || typeof value === 'number' ? String(value) : Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : ''; }
function all(tree: any, predicate: (node: any) => boolean): any[] { return Array.isArray(tree) ? tree.flatMap(child => all(child, predicate)) : tree?.props ? [...(predicate(tree) ? [tree] : []), ...all(tree.props.children, predicate)] : []; }
const listeners = new Map<string, Set<(event: any) => void>>();
class Node {
  isConnected = true; offsetParent: object | null = {}; parentElement: Node | null = null; children: Node[] = [];
  tagName = 'DIV'; props: any = {}; ref: any; focusCalls = 0; onFocus?: () => void;
  constructor(readonly identity: string) {}
  get disabled() { return this.props.disabled === true; }
  getAttribute(name: string): string | null { const value = this.props[name === 'tabindex' ? 'tabIndex' : name]; return value == null ? null : String(value); }
  matches(selector: string): boolean {
    return selector.split(',').some(part => {
      let value = part.trim();
      if (value.includes(':not(:disabled)') && this.disabled) return false;
      if (value.includes(':not([tabindex="-1"])') && this.props.tabIndex === -1) return false;
      if (value.includes(':not([contenteditable="false"])') && this.props.contentEditable === false) return false;
      value = value.replace(/:not\([^)]*\)/g, '');
      const tag = value.match(/^[a-z]+/i)?.[0]; if (tag && tag.toUpperCase() !== this.tagName) return false;
      const cls = value.match(/\.([\w-]+)/)?.[1]; if (cls && !String(this.props.className ?? '').split(' ').includes(cls)) return false;
      for (const match of value.matchAll(/\[([^=\]]+)(?:=["']?([^\]"']+)["']?)?\]/g)) {
        const name = match[1], actual = name === 'contenteditable' ? this.props.contentEditable : this.getAttribute(name);
        if (actual == null || match[2] !== undefined && String(actual) !== match[2]) return false;
      }
      return true;
    });
  }
  closest(selector: string): Node | null { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
  contains(target: unknown): boolean { for (let node = target instanceof Node ? target : null; node; node = node.parentElement) if (node === this) return true; return false; }
  querySelectorAll<T = Node>(selector: string): T[] { return this.children.flatMap(child => [...(child.matches(selector) ? [child as unknown as T] : []), ...child.querySelectorAll<T>(selector)]); }
  querySelector<T = Node>(selector: string): T | null { return this.querySelectorAll<T>(selector)[0] ?? null; }
  focus() {
    this.focusCalls++; if (!this.isConnected || this.disabled) return;
    const previous = document.activeElement as unknown as Node | null;
    if (previous !== this) previous?.props.onBlur?.({ target: previous, currentTarget: previous, relatedTarget: this });
    (document as any).activeElement = this;
    if (previous !== this) this.props.onFocus?.({ target: this, currentTarget: this, relatedTarget: previous });
    this.onFocus?.();
  }
}
function event(node: Node, key = '', extra: Record<string, unknown> = {}) {
  const value: any = { target: node, currentTarget: node, key, button: 0, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, repeat: false, defaultPrevented: false, nativeEvent: { isComposing: false }, preventDefault: vi.fn(() => { value.defaultPrevented = true; }), stopPropagation: vi.fn(), ...extra };
  return value;
}
function assignRef(ref: any, value: Node | null) { if (typeof ref === 'function') ref(value); else if (ref) ref.current = value; }

function setup(initial = rows()) {
  let elements = new Map<string, Node>(), tree: any;
  const publish = vi.fn(() => true), request = vi.fn(), source = vi.fn(), target = vi.fn(), validate = vi.fn();
  const props: AlertDialogProps = { open: true, alerts: initial, onClose: vi.fn(() => { props.open = false; }), onAlertsChange: publish, instrument: dataset.instrument, now, events: [], externallyProcessed: true, onRequestObservation: request, onSourceChange: source, onTargetChange: target, validateCurrentSource: validate };
  const render = () => {
    hooks.cursor = 0; tree = AlertDialog(props); const next = new Map<string, Node>();
    const mount = (value: any, parent: Node | null, path: string) => {
      if (Array.isArray(value)) { value.forEach((child, i) => mount(child, parent, path + '/' + i)); return; }
      if (!value?.props) return;
      if (typeof value.type !== 'string') { mount(value.props.children, parent, path + '/fragment'); return; }
      const special = value.type === 'article' && value.props['data-alert-id'] ? 'manager:' + value.props['data-alert-id'] : value.type === 'tr' && value.key != null ? 'history:' + value.key : null;
      const key = special ?? path + '/' + value.type + ':' + (value.key ?? '');
      const node = elements.get(key) ?? new Node(key); node.isConnected = true; node.parentElement = parent; node.children = []; node.tagName = value.type.toUpperCase(); node.props = value.props;
      if (parent) parent.children.push(node); next.set(key, node);
      if (node.ref !== value.props.ref) { assignRef(node.ref, null); node.ref = value.props.ref; assignRef(node.ref, node); }
      mount(value.props.children, node, key);
    };
    mount(tree, null, 'root');
    for (const [key, node] of elements) if (!next.has(key)) { node.isConnected = false; assignRef(node.ref, null); }
    elements = next; return tree;
  };
  const find = (predicate: (node: any) => boolean) => { const value = all(render(), predicate)[0]; if (!value) throw new Error('SYNTHETIC keyboard control absent'); return value; };
  const button = (label: string) => find(node => node.type === 'button' && text(node) === label);
  const field = (label: string) => find(node => node.props['aria-label'] === label);
  const manager = (id: string) => find(node => node.type === 'article' && node.props['data-alert-id'] === id);
  const history = (id: string) => find(node => node.type === 'tr' && String(node.key) === id);
  const node = (kind: 'manager' | 'history', id: string) => { render(); const value = elements.get(kind + ':' + id); if (!value) throw new Error('SYNTHETIC row node absent'); return value; };
  const key = (kind: 'manager' | 'history', id: string, name: string, extra: Record<string, unknown> = {}) => { const row = kind === 'manager' ? manager(id) : history(id), dom = node(kind, id); const input = event(dom, name, extra); row.props.onKeyDown(input); return input; };
  const focus = (kind: 'manager' | 'history', id: string) => { const dom = node(kind, id); dom.focus(); return dom; };
  const settle = () => { for (let i = 0; i < 12; i++) { render(); const pending = hooks.pending.splice(0); if (!pending.length) return; pending.forEach(run => run()); } throw new Error('SYNTHETIC keyboard effects did not settle'); };
  const tab = (name: 'Alerts' | 'History') => { find(node => node.type === 'button' && text(node).startsWith(name + ' (')).props.onClick(); settle(); };
  const change = (label: string, value: string) => { field(label).props.onChange({ target: { value } }); render(); };
  const unchanged = (before: LocalAlert[], snapshot: LocalAlert[]) => { expect(props.alerts).toBe(before); expect(props.alerts).toStrictEqual(snapshot); for (const fn of [publish, request, source, target, validate]) expect(fn).not.toHaveBeenCalled(); };
  settle(); return { props, render, find, button, field, manager, history, node, key, focus, settle, tab, change, unchanged, publish, request };
}
beforeEach(() => {
  hooks.cells = []; hooks.cursor = 0; hooks.pending = []; hooks.cleanup = []; listeners.clear();
  vi.stubGlobal('Element', Node); vi.stubGlobal('HTMLElement', Node);
  const body = new Node('body'); body.tagName = 'BODY';
  vi.stubGlobal('document', { body, activeElement: body, addEventListener(name: string, handler: (event: any) => void) { let set = listeners.get(name); if (!set) { set = new Set(); listeners.set(name, set); } set.add(handler); }, removeEventListener(name: string, handler: (event: any) => void) { listeners.get(name)?.delete(handler); } });
  vi.stubGlobal('window', { lv: { exportData: vi.fn(async () => ({ ok: true, value: { fileName: 'SYNTHETIC.csv', bytes: 1 } })) } });
});
afterEach(() => { hooks.cleanup.forEach(cleanup => cleanup?.()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('follows literal displayed manager order with all mappings, repeat arrows and clamped endpoints', () => {
  const ui = setup(), before = ui.props.alerts, snapshot = structuredClone(before);
  expect(all(ui.render(), item => item.type === 'article').map(item => item.props['data-alert-id'])).toEqual(['z', 'a', 'm']);
  ui.focus('manager', 'z');
  for (const [origin, key, destination, extra] of [['z', 'ArrowDown', 'a', {}], ['a', 'ArrowRight', 'm', { repeat: true }], ['m', 'ArrowRight', 'm', {}], ['m', 'ArrowUp', 'a', {}], ['a', 'ArrowLeft', 'z', {}], ['z', 'ArrowLeft', 'z', {}], ['z', ' ', 'a', {}], ['a', ' ', 'z', { shiftKey: true }]] as const) {
    const input = ui.key('manager', origin, key, extra); expect(document.activeElement).toBe(ui.node('manager', destination)); expect(input.preventDefault).toHaveBeenCalledTimes(1); expect(input.stopPropagation).toHaveBeenCalledTimes(1);
  }
  ui.unchanged(before, snapshot);
});

it('uses the final filtered/sorted order and leaves all hidden saved rows untouched', () => {
  const ui = setup(), before = ui.props.alerts, snapshot = structuredClone(before);
  ui.change('Sort alerts by', 'name'); ui.change('Alert sort direction', 'asc');
  expect(all(ui.render(), item => item.type === 'article').map(item => item.props['data-alert-id'])).toEqual(['a', 'm', 'z']);
  ui.focus('manager', 'a'); ui.key('manager', 'a', 'ArrowDown'); expect(document.activeElement).toBe(ui.node('manager', 'm'));
  ui.change('Alert mode filter', 'replay'); ui.focus('manager', 'a'); ui.key('manager', 'a', 'ArrowDown');
  expect(all(ui.render(), item => item.type === 'article')).toHaveLength(1); expect(document.activeElement).toBe(ui.node('manager', 'a'));
  ui.unchanged(before, snapshot);
});

it('navigates literal full history order and recorded provenance independently of manager filters', () => {
  const ui = setup(), before = ui.props.alerts, snapshot = structuredClone(before);
  ui.change('Alert mode filter', 'ordinary'); ui.change('Sort alerts by', 'name'); ui.tab('History');
  expect(all(ui.render(), item => item.type === 'tr' && item.key != null).map(item => String(item.key))).toEqual(['z-new', 'm-sequence', 'z-tie', 'a-tie']);
  const replay = ui.history('a-tie'); expect(replay.props.tabIndex).toBe(0); expect(replay.props['data-alert-history-id']).toBe('a-tie'); expect(replay.props['aria-label']).toContain('SYNTHETIC recorded a-tie'); expect(replay.props['aria-label']).toContain(new Date((now + 20) * 1000).toLocaleString()); expect(replay.props['aria-label']).toContain('replay');
  ui.focus('history', 'z-new');
  for (const [origin, key, destination] of [['z-new', 'ArrowDown', 'm-sequence'], ['m-sequence', 'ArrowRight', 'z-tie'], ['z-tie', ' ', 'a-tie'], ['a-tie', 'ArrowDown', 'a-tie'], ['a-tie', 'ArrowUp', 'z-tie'], ['z-tie', 'ArrowLeft', 'm-sequence']] as const) { ui.key('history', origin, key); expect(document.activeElement).toBe(ui.node('history', destination)); }
  ui.key('history', 'm-sequence', ' ', { shiftKey: true }); expect(document.activeElement).toBe(ui.node('history', 'z-new'));
  ui.unchanged(before, snapshot);
});

it.each(['manager', 'history'] as const)('consumes repeated Space without advancing the %s row', kind => {
  const ui = setup(); if (kind === 'history') ui.tab('History'); const id = kind === 'manager' ? 'z' : 'z-new';
  const origin = ui.focus(kind, id), input = ui.key(kind, id, ' ', { repeat: true });
  expect(document.activeElement).toBe(origin); expect(input.preventDefault).toHaveBeenCalledTimes(1); expect(input.stopPropagation).toHaveBeenCalledTimes(1); expect(ui.publish).not.toHaveBeenCalled();
});

it.each([
  ['Ctrl', { ctrlKey: true }], ['Meta', { metaKey: true }], ['Alt', { altKey: true }],
  ['already prevented', { defaultPrevented: true }], ['IME', { nativeEvent: { isComposing: true } }],
] as const)('ignores %s navigation without consuming the control event', (_name, extra) => {
  const ui = setup();
  for (const kind of ['manager', 'history'] as const) {
    if (kind === 'history') ui.tab('History'); const id = kind === 'manager' ? 'z' : 'z-new';
    const origin = ui.focus(kind, id), input = ui.key(kind, id, 'ArrowDown', extra);
    expect(document.activeElement).toBe(origin); expect(input.preventDefault).not.toHaveBeenCalled(); expect(input.stopPropagation).not.toHaveBeenCalled(); expect(ui.publish).not.toHaveBeenCalled();
  }
});

it('uses manager ShiftArrow for literal displayed range selection but keeps the History negative', () => {
  const ui = setup(), before = ui.props.alerts, snapshot = structuredClone(before); ui.focus('manager', 'z');
  const manager = ui.key('manager', 'z', 'ArrowDown', { shiftKey: true });
  expect(document.activeElement).toBe(ui.node('manager', 'a')); expect(manager.preventDefault).toHaveBeenCalledTimes(1); expect(manager.stopPropagation).toHaveBeenCalledTimes(1);
  expect(all(ui.render(), item => item.type === 'article').filter(row => all(row, control => control.type === 'input' && control.props.type === 'checkbox' && control.props.checked === true).length === 1).map(row => row.props['data-alert-id'])).toEqual(['z', 'a']);
  ui.tab('History'); const origin = ui.focus('history', 'z-new'), history = ui.key('history', 'z-new', 'ArrowDown', { shiftKey: true });
  expect(document.activeElement).toBe(origin); expect(history.preventDefault).not.toHaveBeenCalled(); expect(history.stopPropagation).not.toHaveBeenCalled(); ui.unchanged(before, snapshot);
});

it.each(['Enter', 'Delete', 'Home', 'End', 'x'])('does not invent a %s row shortcut', key => {
  const ui = setup(), origin = ui.focus('manager', 'z'), input = ui.key('manager', 'z', key);
  expect(document.activeElement).toBe(origin); expect(input.preventDefault).not.toHaveBeenCalled(); expect(ui.publish).not.toHaveBeenCalled();
});

it.each([['BUTTON', ''], ['INPUT', ''], ['SELECT', ''], ['TEXTAREA', ''], ['A', ''], ['LABEL', ''], ['SUMMARY', ''], ['DIV', 'button'], ['DIV', 'menu'], ['DIV', 'menuitem'], ['DIV', 'alertdialog'], ['DIV', 'textbox']])('does not navigate through nested %s %s content', (tag, role) => {
  const ui = setup();
  for (const kind of ['manager', 'history'] as const) {
    if (kind === 'history') ui.tab('History'); const id = kind === 'manager' ? 'z' : 'z-new';
    const origin = ui.focus(kind, id), child = new Node('nested'); child.tagName = tag; child.parentElement = origin; child.props = role ? { role } : {};
    const input = ui.key(kind, id, 'ArrowDown', { target: child });
    expect(document.activeElement).toBe(origin); expect(input.preventDefault).not.toHaveBeenCalled(); expect(ui.publish).not.toHaveBeenCalled();
  }
});

it('does not navigate out of editable content in either list', () => {
  const ui = setup();
  for (const kind of ['manager', 'history'] as const) {
    if (kind === 'history') ui.tab('History'); const id = kind === 'manager' ? 'z' : 'z-new';
    const origin = ui.focus(kind, id), child = new Node('editable'); child.parentElement = origin; child.props = { contentEditable: true };
    const input = ui.key(kind, id, 'ArrowDown', { target: child });
    expect(document.activeElement).toBe(origin); expect(input.preventDefault).not.toHaveBeenCalled();
  }
});

it('adds no keyup action or automatic initial row focus', () => {
  const ui = setup(); expect((document.activeElement as unknown as Node).identity).not.toMatch(/^(manager|history):/);
  expect(ui.manager('z').props.onKeyUp).toBeUndefined(); ui.tab('History'); expect(ui.history('z-new').props.onKeyUp).toBeUndefined();
  expect(ui.publish).not.toHaveBeenCalled();
});

it.each(['manager', 'history'] as const)('uses primary %s background clicks only to focus the exact row', kind => {
  const ui = setup(), before = ui.props.alerts, snapshot = structuredClone(before); if (kind === 'history') ui.tab('History');
  const id = kind === 'manager' ? 'z' : 'z-new', row = kind === 'manager' ? ui.manager(id) : ui.history(id), dom = ui.node(kind, id), previous = document.activeElement;
  row.props.onClick(event(dom, '', { button: 2 })); expect(document.activeElement).toBe(previous);
  row.props.onClick(event(dom)); expect(document.activeElement).toBe(dom); ui.unchanged(before, snapshot);
});

it.each(['manager', 'history'] as const)('refuses unregistered, interactive and disconnected %s pointer targets', kind => {
  const ui = setup(); if (kind === 'history') ui.tab('History');
  const id = kind === 'manager' ? 'z' : 'z-new', row = kind === 'manager' ? ui.manager(id) : ui.history(id), dom = ui.node(kind, id), previous = document.activeElement;
  const foreign = new Node(dom.identity); foreign.parentElement = dom.parentElement; foreign.props = dom.props; foreign.tagName = dom.tagName;
  row.props.onClick(event(foreign)); expect(foreign.focusCalls).toBe(0); expect(document.activeElement).toBe(previous);
  const nested = new Node('SYNTHETIC nested ARIA action'); nested.parentElement = dom; nested.props = { role: 'button' };
  const count = dom.focusCalls; row.props.onClick(event(dom, '', { target: nested })); expect(dom.focusCalls).toBe(count); expect(document.activeElement).toBe(previous);
  dom.isConnected = false; row.props.onClick(event(dom)); expect(dom.focusCalls).toBe(count); expect(document.activeElement).toBe(previous);
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
});

it('requires the exact registered row to own focus, not just a borrowed row handler', () => {
  const ui = setup(), other = ui.focus('manager', 'm'), input = ui.key('manager', 'z', 'ArrowDown');
  expect(document.activeElement).toBe(other); expect(input.preventDefault).not.toHaveBeenCalled();
});

it.each(['Clear filters', 'Reset sort'])('retires an old row handler after same-order %s intent', label => {
  const ui = setup(), old = ui.manager('z').props.onKeyDown; ui.button(label).props.onClick();
  const origin = ui.focus('manager', 'z'), input = event(origin, 'ArrowDown'); old(input);
  expect(document.activeElement).toBe(origin); expect(input.preventDefault).not.toHaveBeenCalled();
  ui.key('manager', 'z', 'ArrowDown'); expect(document.activeElement).toBe(ui.node('manager', 'a'));
});

it('never revives an old manager handler through filter hide and reappearance', () => {
  const ui = setup(), old = ui.manager('z').props.onKeyDown; ui.change('Search alerts', 'Alpha'); ui.change('Search alerts', '');
  const origin = ui.focus('manager', 'z'); old(event(origin, 'ArrowDown')); expect(document.activeElement).toBe(origin);
  ui.key('manager', 'z', 'ArrowDown'); expect(document.activeElement).toBe(ui.node('manager', 'a')); expect(ui.publish).not.toHaveBeenCalled();
});

it('retires an old manager revision while preserving current history/status-only navigation', () => {
  const ui = setup(), old = ui.manager('z').props.onKeyDown;
  ui.props.alerts = [{ ...ui.props.alerts[0], status: 'paused', history: [...ui.props.alerts[0].history] }, ...ui.props.alerts.slice(1)]; ui.render();
  let origin = ui.focus('manager', 'z'); old(event(origin, 'ArrowDown')); expect(document.activeElement).toBe(ui.node('manager', 'a'));
  ui.props.alerts = [editLocalAlert(ui.props.alerts[0], { message: 'SYNTHETIC revision' }, now + 1), ...ui.props.alerts.slice(1)]; ui.render();
  origin = ui.focus('manager', 'z'); old(event(origin, 'ArrowDown')); expect(document.activeElement).toBe(origin); expect(ui.publish).not.toHaveBeenCalled();
});

it('does not let a retained History handler borrow a newly appended view', () => {
  const ui = setup(); ui.tab('History'); const old = ui.history('z-new').props.onKeyDown;
  ui.props.alerts = [{ ...ui.props.alerts[0], history: [...ui.props.alerts[0].history, notification('z-latest', 'z', now + 40, 4)] }, ...ui.props.alerts.slice(1)]; ui.render();
  const origin = ui.focus('history', 'z-new'); old(event(origin, 'ArrowUp')); expect(document.activeElement).toBe(origin);
  ui.key('history', 'z-new', 'ArrowUp'); expect(document.activeElement).toBe(ui.node('history', 'z-latest')); expect(ui.publish).not.toHaveBeenCalled();
});

it('preserves History navigation when only the current parent definition changes', () => {
  const ui = setup(); ui.tab('History'); const old = ui.history('a-tie').props.onKeyDown;
  ui.props.alerts = [ui.props.alerts[0], editLocalAlert(ui.props.alerts[1], { name: 'SYNTHETIC renamed current definition' }, now + 1), ui.props.alerts[2]]; ui.render();
  const origin = ui.focus('history', 'a-tie'); old(event(origin, 'ArrowUp'));
  expect(document.activeElement).toBe(ui.node('history', 'z-tie')); expect(text(ui.history('a-tie'))).toContain('SYNTHETIC recorded a-tie');
});

it('cannot borrow a same-ID history record from a different alert/run', () => {
  const ui = setup(); ui.tab('History'); const old = ui.history('z-new').props.onKeyDown;
  ui.props.alerts = [{ ...ui.props.alerts[0], history: ui.props.alerts[0].history.slice(1) }, { ...ui.props.alerts[1], history: [notification('z-new', 'a', now + 30, 3, true), ...ui.props.alerts[1].history] }, ui.props.alerts[2]]; ui.render();
  const origin = ui.focus('history', 'z-new'); old(event(origin, 'ArrowDown')); expect(document.activeElement).toBe(origin); expect(ui.publish).not.toHaveBeenCalled();
});

it('suspends list navigation while a row menu or exact Delete confirmation is current', () => {
  const ui = setup(); const more = ui.find(item => item.type === 'button' && item.props['aria-label'] === 'More alert actions for SYNTHETIC Zulu');
  const trigger = new Node('trigger'); trigger.tagName = 'BUTTON'; more.props.onClick(event(trigger));
  let origin = ui.focus('manager', 'z'); ui.key('manager', 'z', 'ArrowDown'); expect(document.activeElement).toBe(origin);
  ui.find(item => item.props.role === 'menu').props.onKeyDown(event(origin, 'Escape')); ui.settle();
  all(ui.manager('z'), item => item.type === 'button' && text(item) === 'Delete')[0].props.onClick();
  origin = ui.focus('manager', 'z'); ui.key('manager', 'z', 'ArrowDown'); expect(document.activeElement).toBe(origin);
  all(ui.find(item => item.props.role === 'alertdialog'), item => item.type === 'button' && text(item) === 'Cancel')[0].props.onClick();
  ui.key('manager', 'z', 'ArrowDown'); expect(document.activeElement).toBe(ui.node('manager', 'a')); expect(ui.publish).not.toHaveBeenCalled();
});

it('a target focus callback cannot run an old tail over a newer filter/control owner', () => {
  const ui = setup(), target = ui.node('manager', 'a'), newer = new Node('newer control'); newer.tagName = 'INPUT';
  target.onFocus = () => { ui.change('Search alerts', 'Zulu'); (document as any).activeElement = newer; };
  ui.focus('manager', 'z'); ui.key('manager', 'z', 'ArrowDown'); ui.settle();
  expect(document.activeElement).toBe(newer); expect(ui.publish).not.toHaveBeenCalled(); expect(ui.props.onClose).not.toHaveBeenCalled();
});

it.each(['manager', 'history'] as const)('consumes one current %s disappearance fallback without choosing a neighboring row', kind => {
  const ui = setup(); if (kind === 'history') ui.tab('History');
  const origin = ui.focus(kind, kind === 'manager' ? 'z' : 'z-new');
  ui.props.alerts = ui.props.alerts.slice(1); ui.render(); expect(origin.isConnected).toBe(false);
  (document as any).activeElement = document.body; ui.settle();
  const control = kind === 'manager' ? ui.field('Search alerts') : ui.find(item => item.type === 'button' && text(item).startsWith('History ('));
  const destination = control.props.ref.current as Node;
  expect(document.activeElement).toBe(destination); const calls = destination.focusCalls; ui.settle(); expect(destination.focusCalls).toBe(calls);
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
});

it('retained manager and History handlers stay retired after tab and close/reopen cycles', () => {
  const ui = setup(), manager = ui.manager('z').props.onKeyDown; ui.tab('History'); const history = ui.history('z-new').props.onKeyDown;
  ui.tab('Alerts'); let origin = ui.focus('manager', 'z'); manager(event(origin, 'ArrowDown')); expect(document.activeElement).toBe(origin);
  ui.props.open = false; ui.settle(); ui.props.open = true; ui.settle(); ui.tab('History'); origin = ui.focus('history', 'z-new'); history(event(origin, 'ArrowDown')); expect(document.activeElement).toBe(origin);
});

it('keeps one captured CSV export alive while History appends and focus moves', async () => {
  let resolve!: (value: any) => void; const pending = new Promise(value => { resolve = value; }), send = vi.fn((_input: { text: string }) => pending);
  (window as any).lv.exportData = send; const ui = setup(); ui.tab('History');
  const action = ui.button('Export alert history CSV').props.onClick, completion = action(); expect(send).toHaveBeenCalledTimes(1);
  const csv = send.mock.calls[0][0].text;
  ui.props.alerts = [{ ...ui.props.alerts[0], history: [...ui.props.alerts[0].history, notification('z-latest', 'z', now + 40, 4)] }, ...ui.props.alerts.slice(1)]; ui.render();
  ui.focus('history', 'z-new'); ui.key('history', 'z-new', 'ArrowUp'); expect(document.activeElement).toBe(ui.node('history', 'z-latest'));
  await action(); expect(send).toHaveBeenCalledTimes(1); expect(send.mock.calls[0][0].text).toBe(csv); expect(csv).not.toContain('z-latest');
  resolve({ ok: true, value: { fileName: 'SYNTHETIC.csv', bytes: csv.length } }); await completion;
  expect(text(ui.find(item => item.type === 'output'))).toBe('Alert history saved locally.'); expect(ui.button('Export alert history CSV').props.disabled).toBe(false); expect(ui.publish).not.toHaveBeenCalled();
});

it('leaves empty lists without an invented navigation target', () => {
  const ui = setup([]); expect(all(ui.render(), item => item.type === 'article')).toEqual([]); ui.tab('History');
  expect(all(ui.render(), item => item.type === 'tr' && item.key != null)).toEqual([]); expect(ui.button('Export alert history CSV').props.disabled).toBe(true); expect(ui.publish).not.toHaveBeenCalled();
});

it.each(['manager', 'history'] as const)('withholds ambiguous %s navigation without hiding or merging saved rows', kind => {
  const initial = rows();
  if (kind === 'manager') initial.push({ ...initial[0], definition: { ...initial[0].definition } });
  else initial[1] = { ...initial[1], history: [...initial[1].history, { ...initial[0].history[0] }] };
  const ui = setup(initial), before = ui.props.alerts, snapshot = structuredClone(before);
  if (kind === 'history') ui.tab('History'); const id = kind === 'manager' ? 'z' : 'z-new', origin = ui.focus(kind, id);
  ui.key(kind, id, 'ArrowDown'); expect(document.activeElement).toBe(origin);
  expect(all(ui.render(), item => kind === 'manager' ? item.type === 'article' : item.type === 'tr' && item.key != null)).toHaveLength(kind === 'manager' ? 4 : 5);
  ui.unchanged(before, snapshot);
});
