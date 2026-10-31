import {expect,it} from 'vitest';
import {createMultiChartState,resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {encodeIndicatorSource} from '../../src/domain/indicator-source';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {realChart,valuesOf} from '../ui/indicator-real-port-harness';

// L1 merge condition (F5): a new layout cell inherits the first chart's
// indicators with fresh ids, and indicator-on-indicator source references must follow those ids.
const data=fixtureDataset('GME',3);
const row=(id:string,kind:'sma'|'ema',inputs:Record<string,unknown>,paneId:string|null)=>({id,kind,...factoryIndicatorDefault(kind),inputs:{...factoryIndicatorDefault(kind).inputs,...inputs},paneId});
const chain=(dependentFirst=false)=>{const base=row('base-sma','sma',{length:2},'price'),dependent=row('dep-ema','ema',{length:3,source:encodeIndicatorSource('base-sma','sma')},'price');return dependentFirst?[dependent,base]:[base,dependent];};
const grid=(indicators:ReturnType<typeof chain>)=>createMultiChartState(data,{appearance:defaultTheme.appearance,indicators,scriptBindings:[]});

it('an inherited 2-indicator chain gets fresh ids, the dependent references the new source, both calculate and the cells stay independent',()=>{
 const previous=grid(chain());let n=0;const next=resizeMultiChartState(previous,'two-columns',()=> 'fresh-'+ ++n);
 const [firstId,secondId]=next.layout.cells.map(cell=>cell.id),first=next.cells[firstId].indicators,second=next.cells[secondId].indicators;
 expect(first.map(item=>item.id)).toEqual(['base-sma','dep-ema']);
 const [newBase,newDependent]=second;expect(newBase.kind).toBe('sma');expect(newBase.id).not.toBe('base-sma');expect(newDependent.id).not.toBe('dep-ema');
 expect(newDependent.inputs.source).toBe(encodeIndicatorSource(newBase.id,'sma'));expect(first[1].inputs.source).toBe(encodeIndicatorSource('base-sma','sma'));
 const a=realChart(),b=realChart();a.port.restore(first);b.port.restore(second);
 expect(b.port.list().every(item=>item.diagnostics.length===0&&item.series.length>0)).toBe(true);expect(valuesOf(b.port,newDependent.id)).toEqual(valuesOf(a.port,'dep-ema'));
 const before=valuesOf(a.port,'dep-ema');b.port.update(newBase.id,{inputs:{length:5}});
 expect(valuesOf(b.port,newDependent.id)).not.toEqual(before);expect(valuesOf(a.port,'dep-ema')).toEqual(before);expect(a.port.list()[0].inputs.length).toBe(2);
});

it('a dependent saved before its source is inherited with the source first and remains calculable',()=>{
 let n=0;const next=resizeMultiChartState(grid(chain(true)),'two-columns',()=> 'id-'+ ++n),second=next.cells[next.layout.cells[1].id].indicators;
 expect(second.map(item=>item.kind)).toEqual(['sma','ema']);expect(second[1].inputs.source).toBe(encodeIndicatorSource(second[0].id,'sma'));
 const host=realChart();host.port.restore(second);expect(host.port.list().every(item=>item.series.length>0)).toBe(true);
});

// A dependent whose
// source was removed is a supported saved state. Adding a chart copies it unchanged and it stays explicitly unavailable.
it('a dependent whose source was removed is inherited with its reference unchanged and stays source-unavailable',()=>{
 const live=realChart();live.port.restore(chain());live.port.remove('base-sma');
 const saved=live.port.serialize();expect(saved.map(item=>item.id)).toEqual(['dep-ema']);expect(live.port.list()[0].diagnostics[0]).toMatch(/source indicator was removed/);
 const removed=encodeIndicatorSource('base-sma','sma');expect(saved[0].inputs.source).toBe(removed);
 const previous=grid(saved.map(item=>({...item,paneId:'price'})) as ReturnType<typeof chain>);let n=0;
 const next=resizeMultiChartState(previous,'two-columns',()=> 'fresh-'+ ++n),second=next.cells[next.layout.cells[1].id].indicators;
 expect(second).toHaveLength(1);expect(second[0].id).not.toBe('dep-ema');expect(second[0].inputs.source).toBe(removed);
 expect(next.cells[next.layout.cells[0].id].indicators[0].inputs.source).toBe(removed);
 const copy=realChart();copy.port.restore(second);const row=copy.port.list()[0];
 expect(valuesOf(copy.port,second[0].id)).toEqual([]);expect(row.diagnostics[0]).toMatch(/source indicator was removed.*no price source was substituted/);
});
