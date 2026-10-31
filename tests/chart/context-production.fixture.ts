import {NativeRenderer} from '@luxalgo/vela';
import {createRendererContextPort} from '../../src/chart/renderer-context';
import {fixtureDataset} from '../../src/domain/fixtures';
export function runContextProductionProbe(){
 const data=fixtureDataset('GME',3),renderer=new NativeRenderer(),native=renderer as any,pane=native.scene.ensurePane('price','price',0,1);Object.assign(pane,{bounds:{top:0,height:300},scale:{min:100,max:200},initialized:true});native.coords={times:data.bars.map(bar=>bar.time*1000),widthPx:400,dataHeightPx:300,pitchScale:1,viewport:{barSpacing:20,rightOffset:0}};native.rightAxisW=64;native.plot={getBoundingClientRect:()=>({left:10,top:20,width:464,height:326})};
 class DrawingInteraction{deps={projector:()=>({}),drawings:()=>[],selectedIds:()=>[],hoveredId:()=>null};handleDrawings(){return [];}hitAt(x:number,y:number){return x===380&&y===150?{id:'drawn-line'}:null;}}
 const interaction=new DrawingInteraction();native.userDrawings={interaction};const inventory={panes:[{paneId:'price',logicalPaneId:'price',replaceable:false,owners:[]}],occupiedIds:[]},port=createRendererContextPort(renderer),snapshot=port.capture(inventory,data.bars,{x:390,y:170});if(snapshot.entity.kind!=='drawing'||snapshot.entity.ids[0]!=='drawn-line'||snapshot.point.price!==150||snapshot.point.barTime!==data.bars[1].time)throw Error('Production context probe failed');return{entity:snapshot.entity.kind,hitId:snapshot.entity.ids[0],price:snapshot.point.price,barTime:snapshot.point.barTime,constructorName:interaction.constructor.name};
}
