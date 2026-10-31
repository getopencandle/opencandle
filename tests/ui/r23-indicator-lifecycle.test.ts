import {beforeEach,expect,it,vi} from 'vitest';
import {catalogDefinition} from '../../src/domain/indicator-catalog';
import {R23_INDICATOR_IDS} from '../../src/domain/indicators-ext/r23-catalog';
import {INDICATOR_KINDS,indicatorFillIds} from '../../src/chart/indicator-settings';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {indicatorNames} from '../../src/ui/indicator-dialog-model';
import {instantiateIndicatorTemplate,saveIndicatorTemplate,createIndicatorTemplates} from '../../src/ui/indicator-templates';
import {indicatorDecorationId} from '../../src/chart/indicator-presentation';
import {makeHarness,realChart,valuesOf,expected,settingsOf,findAll} from './indicator-real-port-harness';

// The lifecycle flow (tests/ui/indicator-catalog-lifecycle.test.ts) for the kinds on a longer
// SYNTHETIC daily fixture (600 bars, so Ichimoku 52/26, Linear regression Count 100 and 15 monthly pivot periods all
// have data, and a one-step edit of the first numeric input changes the values). Behavioral evidence only; the numerical
// evidence is tests/domain/r23-indicator-oracles.test.ts.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});
/** SYNTHETIC labelled fixture: 600 daily bars, ms timestamps, positive volume, swings of about +/-12%. */
const LONG=Array.from({length:600},(_,i)=>{const close=100+12*Math.sin(i/9)+4*Math.sin(i/2.3)+(i%7)*0.5;return {time:1600000000000+i*86400000,open:close-0.6+(i%3)*0.4,high:close+1.5+(i%4)*0.3,low:close-1.4-(i%5)*0.2,close,volume:1000+(i*37)%400};});
const LONG_DOMAIN=LONG.map(bar=>({...bar,time:bar.time/1000}));

it('the kinds are listed in the dialog and searchable by name or acronym',()=>{
 for(const kind of R23_INDICATOR_IDS)expect(INDICATOR_KINDS).toContain(kind);
 const ui=dialog({bars:LONG}),labels=findAll(ui.render(),node=>node.type==='button'&&String(node.props['aria-label']??'').startsWith('Add ')).map(node=>node.props['aria-label']);
 for(const kind of R23_INDICATOR_IDS)expect(labels).toContain('Add '+indicatorNames[kind]);
 const search=(value:string)=>{findAll(ui.render(),node=>node.props?.['aria-label']==='Search indicators')[0].props.onChange({target:{value}});return findAll(ui.render(),node=>String(node.props?.['aria-label']??'').startsWith('Add ')).map(node=>node.props['aria-label']);};
 expect(search('ichimoku')).toEqual(['Add Ichimoku cloud']);expect(search('alma')).toEqual(['Add Arnaud Legoux moving average']);expect(search('vwma')).toEqual(['Add Volume weighted moving average']);
});

