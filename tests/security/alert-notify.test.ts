import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
// SYNTHETIC checks of the OS alert notification boundary. No real notification is shown.
describe('alert OS notification channel', () => {
  const { alertNotificationInput, showAlertNotification } = require('../../electron/alert-notify.cjs');
  it('accepts only a short title, body and tag', () => {
    expect(alertNotificationInput({ title: 'Alert: A', body: 'Value 1', tag: 'id-1' })).toEqual({ title: 'Alert: A', body: 'Value 1', tag: 'id-1' });
    for (const bad of [null, [], {}, { title: 'a', body: 'b' }, { title: 'a', body: 'b', tag: 't', icon: 'x' }, { title: '', body: 'b', tag: 't' }, { title: 'a'.repeat(300), body: 'b', tag: 't' }, { title: 'a', body: 'b'.repeat(5000), tag: 't' }, { title: 'a', body: 5, tag: 't' }])
      expect(() => alertNotificationInput(bad)).toThrow();
  });
  it('shows a silent notification only where the OS supports it, and says so otherwise', () => {
    const show = vi.fn(), created: unknown[] = [];
    class Fake { static isSupported() { return true; } constructor(options: unknown) { created.push(options); } show = show; }
    expect(showAlertNotification(Fake, { title: 'T', body: 'B', tag: 'x' })).toEqual({ shown: true });
    expect(created).toEqual([{ title: 'T', body: 'B', silent: true }]);
    expect(show).toHaveBeenCalledTimes(1);
    class Off { static isSupported() { return false; } }
    expect(showAlertNotification(Off, { title: 'T', body: 'B', tag: 'x' })).toEqual({ shown: false });
  });
  it('is registered behind the trusted handler and exposed by the preload', () => {
    const main = readFileSync('electron/main.cjs', 'utf8'), preload = readFileSync('electron/preload.cjs', 'utf8'), types = readFileSync('electron/bridge.d.ts', 'utf8');
    expect(main).toMatch(/'lv:alert:notify'\s*:\s*async value\s*=>/);
    expect(main).toMatch(/Notification/);
    expect(preload).toMatch(/showAlertNotification:\s*value\s*=>\s*invoke\('lv:alert:notify',\s*value\)/);
    expect(types).toMatch(/showAlertNotification\?/);
  });
});
