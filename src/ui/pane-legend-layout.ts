/** Position facts only. These never establish chart/source ownership. */
export interface LegendRect {left:number;top:number;width:number;height:number}
export interface LegendPane {id:string;top:number;height:number;collapsed:boolean}
export interface PaneLegendFrame {origin:Pick<LegendRect,'left'|'top'>;plot:LegendRect;dataLeft:number;dataWidth:number;dataHeight:number;headingHeight:number;panes:readonly LegendPane[]}
export interface PaneLegendBox {id:string;left:number;top:number;width:number;maxHeight:number;collapsed:boolean}
export interface PaneLegendLayout {panes:PaneLegendBox[];separators:LegendRect[];heading:{left:number;top:number}|null}
const finite=(value:number)=>Number.isFinite(value);
/** Native plot/pane coordinates become overlay coordinates exactly once, including an offset active cell. */
export function paneLegendLayout(frame:PaneLegendFrame):PaneLegendLayout|null{
 const {origin,plot}=frame;
 if(![origin.left,origin.top,plot.left,plot.top,plot.width,plot.height,frame.dataLeft,frame.dataWidth,frame.dataHeight,frame.headingHeight].every(finite)||plot.width<0||plot.height<0||frame.dataWidth<0||frame.dataHeight<0||frame.headingHeight<0)return null;
 // Native weighted pane heights accumulate floating-point sums; permit only that bounded rounding envelope.
 const rounding=Number.EPSILON*Math.max(1,frame.dataHeight)*(2*frame.panes.length+4);
 const ids=new Set<string>(),panes:PaneLegendBox[]=[],separators:LegendRect[]=[];
 for(const pane of frame.panes){
  if(typeof pane.id!=='string'||!pane.id||ids.has(pane.id)||!finite(pane.top)||!finite(pane.height)||pane.top<0||pane.height<0||pane.top+pane.height>frame.dataHeight+rounding)return null;
  ids.add(pane.id);if(pane.height===0)continue;
  const inset=pane.collapsed?2:6,head=pane.id==='price'?frame.headingHeight+8:inset,height=Math.max(0,Math.min(frame.dataHeight,pane.top+pane.height)-pane.top);
  panes.push({id:pane.id,left:frame.dataLeft-origin.left+6,top:plot.top-origin.top+pane.top+head,width:Math.max(0,frame.dataWidth-12),maxHeight:Math.max(0,Math.min(pane.id==='price'?180:Infinity,height-head-inset)),collapsed:pane.collapsed});
  // The native central three-pixel separator and its hit zone remain untouched.
  if(pane.top>0)separators.push({left:plot.left-origin.left,top:plot.top-origin.top+pane.top-2,width:plot.width,height:5});
 }
 const price=frame.panes.find(pane=>pane.id==='price'&&pane.height>0);
 return{panes,separators,heading:price?{left:frame.dataLeft+6,top:plot.top+price.top+4}:null};
}
export function samePaneLegendLayout(a:PaneLegendLayout|null,b:PaneLegendLayout|null):boolean{
 if(a===b)return true;if(!a||!b||a.panes.length!==b.panes.length||a.separators.length!==b.separators.length)return false;
 if(a.heading?.left!==b.heading?.left||a.heading?.top!==b.heading?.top)return false;
 return a.panes.every((p,i)=>{const q=b.panes[i];return p.id===q.id&&p.left===q.left&&p.top===q.top&&p.width===q.width&&p.maxHeight===q.maxHeight&&p.collapsed===q.collapsed;})&&a.separators.every((p,i)=>{const q=b.separators[i];return p.left===q.left&&p.top===q.top&&p.width===q.width&&p.height===q.height;});
}
