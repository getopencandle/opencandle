import type { PaperSide } from '../domain/paper';

/** Shift+B buys and Shift+S sells with the selected order preset, from any focus except text fields, IME composition, dialogs
 * and open menus (chart focus is
 * not required). */
export const PAPER_SHORTCUT_NO_PRESET_MESSAGE = 'Select an order preset to use Shift+B or Shift+S';
export interface PaperShortcutTarget { tagName?: string; isContentEditable?: boolean; getAttribute?: (name: string) => string | null; }
export interface PaperShortcutEvent {
  key: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean;
  repeat?: boolean; isComposing?: boolean; defaultPrevented?: boolean; target?: PaperShortcutTarget | null;
}
/** `chartFocused` is informational only: it no longer gates the shortcut. */
export interface PaperShortcutContext { chartFocused?: boolean; dialogOpen: boolean; menuOpen: boolean; presetSelected: boolean; oneClick: boolean; }
export type PaperShortcutAction =
  | { kind: 'ignore' }
  | { kind: 'status'; message: string }
  | { kind: 'place'; side: PaperSide }
  | { kind: 'open-ticket'; side: PaperSide };

const TEXT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const TEXT_ROLES = new Set(['textbox', 'combobox', 'searchbox', 'spinbutton']);
function typingTarget(target: PaperShortcutTarget | null | undefined): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  if (typeof target.tagName === 'string' && TEXT_TAGS.has(target.tagName.toUpperCase())) return true;
  const role = target.getAttribute?.('role');
  return typeof role === 'string' && TEXT_ROLES.has(role);
}
/**
 * Pure classification for the root key dispatcher so exactly one handler acts. The caller performs the action. Composition,
 * auto-repeat, modifier chords, text fields, dialogs and open menus never trade.
 */
export function classifyPaperShortcut(event: PaperShortcutEvent, context: PaperShortcutContext): PaperShortcutAction {
  const ignore: PaperShortcutAction = { kind: 'ignore' };
  if (event.isComposing || event.key === 'Process' || event.defaultPrevented || event.repeat) return ignore;
  if (!event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return ignore;
  const letter = event.key.length === 1 ? event.key.toLowerCase() : '';
  if (letter !== 'b' && letter !== 's') return ignore;
  if (typingTarget(event.target) || context.dialogOpen || context.menuOpen) return ignore;
  if (!context.presetSelected) return { kind: 'status', message: PAPER_SHORTCUT_NO_PRESET_MESSAGE };
  const side: PaperSide = letter === 'b' ? 'buy' : 'sell';
  return context.oneClick ? { kind: 'place', side } : { kind: 'open-ticket', side };
}
