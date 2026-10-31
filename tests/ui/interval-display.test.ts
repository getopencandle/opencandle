import {expect,it} from 'vitest';
import {shortIntervalText} from '../../src/ui/interval-display';
it('whole hours show as Nh on the badge and toolbar; everything else is unchanged',()=>{
 expect(['60m','120m','180m','240m','600m','1440m'].map(shortIntervalText)).toEqual(['1h','2h','3h','4h','10h','24h']);
 expect(['1m','7m','45m','90m','150m','1D','3D','1W','1M','12M','10s','100T','0m'].map(shortIntervalText)).toEqual(['1m','7m','45m','90m','150m','1D','3D','1W','1M','12M','10s','100T','0m']);
});
it('the header badge and favorites toolbar use the short text (source wiring check, not DOM evidence)',async()=>{
 // The badge and favorites moved into src/ui/interval-toolbar.tsx (fixed favorites, current interval on the
 // dropdown only when it is not a favorite). The old inline App markup pins were replaced by the strip model and its wiring.
 const {readFileSync}=await import('node:fs'),app=readFileSync('src/ui/App.tsx','utf8');
 expect(app).toContain('currentId:currentIntervalId(workspace.chartStyle,workspace.chartTypeSettings,dataset.resolution)');// A Range chart shows its R interval.
 const {intervalStrip,currentIntervalId}=await import('../../src/ui/interval-toolbar');
 expect(intervalStrip(['60m','240m'],'60m').favorites.map(row=>row.label)).toEqual(['1h','4h']);
 expect(intervalStrip(['60m'],'120m').current).toBe('2h');
 expect(currentIntervalId('range',{range:{range:25}} as any,'1D')).toBe('25R');
});
