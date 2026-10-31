/**
 * The dynamic text of `ctx.alert(name, message)` in a notification. The script is user
 * code, so its text is treated as untrusted display text:
 *  - control characters, zero-width characters, line and paragraph separators and bidirectional overrides become spaces,
 *    so the text cannot reorder or hide the alert's own lines;
 *  - `{{` and `}}` are split, so the text cannot add message placeholders (alert-message.ts renders them once later);
 *  - whitespace is folded, and the result is capped at SCRIPT_ALERT_MESSAGE_LIMIT characters with an ellipsis.
 * The notification keeps the alert's own message and adds the script text on its own line (only the script text when the
 * alert has no message). The 200-character cap and the layout.
 */
export const SCRIPT_ALERT_MESSAGE_LIMIT = 200;
const NOTIFICATION_LIMIT = 4000;
const HIDDEN = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;

export function sanitizeScriptAlertMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.slice(0, NOTIFICATION_LIMIT).replace(HIDDEN, ' ').replace(/\{\{/g, '{ {').replace(/\}\}/g, '} }').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > SCRIPT_ALERT_MESSAGE_LIMIT ? text.slice(0, SCRIPT_ALERT_MESSAGE_LIMIT - 1) + '\u2026' : text;
}
/** The alert's own message, then the sanitized script text on its own line; at most the saved-message limit. */
export function withScriptAlertMessage(message: string, dynamic: unknown): string {
  const extra = sanitizeScriptAlertMessage(dynamic);
  if (!extra) return message;
  return (message.trim() ? message + '\n' + extra : extra).slice(0, NOTIFICATION_LIMIT);
}
