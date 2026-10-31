import { describe,it,expect } from 'vitest';
import * as root from '@luxalgo/vela';
import * as plugin from '@luxalgo/vela/plugin';
import { Drawing, DrawingStore, registerDrawingType, createDrawing, deserializeDrawing, type DrawingTypeKey, type Projector, type SerializedDrawing } from '@luxalgo/vela';

class ProbeDrawing extends Drawing {
  readonly type='lv-gate-probe' as DrawingTypeKey;
  marker='initial';
  constructor(init:Partial<SerializedDrawing>&{paneId:string}){super(init);if(init.props)this.applyProps(init.props);}
  anchorSchema(){return {min:1,max:1,slots:[{role:'probe',free:'both' as const}]};}
  hitTest(){return false;}
  hitHandle(){return -1;}
  handlePoints(projector:Projector):Array<[number,number]>{return this.anchors.map(anchor=>[projector.xOf(anchor.time),projector.yOf(anchor.price,this.paneId)??0]);}
  bounds(){return null;}
  priceRange(){return null;}
  schema(){return {fields:[]};}
  protected writeProps(){return {marker:this.marker};}
  protected readProps(props:Record<string,unknown>){if(typeof props.marker==='string')this.marker=props.marker;}
}
describe('Vela0.8.4 executable model capability gate (not UI evidence)',()=>{
  it('exports drawing extensions from root, not plugin',()=>{
    expect(typeof root.Drawing).toBe('function');expect(typeof root.registerDrawingType).toBe('function');
    expect('Drawing' in plugin).toBe(false);expect('registerDrawingType' in plugin).toBe(false);
  });
  it('creates, edits and serializes a registered custom drawing model',()=>{
    registerDrawingType({type:'lv-gate-probe' as DrawingTypeKey,group:'probe',label:'OpenCandle gate probe',icon:'',defaultStyle:{lineColor:'#fff',lineWidth:1,lineStyle:'solid'},create:init=>new ProbeDrawing(init)});
    const drawing=createDrawing('lv-gate-probe' as DrawingTypeKey,{paneId:'price',id:'custom-1',anchors:[{time:1700000000000,price:101}]})!;
    expect(drawing.isComplete()).toBe(true);
    drawing.applyProps({marker:'edited'});const saved=drawing.serialize();
    expect(saved.props).toEqual({marker:'edited'});
    const restored=deserializeDrawing(saved)!;expect(restored.serialize()).toEqual(saved);
  });
  it('demonstrates upstream unsupported drawing load silently drops the record',()=>{
    const store=new DrawingStore();store.load({version:1,drawings:[{id:'opaque',type:'future-unsupported',paneId:'price',anchors:[],style:{},locked:false,visible:true,zIndex:0,createdAt:0} as unknown as SerializedDrawing]});
    expect(store.serialize().drawings).toEqual([]);
  });
});
