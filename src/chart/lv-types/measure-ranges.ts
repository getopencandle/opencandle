// Price range and Date range (reference LineToolPriceRange / LineToolDateRange) on the pinned native
// `datepricerange` class: each hides the other measure by default.
import type {DrawingTypeMeta} from '@luxalgo/vela';
import {cloneStyle,fail,lvKey,method,nativeBase,roles,type Init,type NativeModel} from '../lv-drawing-pin';
import {defineLvDrawingToolModule} from './contract';

export const LV_PRICE_RANGE='lvpricerange';
export const LV_DATE_RANGE='lvdaterange';

interface MeasureModel extends NativeModel{showPrice:boolean;showDate:boolean}

function defineRange(type:typeof LV_PRICE_RANGE|typeof LV_DATE_RANGE):DrawingTypeMeta{
 const base=nativeBase('datepricerange');
 for(const key of ['measureLabel','priceLabel','timeLabel','readProps','writeProps','schema','serialize'])method(base.prototype,key);
 const shape=roles(base.sample),sample=base.sample as MeasureModel;
 if(shape.min!==2||shape.max!==2||shape.roles!=='c1/c2')fail('date and price range anchor schema changed: '+JSON.stringify(shape));
 if(sample.showPrice!==true||sample.showDate!==true)fail('date and price range display defaults changed');
 const written=sample.serialize().props;
 if(!written||Object.keys(written).sort().join()!=='showDate,showPrice')fail('date and price range retained props changed');
 const hidden=type===LV_PRICE_RANGE?'showDate':'showPrice';
 const Base=base.ctor as unknown as new(init:Init)=>MeasureModel;
 class LvRange extends Base{
  constructor(init:Init){
   super(init);(this as {type:string}).type=type;
   // A retained or remembered explicit value wins; otherwise this tool hides the other measure.
   if(typeof init.props?.[hidden]!=='boolean')this[hidden]=false;
  }
 }
 return{type:lvKey(type),group:base.meta.group,label:type===LV_PRICE_RANGE?'Price range':'Date range',icon:base.meta.icon,defaultStyle:cloneStyle(base.meta),create:init=>new LvRange(init)};
}

export const PRICE_RANGE_MODULE=defineLvDrawingToolModule({
 id:'price-range',
 types:[{type:LV_PRICE_RANGE,base:'datepricerange',define:()=>defineRange(LV_PRICE_RANGE)}],
 catalog:[{rowId:'DW.MEASURE.PRICE_RANGE',type:LV_PRICE_RANGE,note:'Measures the price change between two points.'}],
});
export const DATE_RANGE_MODULE=defineLvDrawingToolModule({
 id:'date-range',
 types:[{type:LV_DATE_RANGE,base:'datepricerange',define:()=>defineRange(LV_DATE_RANGE)}],
 catalog:[{rowId:'DW.MEASURE.DATE_RANGE',type:LV_DATE_RANGE,note:'Measures the bars and time between two points.'}],
});