it.each(R23_INDICATOR_IDS.map(kind=>[kind,catalogDefinition(kind)!] as const))('%s: add with flagged defaults, default pane, edit, invalid value, hide/show, remove, restart and template',(kind,definition)=>{
 const ui=dialog({bars:LONG});ui.addAndEdit('Add '+indicatorNames[kind]);let rows=ui.port.list();const row=rows[0];
 expect(row.inputs).toEqual(Object.fromEntries(definition.inputs.map(input=>[input.key,input.defval])));expect(settingsOf(row)).toEqual({kind,...factoryIndicatorDefault(kind)});
 expect(row.series.map(series=>series.id)).toEqual(definition.plots.map(plot=>plot.id));expect(valuesOf(ui.port,row.id)).toEqual(expected(kind,row.inputs,LONG_DOMAIN));
 expect(valuesOf(ui.port,row.id).some(series=>series.values.some(value=>value!==null))).toBe(true);expect(row.diagnostics).toEqual([]);
 if(definition.overlay)expect(row.paneId).toBe('price');else expect(row.paneId).not.toBe('price');
 // The depth-blocked zig zag rule makes Depth 10 and 11 draw the same pivots on LONG, so zig zag edits its deviation.
 const field=(kind==='zigzag'?definition.inputs.find(input=>input.key==='deviation'):undefined)??definition.inputs.find(input=>input.type==='int'&&(input.min??1)>=1)??definition.inputs.find(input=>input.type==='float');
 expect(field,'every R23 kind has an editable numeric input').toBeDefined();
 const next=field!.type==='int'?(field!.defval as number)+1:+(((field!.defval as number)*1.5).toFixed(4));const before=valuesOf(ui.port,row.id);
 ui.sEdit(field!.title,String(next));ui.sSubmit();rows=ui.port.list();expect(rows[0].inputs[field!.key]).toBe(next);expect(valuesOf(ui.port,row.id)).toEqual(expected(kind,rows[0].inputs,LONG_DOMAIN));expect(valuesOf(ui.port,row.id)).not.toEqual(before);
 const update=vi.spyOn(ui.port,'update');ui.sEdit(field!.title,field!.min===undefined?'':String(field!.min-1));expect(ui.sAlert()).not.toBe('');expect(ui.sButton('Apply indicator settings').props.disabled).toBe(true);ui.sSubmit();expect(update).not.toHaveBeenCalled();ui.sClick('Discard draft and reload');update.mockRestore();
 const edited=valuesOf(ui.port,row.id),native=ui.host.live.get(row.rendererId),emitted=structuredClone(native.emitted);
 ui.click('Hide '+ui.labels().get(row.id));expect(native.visible).toBe(false);ui.click('Show '+ui.labels().get(row.id));expect(native.emitted).toEqual(emitted);expect(valuesOf(ui.port,row.id)).toEqual(edited);
 const saved=JSON.parse(JSON.stringify(ui.port.serialize())),restarted=realChart(LONG);restarted.port.restore(saved);expect(restarted.port.list().map(settingsOf)).toEqual(ui.port.list().map(settingsOf));expect(valuesOf(restarted.port,row.id)).toEqual(edited);
 let n=0;const template=saveIndicatorTemplate(createIndicatorTemplates(),'T '+kind,{indicators:saved,scripts:[],rememberSymbol:false,rememberInterval:false,source:null},()=> 'template'),copy=instantiateIndicatorTemplate(template.records[0],()=> 'copy-'+ ++n),target=realChart(LONG);
 target.port.restore(copy.indicators);expect(valuesOf(target.port,'copy-1')).toEqual(edited);
 ui.click('Remove '+ui.labels().get(row.id));expect(ui.port.list()).toEqual([]);expect(ui.host.live.size).toBe(0);
});

it('string choices: pivot type and timeframe edit through the settings model and recalculate',()=>{
 const chart=realChart(LONG),id=chart.port.add('pivots');
 for(const type of ['Fibonacci','Woodie','Classic','DM','Camarilla']){chart.port.update(id,{inputs:{type}});expect(valuesOf(chart.port,id)).toEqual(expected('pivots',{type,timeframe:'Auto',pivotsBack:15},LONG_DOMAIN));}
 chart.port.update(id,{inputs:{type:'Traditional',timeframe:'Weekly'}});expect(valuesOf(chart.port,id)).toEqual(expected('pivots',{type:'Traditional',timeframe:'Weekly',pivotsBack:15},LONG_DOMAIN));
 expect(()=>chart.port.update(id,{inputs:{type:'Fib'}})).toThrow();
});

it('styles: cloud and channel backgrounds, zero lines, default plot styles',()=>{
 expect(indicatorFillIds('ichimoku')).toEqual(['band','bearish']);expect(indicatorFillIds('lrc')).toEqual(['band']);expect(indicatorFillIds('pivots')).toEqual([]);
 const chart=realChart(LONG),ichimoku=chart.port.add('ichimoku'),lrc=chart.port.add('lrc'),cmo=chart.port.add('cmo'),trix=chart.port.add('trix'),efi=chart.port.add('efi');
 const emitted=(id:string)=>chart.host.live.get(chart.port.list().find(row=>row.id===id)!.rendererId).emitted;
 expect(emitted(ichimoku).fills).toHaveLength(1);expect(emitted(lrc).fills).toHaveLength(1);
 for(const id of [cmo,trix,efi])expect(emitted(id).priceLines.find((line:any)=>line.id===indicatorDecorationId(id,'guide:zero')).price).toBe(0);
 expect(factoryIndicatorDefault('zigzag').plots.zigzag).toMatchObject({color:'#2962ff',width:2,kind:'line'});
 expect(Object.keys(factoryIndicatorDefault('pivots').plots)).toEqual(['p','r1','s1','r2','s2','r3','s3','r4','s4','r5','s5']);
});
