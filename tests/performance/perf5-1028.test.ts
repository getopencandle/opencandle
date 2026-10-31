import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {it,expect} from 'vitest';
// The range buttons' servable check aggregates once per newly opened symbol; it must stay behind a deferred read.
it('bottomServed reads deferred inputs, not the live chart identity',()=>{
 const app=readFileSync(resolve('src/ui/App.tsx'),'utf8');
 expect(app).toContain('deferredServedInputs=useDeferredValue(bottomServedInputs)');
 const at=app.indexOf('const bottomServed=useMemo('),end=app.indexOf('[deferredServedInputs,bottomCapacity]);',at)/* A range bars fix added bottomCapacity to the deps (pin stale since then) */;
 expect(at).toBeGreaterThan(0);expect(end).toBeGreaterThan(at);
 expect(app.slice(at,end)).not.toMatch(/resolveIntervalSwitch\(intervalUniverse|workspace\.intervals\.policy/);
});
