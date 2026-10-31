import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {WatchMonogram} from '../../src/ui/WatchlistPanel';
import type {Bar} from '../../src/domain/types';
import {renko,renkoBase} from '../../src/chart/derived/renko';
import {DERIVED_CALCULATION_KEYS,DERIVED_SETTING_FIELDS,derivedSettingsDefaults,validateDerivedSettings} from '../../src/chart/derived/derived-settings';
import {chartSettingsSchema,settingsDefaults,validateTypeSettings} from '../../src/chart/chart-settings';
import {highLowColor} from '../../src/chart/chart-types';
import {latestPricePresentation} from '../../src/chart/appearance-price';
import {installMagicCursor,magicCrosshairY,hasMagicCrosshair} from '../../src/chart/magic-cursor';
import {CURSOR_KINDS,CURSOR_ROW_KIND,MAGIC_UNAVAILABLE,createCursorKindController} from '../../src/chart/cursor-kind';
import {DRAWING_TOOL_CATALOG} from '../../src/ui/drawing-tool-catalog';
import {MONOGRAM_INK,MONOGRAM_PALETTE,monogramBadge,monogramInitials} from '../../src/watchlists/monogram';
import {LV_INDICATOR_PALETTE} from '../../src/chart/indicator-settings';
import {MEASURED_FEED_STATUS,RELABEL_REFUSAL,isMeasuredFeedRecord,measuredCompletion,measuredFeedStatus,measuredFromObservation,openMeasuredFeedChannel,registerMeasuredFeedAdapter,unregisterMeasuredFeedAdapter,validateMeasuredFeedRecord} from '../../src/domain/alert-measured-feed';

// Renko base price + one step back, High-low previous-close coloring, Magic cursor, watchlist monogram badges,
// measured-feed alert contract. SYNTHETIC data; Behavior; no GUI claim.
const closes=(values:number[]):Bar[]=>values.map((close,index)=>({time:1_700_000_000+index*60,open:close,high:close,low:close,close,volume:1}));
const base={boxMethod:'Traditional',atrLength:14,boxSize:1,percentage:1,source:'close',wicks:false};
const ok=<T,>(result:{ok:true;value:T}|{ok:false;diagnostic:unknown}):T=>{if(!result.ok)throw new Error(JSON.stringify(result.diagnostic));return result.value;};
const oc=(rows:{open:number;close:number}[])=>rows.map(row=>[row.open,row.close]);

describe('Renko base price and one step back building',()=>{
  it('defaults (0, off) are byte-identical to the old construction and transform id',()=>{
    const bars=closes([10,11.2,12.4,10.1,9.0]);
    const legacy=ok(renko(bars,base)),explicit=ok(renko(bars,{...base,basePrice:0,oneStepBackBuilding:false}));
    expect(explicit).toEqual(legacy);
    expect(legacy.transformId).not.toMatch(/basePrice|oneStepBack/);
    expect(oc(legacy.confirmed)).toEqual([[10,11],[11,12],[11,10],[10,9]]);
  });
  it('a positive base price anchors the brick grid at basePrice + n*box',()=>{
    expect(renkoBase(10.3,1,0)).toBe(10.3);
    expect(renkoBase(10.3,1,0.5)).toBe(10.5);
    expect(renkoBase(10.3,2,1)).toBe(11);
    const value=ok(renko(closes([10.3,11.6,12.6]),{...base,basePrice:0.5}));
    expect(oc(value.confirmed)).toEqual([[10.5,11.5],[11.5,12.5]]);
    expect(value.transformId).toContain('basePrice');
  });
  it('one step back: the reversal brick forms one box from the last close and spans the previous body',()=>{
    const bars=closes([10,11,12,11,10]);
    expect(oc(ok(renko(bars,base)).confirmed)).toEqual([[10,11],[11,12],[11,10]]);
    const step=ok(renko(bars,{...base,oneStepBackBuilding:true}));
    expect(oc(step.confirmed)).toEqual([[10,11],[11,12],[12,11],[11,10]]);
    expect(step.transformId).toContain('oneStepBack');
    // and back up after a down run
    expect(oc(ok(renko(closes([10,9,8,9]),{...base,oneStepBackBuilding:true})).confirmed)).toEqual([[10,9],[9,8],[8,9]]);
  });
  it('invalid values are refused, settings rows and defaults exist and are calculation keys',()=>{
    expect(renko(closes([1,2]),{...base,basePrice:-1}).ok).toBe(false);
    expect(renko(closes([1,2]),{...base,oneStepBackBuilding:'yes'}).ok).toBe(false);
    const keys=DERIVED_SETTING_FIELDS.renko.map(field=>field.key);
    expect(keys).toEqual(expect.arrayContaining(['basePrice','oneStepBackBuilding']));
    expect(DERIVED_CALCULATION_KEYS.renko).toEqual(expect.arrayContaining(['basePrice','oneStepBackBuilding']));
    expect(derivedSettingsDefaults('renko')).toMatchObject({basePrice:0,oneStepBackBuilding:false});
    expect(derivedSettingsDefaults('pointfigure').oneStepBackBuilding).toBe(false);
    expect(()=>validateDerivedSettings('renko',{basePrice:-2})).toThrow();
    expect(validateDerivedSettings('renko',{basePrice:100,oneStepBackBuilding:true})).toEqual({basePrice:100,oneStepBackBuilding:true});
  });
});

