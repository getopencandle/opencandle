import { afterEach, beforeEach, expect, vi } from 'vitest';
import { AlertDialog, type AlertDialogProps } from '../../src/ui/AlertDialog';
import { createLocalAlert, validateLocalAlerts, type LocalAlert, type AlertNotification } from '../../src/domain/alerts';
import { fixtureDataset } from '../../src/domain/fixtures';

// Shared controlled model for independent AlertDialog suites. Vitest hoists the
// React mock in this module before its AlertDialog import; import this helper
// once per suite. beforeEach/afterEach own fresh cells, globals and cleanup.
// Actual component callbacks/ref/effect paths under an explicit hook and node
// model. No native checkbox event, browser focus, GUI or package claim is made.
interface EffectSlot { dependencies?: readonly unknown[]; cleanup?: () => void; }
export interface Store { cells: unknown[]; effects: Map<number, EffectSlot>; pending: Array<() => void>; cursor: number; writes: number; }
const hook = vi.hoisted(() => ({ current: null as Store | null, ids: 0 }));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  const current = () => { if (!hook.current) throw new Error('No active synthetic hook owner'); return hook.current; };
  const same = (left?: readonly unknown[], right?: readonly unknown[]) => !!left && !!right && left.length === right.length && left.every((item, index) => Object.is(item, right[index]));
  const effect = (create: () => void | (() => void), dependencies?: readonly unknown[]) => {
    const store = current(), index = store.cursor++, old = store.effects.get(index);
    if (old && same(old.dependencies, dependencies)) return;
    const slot: EffectSlot = { dependencies: dependencies?.slice() }; store.effects.set(index, slot);
    store.pending.push(() => { old?.cleanup?.(); const cleanup = create(); if (typeof cleanup === 'function') slot.cleanup = cleanup; });
  };
  const memo = <T,>(create: () => T, dependencies?: readonly unknown[]): T => {
    const store = current(), index = store.cursor++, old = store.cells[index] as { dependencies?: readonly unknown[]; value: T } | undefined;
    if (!old || !same(old.dependencies, dependencies)) store.cells[index] = { dependencies: dependencies?.slice(), value: create() };
    return (store.cells[index] as { value: T }).value;
  };
  return {
    ...actual, useEffect: effect, useLayoutEffect: effect, useMemo: memo,
    useCallback: <T,>(callback: T, dependencies?: readonly unknown[]) => memo(() => callback, dependencies),
    useState<T>(initial: T | (() => T)) {
      const store = current(), index = store.cursor++;
      if (!(index in store.cells)) store.cells[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
      return [store.cells[index] as T, (next: T | ((value: T) => T)) => { store.writes++; store.cells[index] = typeof next === 'function' ? (next as (value: T) => T)(store.cells[index] as T) : next; }];
    },
    useRef<T>(initial: T) { const store = current(), index = store.cursor++; if (!(index in store.cells)) store.cells[index] = { current: initial }; return store.cells[index] as { current: T }; },
    // Stable per-slot id, unique across synthetic owners (React's own format), for components such as Select.
    useId() { const store = current(), index = store.cursor++; if (!(index in store.cells)) store.cells[index] = ':s' + (++hook.ids).toString(36) + ':'; return store.cells[index] as string; },
  };
});

export interface ModelElement { type: unknown; props: Record<string, unknown>; }
function element(value: unknown): value is ModelElement { return value !== null && typeof value === 'object' && 'props' in value && typeof (value as ModelElement).props === 'object'; }
export function text(value: unknown): string { return typeof value === 'string' || typeof value === 'number' ? String(value) : Array.isArray(value) ? value.map(text).join('') : element(value) ? text(value.props.children) : ''; }
export function all(value: unknown, predicate: (node: ModelElement) => boolean): ModelElement[] {
  if (Array.isArray(value)) return value.flatMap(child => all(child, predicate));
  if (!element(value)) return [];
  return [...(predicate(value) ? [value] : []), ...all(value.props.children, predicate)];
}
export interface FocusDocument { activeElement: ModelNode | null; body: ModelNode; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn>; }
export let focusDocument: FocusDocument;
/** Dispatch only currently registered document listeners, in registration order.
 * This is a controlled callback model, not an implementation of DOM dispatch. */
