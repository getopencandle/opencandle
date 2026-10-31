import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decideStartupOpen, parseStartupOpenSymbol, STARTUP_OPEN_INTERVAL } from '../../src/ui/startup-open';
import { planAlpacaInterval, planCoinbaseInterval } from '../../src/domain/live-intervals';

const main = readFileSync('electron/main.cjs', 'utf8');
const preload = readFileSync('electron/preload.cjs', 'utf8');
const app = readFileSync('src/ui/App.tsx', 'utf8');
const startupOpenArg = new Function(`${/const startupOpenArg=.*;\r?\n/.exec(main)![0]}return startupOpenArg;`)() as (argv: unknown) => string | null;

describe('startup open wiring', () => {
  it('main parses and caps the argument', () => {
    expect(startupOpenArg(['x.exe', '--lv-open-symbol=GME'])).toBe('GME');
    expect(startupOpenArg(['--lv-open-symbol=BRK.B'])).toBe('BRK.B');
    expect(startupOpenArg(['--lv-open-symbol=btc-usd'])).toBe('btc-usd');
    for (const bad of ['', 'ABCDEFGHIJKLMN', 'A B', '../x', 'A;B', 'A\\B']) expect(startupOpenArg(['--lv-open-symbol=' + bad])).toBeNull();
    expect(startupOpenArg(['GME'])).toBeNull();
    expect(startupOpenArg(undefined)).toBeNull();
  });
  it('the channel is handled in main (behind trusted) and exposed by preload', () => {
    expect(main).toContain("'lv:startup:open-symbol': async value => {noInput(value);return startupOpenArg(process.argv);}");
    expect(main).toMatch(/ipcMain\.handle\(channel[\s\S]*?if \(!trusted\(event\)\)/);
    expect(preload).toContain("startupOpenSymbol: () => invoke('lv:startup:open-symbol')");
  });
  it('startup interval is accepted by both live feeds', () => {
    expect(planAlpacaInterval(STARTUP_OPEN_INTERVAL).ok).toBe(true);
    expect(planCoinbaseInterval(STARTUP_OPEN_INTERVAL).ok).toBe(true);
  });
  it('the App effect runs once, after load and key status are known', () => {
    const effect = /useEffect\(\(\)=>\{\s*if\(!loaded\|\|!alpacaKeyKnown\|\|startupOpenDone\.current\)return;\s*startupOpenDone\.current=true;[\s\S]*?\},\[loaded,alpacaKeyKnown\]\);/.exec(app);
    expect(effect).not.toBeNull();
    expect(effect![0]).toContain('decideStartupOpen(');
    expect(effect![0]).toContain('STARTUP_OPEN_INTERVAL');
    expect(app).toMatch(/if\(!lv\?\.alpacaKeyStatus\)\{setAlpacaKeyKnown\(true\);return;\}/);
    expect(app).toMatch(/\.finally\(\(\)=>\{if\(active\)setAlpacaKeyKnown\(true\);\}\)/);
  });
});

describe('startup open symbol', () => {
  it('parses stock and crypto symbols', () => {
    expect(parseStartupOpenSymbol(['app.exe', '--lv-open-symbol=GME'])).toEqual({ source: 'alpaca', symbol: 'GME' });
    expect(parseStartupOpenSymbol(['--lv-open-symbol=gme'])).toEqual({ source: 'alpaca', symbol: 'GME' });
    expect(parseStartupOpenSymbol(['--lv-open-symbol=BRK.B'])?.symbol).toBe('BRK.B');
    expect(parseStartupOpenSymbol(['--lv-open-symbol=btc-usd'])).toEqual({ source: 'coinbase', symbol: 'BTC-USD' });
  });
  it('rejects bad or missing values', () => {
    for (const bad of ['', 'TOOLONGSYM', 'GM E', '../x', 'A;B', 'DOGE-USD'])
      expect(parseStartupOpenSymbol(['--lv-open-symbol=' + bad])).toBeNull();
    expect(parseStartupOpenSymbol(['--other=GME', 'GME'])).toBeNull();
    expect(parseStartupOpenSymbol([])).toBeNull();
  });
  it('decides the action', () => {
    const gme = { source: 'alpaca', symbol: 'GME' } as const;
    expect(decideStartupOpen({ symbol: gme, alpacaKeyConfigured: true, coinbaseEnabled: false })).toEqual({ kind: 'open-live', source: 'alpaca', symbol: 'GME' });
    expect(decideStartupOpen({ symbol: gme, alpacaKeyConfigured: false, coinbaseEnabled: true })).toEqual({ kind: 'message', text: 'No Alpaca key saved. Add it in Settings > Data sources to open GME live.' });
    expect(decideStartupOpen({ symbol: null, alpacaKeyConfigured: true, coinbaseEnabled: true })).toEqual({ kind: 'none' });
    const btc = { source: 'coinbase', symbol: 'BTC-USD' } as const;
    expect(decideStartupOpen({ symbol: btc, alpacaKeyConfigured: false, coinbaseEnabled: true }).kind).toBe('open-live');
    expect(decideStartupOpen({ symbol: btc, alpacaKeyConfigured: true, coinbaseEnabled: false }).kind).toBe('message');
  });
});