describe('High-low previous close coloring',()=>{
  it('rows and defaults: off, OpenCandle coral down color',()=>{
    const keys=chartSettingsSchema('highlow').fields.map(field=>field.key);
    expect(keys).toEqual(['bodyVisible','color','borderVisible','borderColor','labelsVisible','labelColor','previousClose','downColor']);
    expect(settingsDefaults('highlow')).toMatchObject({color:'#2962FF',previousClose:false,downColor:'#F23645'});
    expect(()=>validateTypeSettings('highlow',{previousClose:true,downColor:'#ff0000'})).not.toThrow();
  });
  it('ink: off keeps one color, on paints closes below the previous close down',()=>{
    expect(highLowColor('#2962FF','#F23645',false,false)).toBe('#2962FF');
    expect(highLowColor('#2962FF','#F23645',false,true)).toBe('#F23645');
    expect(highLowColor('#2962FF','#F23645',true,true)).toBe('#2962FF');
  });
  it('latest price label follows the same rule',()=>{
    const bars=[{time:1,open:10,high:11,low:9,close:10},{time:2,open:8,high:10,low:7,close:9}];
    const scene=(chartTypes:Record<string,unknown>)=>({priceStyle:'highlow',bars,style:{chartTypes:{highlow:chartTypes}}});
    const pane={bounds:{top:0,height:100},scale:{min:0,max:20}};
    expect(latestPricePresentation(scene({}) as never,{} as never,{} as never,pane as never)?.color).toBe('#2962FF');
    expect(latestPricePresentation(scene({previousClose:true}) as never,{} as never,{} as never,pane as never)?.color).toBe('#F23645');
  });
});

describe('Magic cursor',()=>{
  const host=()=>{
    class Native{bars=[{open:10,high:14,low:8,close:12}];coords={xToLogical:(x:number)=>x/10,priceToY:(price:number)=>200-price*10};
      seen:[number|null,number|null][]=[];lastPointer:{x:number;y:number}|null=null;lvCursorKind='cross';
      paneNodeAtY(y:number){return y<200?{id:'price',scale:{},bounds:{top:0,height:200}}:{id:'rsi',scale:{},bounds:{top:200,height:100}};}
      handlePointerMove(x:number|null,y:number|null){this.seen.push([x,y]);this.lastPointer=x===null||y===null?null:{x,y};}
      lvSetCursorKind(kind:string){if(!['cross','dot','arrow','demonstration'].includes(kind))throw new TypeError('bad');this.lvCursorKind=kind;}}
    class LV extends Native{}
    return {LV,make:()=>new LV()};
  };
  it('snaps the crosshair y to the nearest OHLC in the price pane only',()=>{
    const {make}=host(),r=make();
    expect(magicCrosshairY(r,0,95)).toBe(100);   // 10.5 -> open 10 (y 100)
    expect(magicCrosshairY(r,0,65)).toBe(60);    // 13.5 -> high 14 (y 60)
    expect(magicCrosshairY(r,0,250)).toBe(250);  // indicator pane: free
    expect(magicCrosshairY(r,50,95)).toBe(95);   // past the last bar: free
  });
  it('the controller arms the magnet for Magic, keeps the native cross kind, and frees it while a tool is armed',()=>{
    const {LV,make}=host(),r=make();
    expect(installMagicCursor(LV.prototype)).toBe(true);expect(installMagicCursor(LV.prototype)).toBe(true);
    expect(hasMagicCrosshair(r)).toBe(true);
    const c=createCursorKindController();c.connect(r);
    expect(c.choose('magic')).toEqual({ok:true,kind:'magic'});
    expect(r.lvCursorKind).toBe('cross');expect(c.paneClass()).toBeNull();
    r.handlePointerMove(0,95);expect(r.seen.at(-1)).toEqual([0,100]);
    c.armTool();r.handlePointerMove(0,95);expect(r.seen.at(-1)).toEqual([0,95]);
    c.disarmTool();r.handlePointerMove(0,95);expect(r.seen.at(-1)).toEqual([0,100]);
    expect(c.choose('dot').ok).toBe(true);r.handlePointerMove(0,95);expect(r.seen.at(-1)).toEqual([0,95]);
    r.handlePointerMove(null,null);expect(r.seen.at(-1)).toEqual([null,null]);
  });
  it('a renderer without a pointer-move entry leaves Magic unavailable; the catalog row arms it',()=>{
    const c=createCursorKindController();c.connect({lvSetCursorKind(){}});
    expect(c.choose('magic')).toEqual({ok:false,kind:'cross',reason:MAGIC_UNAVAILABLE});
    expect(CURSOR_KINDS).toContain('magic');expect(CURSOR_ROW_KIND['DW.CURSOR.MAGIC']).toBe('magic');
    const leaf=DRAWING_TOOL_CATALOG.flatMap(group=>group.sections.flatMap(section=>section.leaves)).find(row=>row.id==='DW.CURSOR.MAGIC');
    expect(leaf?.target).toEqual({kind:'cursor',cursor:'magic'});
  });
});

