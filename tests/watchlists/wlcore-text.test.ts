import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {listAlertSessionEligibility} from '../../src/domain/watchlist-alerts';
import {createWatchBook} from '../../src/watchlists/model';
import {watchListMenu} from '../../src/watchlists/menus';
import {DETAIL_TYPE_UNAVAILABLE_REASON} from '../../src/watchlists/details';
import {LV_METRIC_LABEL} from '../../src/watchlists/local-metrics';

// User-visible text: no em dash and no internal identifiers (decision labels or ledger ids) outside source comments.
const files=['src/watchlists/advanced-data.ts','src/watchlists/advanced.ts','src/watchlists/details.ts','src/watchlists/local-metrics.ts','src/watchlists/membership.ts','src/watchlists/menus.ts','src/watchlists/model.ts','src/watchlists/notes.ts','src/watchlists/quotes.ts','src/domain/watchlist-alerts.ts','src/ui/WatchlistPanel.tsx','src/ui/WatchlistAdvancedDialog.tsx','src/ui/SymbolDetails.tsx','src/ui/WatchlistCompositionPie.tsx'];
const stripComments=(source:string)=>source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:'"\\])\/\/.*$/gm,'$1');
describe('wording',()=>{
 for(const file of files)it(file+' has no em dash and no internal ids outside comments',()=>{
  const source=readFileSync(file,'utf8');expect(source).not.toContain('\u2014');
  const code=stripComments(source);expect(code).not.toMatch(/WLCORE-DD|WLCORE|\bAN\.WL\.|APP\.WATCH|ALERT\.ENTRY|Q-WL\d/);
 });
 it('runtime strings read as plain LV wording',()=>{
  const strings=[listAlertSessionEligibility('regular','unknown')!,listAlertSessionEligibility('extended','regular')!,DETAIL_TYPE_UNAVAILABLE_REASON,LV_METRIC_LABEL,...watchListMenu(createWatchBook(['GME']),{listAlert:null}).flatMap(group=>[group.label??'',...group.items.map(item=>item.label+(item.disabled??''))])];
  for(const value of strings){expect(value).not.toContain('\u2014');expect(value).not.toMatch(/WLCORE|\bDD-\d|AN\.WL/);}
 });
});