export function dispatchDocument(type: string, event: unknown, capture = true): void {
  const captureFlag = (value: unknown) => value === true || !!value && typeof value === 'object' && 'capture' in value && value.capture === true;
  const registrations = [
    ...focusDocument.addEventListener.mock.calls.map((args, index) => ({ args, order: focusDocument.addEventListener.mock.invocationCallOrder[index], add: true })),
    ...focusDocument.removeEventListener.mock.calls.map((args, index) => ({ args, order: focusDocument.removeEventListener.mock.invocationCallOrder[index], add: false })),
  ].sort((left, right) => left.order - right.order);
  const active = new Map<unknown, (event: unknown) => void>();
  for (const { args, add } of registrations) {
    if (args[0] !== type || captureFlag(args[2]) !== capture || typeof args[1] !== 'function') continue;
    if (add) active.set(args[1], args[1] as (event: unknown) => void); else active.delete(args[1]);
  }
  for (const listener of active.values()) listener.call(focusDocument, event);
}
export class ModelNode {
  props: Record<string, unknown> = {}; tag = 'div'; parent: ModelNode | null = null; children: ModelNode[] = []; isConnected = true;
  afterFocus?: () => void; nativeChecked?: boolean;
  get offsetParent(): ModelNode | null { return this.isConnected && !this.closest('[hidden],[aria-hidden="true"],[inert]') ? this.parent ?? focusDocument.body : null; }
  get tabIndex(): number { return typeof this.props.tabIndex === 'number' ? this.props.tabIndex : ['button', 'input', 'select', 'textarea'].includes(this.tag) ? 0 : -1; }
  get tagName(): string { return this.tag.toUpperCase(); }
  get disabled(): boolean { return this.props.disabled === true; }
  get type(): unknown { return this.props.type; }
  get value(): unknown { return this.props.value; }
  get checked(): boolean { return this.nativeChecked ?? this.props.checked === true; }
  get parentElement(): ModelNode | null { return this.parent; }
  contains(value: unknown): boolean { return value === this || this.children.some(child => child.contains(value)); }
  getAttribute(name: string): unknown { return this.props[name] ?? null; }
  matches(selector: string): boolean {
    return selector.split(',').some(part => {
      const value = part.trim();
      if (value === '*') return true;
      if (value === this.tag) return true;
      if (value === '[hidden]') return this.props.hidden === true;
      if (value === '[inert]') return this.props.inert === true;
      if (value === '[aria-hidden="true"]') return this.props['aria-hidden'] === 'true';
      if (value.startsWith('[contenteditable]')) return this.props.contentEditable === true;
      if (value === '.alert-row[data-alert-id]') return this.props['data-alert-id'] !== undefined;
      const role = /^\[role="([^"]+)"\]$/.exec(value); if (role) return this.props.role === role[1];
      const label = /^\[aria-label="([^"]+)"\]$/.exec(value); if (label) return this.props['aria-label'] === label[1];
      if (value === '[tabindex="0"]') return this.tabIndex === 0;
      if (value === '[tabindex]:not([tabindex="-1"])') return this.tabIndex >= 0;
      const native = /^(button|input|select|textarea)((?::not\(:disabled\)|:not\(\[tabindex="-1"\]\))*)$/.exec(value); if (native) return this.tag === native[1] && (!value.includes(':disabled') || !this.disabled) && (!value.includes('[tabindex="-1"]') || this.tabIndex !== -1);
      const input = /^input\[type="checkbox"\]$/.exec(value); if (input) return this.tag === 'input' && this.props.type === 'checkbox';
      if (value.startsWith('button[role="menuitem"]')) return this.tag === 'button' && this.props.role === 'menuitem' && !this.disabled;
      return false;
    });
  }
  closest(selector: string): ModelNode | null { return this.matches(selector) ? this : this.parent?.closest(selector) ?? null; }
  querySelectorAll(selector: string): ModelNode[] { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector: string): ModelNode | null { return this.querySelectorAll(selector)[0] ?? null; }
  focus() {
    const prior = focusDocument.activeElement;
    // Native focus on the already-active element emits no new focus event.
    if (prior === this) return;
    if (prior && prior !== this) invoke(prior.props.onBlur, input(prior, { relatedTarget: this }));
    focusDocument.activeElement = this;
    dispatchDocument('focusin', input(this, { relatedTarget: prior, currentTarget: focusDocument }));
    invoke(this.props.onFocus, input(this, { relatedTarget: prior })); this.afterFocus?.();
  }
  scrollIntoView() { /* Scroll geometry is outside this controlled node model. */ }
}
export function input(node: ModelNode, extra: Record<string, unknown> = {}) {
  return { target: node, currentTarget: node, key: '', button: 0, repeat: false, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false, nativeEvent: { isComposing: false }, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...extra };
}
export function invoke(callback: unknown, event?: unknown) { if (typeof callback === 'function') (callback as (value?: unknown) => void)(event); }
export function bindRef(value: unknown, node: ModelNode | null) { if (typeof value === 'function') (value as (node: ModelNode | null) => void)(node); else if (value !== null && typeof value === 'object' && 'current' in value) (value as { current: unknown }).current = node; }
const cleanups: Array<() => void> = [];
function store(): Store { return { cells: [], effects: new Map(), pending: [], cursor: 0, writes: 0 }; }

