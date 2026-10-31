// Short position (reference LineToolRiskRewardShort) on the pinned native `position` class.
// The model is the shared LV position model of position-tool.ts (Inputs and Style settings, painted
// target/stop/middle plates, live text while dragging). It paints through the paint hook, so like Long it requires the hook
// (fail closed: without it the Short type is not registered).
import type {DrawingTypeMeta} from '@luxalgo/vela';
import type {FactoryDefaultDefinition} from '../drawing-factory-defaults';
import {cloneStyle,lvKey,type Init,type Projector} from '../lv-drawing-pin';
import {defineLvDrawingToolModule} from './contract';
import {nativePositionBase,seedPosition,withLvPosition,type PositionModel} from './position-tool';

export const LV_SHORT_POSITION='lvshortposition';

function defineShortPosition():DrawingTypeMeta{
 const base=nativePositionBase();
 const minDrag=(base.ctor as unknown as {MIN_DRAG_PX:number}).MIN_DRAG_PX;
 const Base=withLvPosition(base.ctor as unknown as new(init:Init)=>PositionModel);
 class LvShortPosition extends Base{
  constructor(init:Init){super(init);(this as {type:string}).type=LV_SHORT_POSITION;}
  /** Same placement as the native position tool. Only the default box (a second click on
   * or within the native minimum drag of the entry) faces short instead of long; an explicit
   * second click keeps the native rule (target side decides). */
  onPlaced(proj:Projector):void{
   const entry=this.anchors[0],second=this.anchors[1];
   const ey=entry?proj.yOf(entry.price,this.paneId):null,ty=second?proj.yOf(second.price,this.paneId):null;
   const defaultBox=ey!=null&&(ty==null||Math.abs(ty-ey)<minDrag);
   super.onPlaced(proj);
   if(defaultBox&&this.anchors.length===3)this.direction='short';
  }
 }
 return{type:lvKey(LV_SHORT_POSITION),group:base.meta.group,label:'Short position',icon:base.meta.icon,defaultStyle:cloneStyle(base.meta),create:init=>new LvShortPosition(init)};
}

/** Short takes the Long values as a copy: tool.LineToolRiskRewardShort.defaults is "inferred" (sameAs Long). */
const SHORT_POSITION_FACTORY:FactoryDefaultDefinition=Object.freeze({type:LV_SHORT_POSITION,toolId:'LineToolRiskRewardShort',factId:'tool.LineToolRiskRewardShort.defaults',style:Object.freeze({lineWidth:1}),
 probe:(sample:object)=>{const m=sample as Partial<PositionModel>;return Number.isFinite(m.riskPercent)&&Number.isFinite(m.accountBalance)?undefined:'position risk or account fields changed';},
 seed:seedPosition});

export const SHORT_POSITION_MODULE=defineLvDrawingToolModule({
 id:'short-position',
 types:[{type:LV_SHORT_POSITION,base:'position',define:defineShortPosition,requiresPaintHook:true}],
 factoryDefaults:[SHORT_POSITION_FACTORY],
 unappliedDefaults:[Object.freeze({toolId:'LineToolRiskRewardShort',factId:'tool.LineToolRiskRewardShort.defaults',property:'all',value:'sameAs Long',reason:'unverified',note:'The fact is inferred (no separate constants seen) and the reference tool is listed under the fact file unknowns. New Short positions take the Long values (account 1000, risk 25 percent, line width 1, the input defaults) as an OpenCandle-defined copy, not as reference facts.'})],
 catalog:[{rowId:'DW.FORECAST.SHORT_POSITION',type:LV_SHORT_POSITION,note:'Click the entry, then the target. A click at the entry places a default short box; a target above the entry makes it long.'}],
 // Long and Short share the reference LineToolRiskReward dialog (tab names only).
 dialog:[{toolId:'LineToolRiskReward',types:[LV_SHORT_POSITION]}],
});
