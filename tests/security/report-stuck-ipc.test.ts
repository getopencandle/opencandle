import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const nodeRequire=createRequire(import.meta.url);

// Help > Report where you got stuck: the renderer asks, main opens one fixed address. No URL crosses the bridge.
it('report-stuck opens only the fixed issue form, takes no input, and stays out of layout windows',()=>{
 const main=readFileSync('electron/main.cjs','utf8'),preload=readFileSync('electron/preload.cjs','utf8');
 expect(main).toContain("const REPORT_STUCK_URL='https://github.com/getopencandle/opencandle/issues/new?template=where-i-got-stuck.yml';");
 expect(main).toContain("'lv:help:report-stuck': async value => {noInput(value);await require('electron').shell.openExternal(REPORT_STUCK_URL);return {opened:true};},");
 expect(main.match(/openExternal\(/g)?.length).toBe(1);
 expect(preload).toContain("reportStuck: () => invoke('lv:help:report-stuck'),");
 const {secondaryChannels,SECONDARY_CHANNELS}=nodeRequire('../../electron/windows.cjs');
 const channels:readonly string[]=SECONDARY_CHANNELS??secondaryChannels??[];
 expect(channels).not.toContain('lv:help:report-stuck');
 // The issue form it opens exists in the repository.
 expect(readFileSync('.github/ISSUE_TEMPLATE/where-i-got-stuck.yml','utf8')).toMatch(/^name: Where I got stuck/m);
});