function mounted(renderComponent: () => unknown, owner = store()) {
  let tree: unknown, retired = false, refs = new Map<string, { element: ModelElement; node: ModelNode }>();
  const nodes = new Map<string, ModelNode>(), elementNodes = new Map<ModelElement, ModelNode>();
  const render = () => {
    if (retired) throw new Error('Synthetic component is retired');
    hook.current = owner; owner.cursor = 0; tree = renderComponent();
    const next = new Map<string, { element: ModelElement; node: ModelNode }>(); elementNodes.clear();
    const visit = (value: unknown, parent: ModelNode | null, path: string) => {
      if (Array.isArray(value)) { value.forEach((child, index) => visit(child, parent, path + '.' + index)); return; }
      if (!element(value)) return;
      if (typeof value.type !== 'string') { visit(value.props.children, parent, path + '.fragment'); return; }
      const key = value.props['data-alert-id'] ? 'row:' + value.props['data-alert-id'] : path;
      let node = nodes.get(key); if (!node) { node = new ModelNode(); nodes.set(key, node); }
      node.tag = value.type; node.props = value.props; node.nativeChecked = undefined; node.parent = parent; node.children = []; node.isConnected = true;
      parent?.children.push(node); next.set(key, { element: value, node }); elementNodes.set(value, node);
      visit(value.props.children, node, key + '.children');
    };
    visit(tree, null, 'root');
    for (const [key, previous] of refs) {
      if (next.get(key)?.node !== previous.node) { previous.node.isConnected = false; if (focusDocument.activeElement === previous.node) focusDocument.activeElement = focusDocument.body; }
      if (next.get(key)?.node !== previous.node || next.get(key)?.element.props.ref !== previous.element.props.ref) bindRef(previous.element.props.ref, null);
    }
    for (const [key, nextRef] of next) if (refs.get(key)?.node !== nextRef.node || refs.get(key)?.element.props.ref !== nextRef.element.props.ref) bindRef(nextRef.element.props.ref, nextRef.node);
    refs = next; return tree;
  };
  const settle = () => {
    for (let pass = 0; pass < 16; pass++) {
      const writes = owner.writes; render(); const effects = owner.pending.splice(0); for (const effect of effects) effect();
      if (!effects.length && owner.writes === writes) return tree;
    }
    throw new Error('Synthetic effect model did not settle');
  };
  const find = (predicate: (node: ModelElement) => boolean, root: unknown = render()) => {
    const result = all(root, predicate); if (result.length !== 1) throw new Error(`Expected one control, found ${result.length}`); return result[0];
  };
  const nodeFor = (value: ModelElement) => { const node = elementNodes.get(value); if (!node) throw new Error('Control is not mounted by current render'); return node; };
  const dispose = () => { if (retired) return; retired = true; for (const effect of owner.effects.values()) effect.cleanup?.(); for (const value of refs.values()) { bindRef(value.element.props.ref, null); value.node.isConnected = false; } owner.pending.length = 0; };
  cleanups.push(dispose);
  return { owner, nodes, render, settle, find, nodeFor, dispose, text: () => text(render()) };
}

export { mounted as mountControlledComponent };

