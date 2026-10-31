import { describe, expect, it } from 'vitest';
import { classifyPaperShortcut, PAPER_SHORTCUT_NO_PRESET_MESSAGE, type PaperShortcutContext, type PaperShortcutEvent } from '../../src/ui/paper-shortcuts';

const chart: PaperShortcutContext = { chartFocused: true, dialogOpen: false, menuOpen: false, presetSelected: true, oneClick: true };
const key = (overrides: Partial<PaperShortcutEvent> = {}): PaperShortcutEvent => ({ key: 'B', shiftKey: true, ctrlKey: false, altKey: false, metaKey: false, ...overrides });
const target = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, isContentEditable: false, getAttribute: () => null, ...extra });

describe('Shift+B and Shift+S classification', () => {
  it('buys on Shift+B and sells on Shift+S with chart focus and a selected preset', () => {
    expect(classifyPaperShortcut(key(), chart)).toEqual({ kind: 'place', side: 'buy' });
    expect(classifyPaperShortcut(key({ key: 'S' }), chart)).toEqual({ kind: 'place', side: 'sell' });
    expect(classifyPaperShortcut(key({ key: 'b' }), chart)).toEqual({ kind: 'place', side: 'buy' });
  });
  it('opens the preset ticket instead when one-click is off', () => {
    expect(classifyPaperShortcut(key(), { ...chart, oneClick: false })).toEqual({ kind: 'open-ticket', side: 'buy' });
    expect(classifyPaperShortcut(key({ key: 'S' }), { ...chart, oneClick: false })).toEqual({ kind: 'open-ticket', side: 'sell' });
  });
  it('says what to do when no preset is selected', () => {
    expect(PAPER_SHORTCUT_NO_PRESET_MESSAGE).toBe('Select an order preset to use Shift+B or Shift+S');
    expect(classifyPaperShortcut(key(), { ...chart, presetSelected: false })).toEqual({ kind: 'status', message: PAPER_SHORTCUT_NO_PRESET_MESSAGE });
  });
  it.each([
    ['plain b', key({ shiftKey: false })],
    ['other key', key({ key: 'C' })],
    ['Ctrl+Shift+B', key({ ctrlKey: true })],
    ['Alt+Shift+B', key({ altKey: true })],
    ['Meta+Shift+B', key({ metaKey: true })],
    ['auto repeat', key({ repeat: true })],
    ['IME composition', key({ isComposing: true })],
    ['IME process key', key({ key: 'Process' })],
    ['default already prevented', key({ defaultPrevented: true })],
  ])('ignores %s', (_name, event) => { expect(classifyPaperShortcut(event, chart)).toEqual({ kind: 'ignore' }); });
  it.each([
    ['input', target('INPUT')], ['textarea', target('TEXTAREA')], ['select', target('SELECT')],
    ['contenteditable', target('DIV', { isContentEditable: true })],
    ['role textbox', target('DIV', { getAttribute: (name: string) => name === 'role' ? 'textbox' : null })],
    ['role combobox', target('DIV', { getAttribute: (name: string) => name === 'role' ? 'combobox' : null })],
  ])('does nothing in a %s', (_name, element) => { expect(classifyPaperShortcut(key({ target: element }), chart)).toEqual({ kind: 'ignore' }); });
  it('works without chart focus, and does nothing in a dialog or in an open menu', () => {
    // The one-click shortcut rule protects editor, input and IME focus only; chart focus is no longer required.
    expect(classifyPaperShortcut(key(), { ...chart, chartFocused: false })).toEqual({ kind: 'place', side: 'buy' });
    expect(classifyPaperShortcut(key({ target: target('INPUT') }), { ...chart, chartFocused: false })).toEqual({ kind: 'ignore' });
    expect(classifyPaperShortcut(key(), { ...chart, chartFocused: false, dialogOpen: true })).toEqual({ kind: 'ignore' });
    expect(classifyPaperShortcut(key(), { ...chart, chartFocused: false, menuOpen: true })).toEqual({ kind: 'ignore' });
    expect(classifyPaperShortcut(key(), { ...chart, dialogOpen: true })).toEqual({ kind: 'ignore' });
    expect(classifyPaperShortcut(key(), { ...chart, menuOpen: true })).toEqual({ kind: 'ignore' });
  });
  it('does not show the preset hint for keys that are not the shortcut', () => {
    expect(classifyPaperShortcut(key({ key: 'C' }), { ...chart, presetSelected: false })).toEqual({ kind: 'ignore' });
    expect(classifyPaperShortcut(key({ target: target('INPUT') }), { ...chart, presetSelected: false })).toEqual({ kind: 'ignore' });
  });
  it('a button target on the chart is not a text field', () => {
    expect(classifyPaperShortcut(key({ target: target('BUTTON') }), chart)).toEqual({ kind: 'place', side: 'buy' });
  });
});
