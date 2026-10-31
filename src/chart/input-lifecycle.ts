import type {ChartController} from './adapter';
import type {ChartInputSnapshot} from './input-visibility';
export async function acceptChartInput(chart:Pick<ChartController,'isInputCurrent'|'ready'|'setStyle'|'setBars'>&{isInputExact?:(input:ChartInputSnapshot)=>boolean;getStyle?:ChartController['getStyle']},input:ChartInputSnapshot,current:()=>boolean):Promise<{accepted:false}|{accepted:true;input:ChartInputSnapshot}>{
 if(!current())return{accepted:false};
 // A live snapshot owns the same input as its predecessor, but its newer bars still have to be written.
 const exact=()=>chart.isInputCurrent(input)&&(typeof chart.isInputExact!=='function'||chart.isInputExact(input));
 if(exact())await chart.ready();
 if(!current())return{accepted:false};
 // Reading an optional method can itself invoke an accessor. Recheck the
 // actual input owner after that read and after calling the captured method.
 // Ports without a reader keep the original pre/post setter path.
 const needsStyle=():boolean|null=>{const read=chart.getStyle;if(!current())return null;if(typeof read!=='function')return true;const actual=Reflect.apply(read,chart,[]);if(!current())return null;return actual!==input.style;};
 if(!exact()){
  const beforeWrite=needsStyle();if(beforeWrite===null)return{accepted:false};if(beforeWrite)chart.setStyle(input.style);
  const result=await chart.setBars(input.bars,input.source);if(!current())return{accepted:false};if(!result.ok)throw new Error(result.diagnostic.message);
  const afterWrite=needsStyle();if(afterWrite===null)return{accepted:false};if(afterWrite){const styled=chart.setStyle(input.style);if(!styled.ok)throw new Error(styled.diagnostic.message);}
 }
 if(!current()||!chart.isInputCurrent(input))return{accepted:false};return{accepted:true,input:{bars:input.bars,source:{...input.source},style:input.style}};
}