const dataset = fixtureDataset('GME', 1);
export function notice(id: string, sequence: number, at: number): AlertNotification {
  return { id: `SYNTHETIC ${id} notification ${sequence}`, alertId: id, name: 'SYNTHETIC recorded', message: 'SYNTHETIC retained history', value: 23, at, sequence, barId: `SYNTHETIC bar ${sequence}`, mode: 'ordinary', runId: 'ordinary', local: true };
}
export function saved(id: string, status: LocalAlert['status'] = 'active', expiresAt: number | null = null): LocalAlert {
  return { ...createLocalAlert({ id, name: `SYNTHETIC ${id}`, message: 'SYNTHETIC selected-action fixture', instrumentId: dataset.instrument.id, sourceId: 'close', frequency: 'every-time', createdAt: 100, expiresAt, mode: 'ordinary', runId: 'ordinary', condition: { kind: 'greater', value: 20 } }),
    status, lastSequence: 9, lastTime: 119, lastValue: status === 'waiting-for-data' ? null : 42, previousClosedValue: status === 'waiting-for-data' ? null : 31,
    currentBarId: status === 'waiting-for-data' ? null : 'SYNTHETIC current', closedBars: status === 'waiting-for-data' ? [] : [{ id: 'SYNTHETIC closed', value: 31 }],
    lastTriggeredAt: 119, lastTriggeredBar: 'SYNTHETIC bar 9', history: [notice(id, 3, 110), notice(id, 9, 119)] };
}
type Publish = (next: LocalAlert[], base?: LocalAlert[]) => unknown;
export function setup(initial: LocalAlert[] = [saved('a'), saved('b'), saved('c')]) {
  expect(validateLocalAlerts(initial).ok).toBe(true);
  let clock = 120, authorityToken: object = {}, authorityReady = true, publisher: Publish;
  const callbackErrors: unknown[] = [];
  // Expectations inside callbacks may be caught by production. Capture them here
  // and assert outside the handler instead of allowing a swallowed assertion pass.
  const checkCallback = (work: () => void) => { try { work(); } catch (error) { callbackErrors.push(error); } };
  const assertAuthority = vi.fn((expected: object) => { if (!authorityReady || expected !== authorityToken) throw new Error('SYNTHETIC authority retired'); });
  const readTime = vi.fn(() => clock), request = vi.fn();
  const props: AlertDialogProps = {
    open: true, onClose: vi.fn(() => { props.open = false; }), alerts: initial,
    onAlertsChange: (next, base) => publish(next, base) as boolean | void,
    instrument: dataset.instrument, now: 100, events: [], externallyProcessed: true,
    onRequestObservation: request, readActionTime: readTime,
    managerActionAuthority: { token: authorityToken, assertCurrent: assertAuthority },
  };
  publisher = (next, base) => { if (base !== props.alerts) return false; props.alerts = next; return true; };
  const publish = vi.fn((next: LocalAlert[], base?: LocalAlert[]) => publisher(next, base));
  const view = mounted(() => AlertDialog(props));
  const field = (label: string) => view.find(node => node.props['aria-label'] === label);
  const row = (id: string) => view.find(node => node.type === 'article' && node.props['data-alert-id'] === id);
  const button = (name: string, root?: unknown) => view.find(node => node.type === 'button' && text(node) === name, root);
  const callButton = (name: string, root?: unknown) => {
    const control = button(name, root), target = view.nodeFor(control);
    target.focus(); invoke(control.props.onClick, input(target)); view.settle();
  };
  const change = (label: string, value: string) => { const control = field(label), target = view.nodeFor(control); invoke(control.props.onChange, input(target, { target: { value } })); view.settle(); };
  const checkbox = (id: string) => view.find(node => node.type === 'input' && node.props.type === 'checkbox' && node.props['aria-label'] === `Select alert SYNTHETIC ${id}`, row(id));
  const toggle = (id: string) => { const control = checkbox(id), target = view.nodeFor(control); target.focus(); target.nativeChecked = !target.checked; invoke(control.props.onChange, input(target)); view.settle(); };
  const selected = () => all(view.render(), node => node.type === 'article' && node.props['data-alert-id'] !== undefined).filter(row => all(row, control => control.type === 'input' && control.props.type === 'checkbox' && control.props.checked === true).length === 1).map(row => row.props['data-alert-id']);
  const rowButton = (id: string, name: string) => callButton(name, row(id));
  const escape = () => { const control = view.find(node => node.props.role === 'dialog'), target = view.nodeFor(control); invoke(control.props.onKeyDown, input(target, { key: 'Escape', target: focusDocument.activeElement ?? target })); view.settle(); };
  view.settle();
  return { ...view, props, publish, request, readTime, assertAuthority, field, row, button, callButton, change, checkbox, toggle, selected, rowButton, escape, callbackErrors, checkCallback,
    setClock(value: number) { clock = value; },
    publishing(next: Publish) { publisher = next; },
    replaceAuthority() { authorityToken = {}; props.managerActionAuthority = { token: authorityToken, assertCurrent: assertAuthority }; },
    readiness(value: boolean) { authorityReady = value; },
  };
}

beforeEach(() => {
  hook.current = null; const body = new ModelNode(); body.tag = 'body'; focusDocument = { activeElement: body, body, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal('document', focusDocument); vi.stubGlobal('Element', ModelNode); vi.stubGlobal('HTMLElement', ModelNode);
});
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