describe('Watchlist logo column: OpenCandle monogram badges',()=>{
  it('initials, stable OpenCandle palette color, dark ink, never a logo',()=>{
    expect(monogramInitials('GME')).toBe('GM');expect(monogramInitials('NASDAQ:A')).toBe('A');
    expect(monogramInitials('BRK.B')).toBe('BB');expect(monogramInitials('EUR/USD')).toBe('EU');expect(monogramInitials('---')).toBe('?');
    const a=monogramBadge('GME','NYSE:GME'),b=monogramBadge('GME','NYSE:GME');
    expect(a).toEqual(b);expect(MONOGRAM_PALETTE).toContain(a.background);expect(a.color).toBe(MONOGRAM_INK);
    expect(new Set(['AAPL','MSFT','GME','SPY','TSLA','NVDA','AMD','QQQ'].map(s=>monogramBadge(s).background)).size).toBeGreaterThan(2);
    expect([...MONOGRAM_PALETTE]).toEqual([...LV_INDICATOR_PALETTE]);
    expect(JSON.stringify(a)).not.toMatch(/https?:|\.png|\.svg/);
  });
  it('the panel badge renders initials on the palette color, decorative only',()=>{
    const html=renderToStaticMarkup(createElement(WatchMonogram,{symbol:'GME',marketKey:'NYSE:GME'}));
    expect(html).toContain('class="wl-monogram"');expect(html).toContain('aria-hidden="true"');expect(html).toContain('>GM<');
    expect(html.toLowerCase()).toContain(monogramBadge('GME','NYSE:GME').background);expect(html).not.toMatch(/<img/);
  });
});

describe('Measured feed alert contract',()=>{
  const rec=(sequence:number,extra:Record<string,unknown>={})=>({schemaVersion:1,kind:'measured-feed',adapterId:'test-feed',contractVersion:1,sequence,datasetKey:'k',sourceRevision:'r'+sequence,value:10,sourceTime:100,publishedAt:101,completedAt:160,receivedAt:162,...extra});
  it('no adapter: status says alerts use supplied snapshots',()=>{expect(measuredFeedStatus()).toBe(MEASURED_FEED_STATUS);});
  it('only records pulled from a registered adapter are measured; relabeled snapshots never are',()=>{
    const queue:unknown[]=[rec(1),rec(2,{completedAt:null}),rec(2)];
    registerMeasuredFeedAdapter({id:'test-feed',contractVersion:1,next:()=>queue.shift()??null});
    try{
      const channel=openMeasuredFeedChannel('test-feed');
      const first=channel.pull()!;expect(isMeasuredFeedRecord(first)).toBe(true);expect(measuredCompletion(first)).toBe('observed-closed');
      const second=channel.pull()!;expect(measuredCompletion(second)).toBe('unknown');
      expect(()=>channel.pull()).toThrow(/backwards or repeated/);
      expect(channel.pull()).toBeNull();
      const forged=rec(9);expect(isMeasuredFeedRecord(forged)).toBe(false);expect(measuredCompletion(forged)).toBe('unknown');
      expect(()=>channel.accept(forged)).toThrow(/Only records pulled/);
      expect(channel.accept(first)).toBe(first);
      const supplied={kind:'supplied-snapshot',sourceAvailableAt:null,binding:{}};
      expect(()=>channel.accept(supplied)).toThrow(RELABEL_REFUSAL);
      expect(()=>validateMeasuredFeedRecord({...rec(1),kind:'measured-feed',sourceAvailableAt:null},'test-feed')).toThrow(RELABEL_REFUSAL);
      expect(()=>measuredFromObservation(supplied as never)).toThrow(RELABEL_REFUSAL);
      expect(measuredFeedStatus()).toContain('test-feed');
    }finally{unregisterMeasuredFeedAdapter('test-feed');}
  });
  it('clock order, field set and adapter identity are enforced',()=>{
    expect(()=>validateMeasuredFeedRecord(rec(1,{publishedAt:99}),'test-feed')).toThrow(/out of order/);
    expect(()=>validateMeasuredFeedRecord(rec(1,{completedAt:170}),'test-feed')).toThrow(/outside/);
    expect(()=>validateMeasuredFeedRecord(rec(1,{extra:1}),'test-feed')).toThrow(/missing or extra/);
    expect(()=>validateMeasuredFeedRecord(rec(1),'other')).toThrow(/different adapter/);
    expect(()=>validateMeasuredFeedRecord(rec(1,{value:Number.NaN}),'test-feed')).toThrow(/finite/);
    expect(()=>openMeasuredFeedChannel('missing')).toThrow();
    expect(()=>registerMeasuredFeedAdapter({id:'x',contractVersion:2,next:()=>null})).toThrow();
  });
});
