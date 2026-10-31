// Each price scale + menu order row opens the paper ticket preset with its side, order type and price.
// Real component callbacks through effect-aware controlled hooks (no DOM, no packaged interface claim). Synthetic fixture only.
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {PaperPanel,type PaperPanelProps} from '../../src/ui/PaperPanel';
import {readFileSync} from 'node:fs';
import {buildContextPriceRequestData,contextOrderDraft,type ContextPriceRequest} from '../../src/ui/context-price-request';
import {createContextMenuExecution} from '../../src/chart/context-menu-execution';
import {pricePlusMenu,pricePlusRequest,type PricePlusAction} from '../../src/chart/price-scale-plus';
import type {ChartMenuSnapshot,ChartContextActions} from '../../src/chart/context-menu';
import {createPaperAccount,processPaperQuote,type PaperAccount} from '../../src/domain/paper';
import {fixtureDataset} from '../../src/domain/fixtures';

// Actual component callbacks with effect-aware controlled React hooks. No DOM,
// native focus/input, renderer geometry, or packaged interface claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>void>,cleanups:[] as Array<(()=>void)|undefined>,writes:0}));
vi.mock('react',async()=>({...await vi.importActual<any>('react'),startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.writes++;hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:(run:()=>void|(()=>void),deps?:any[])=>{const i=hooks.cursor++,prior=hooks.cells[i];if(!prior||!deps||deps.some((value,index)=>!Object.is(value,prior[index]))){hooks.cells[i]=deps;hooks.effects.push(()=>{hooks.cleanups[i]?.();hooks.cleanups[i]=run()??undefined;});}}}));
const dataset=fixtureDataset('GME',5),instrument=dataset.instrument,now=1791979200;
const quote={instrumentId:instrument.id,bid:9.98,ask:10.02,eventTime:now,receivedAt:now,availableAt:now,sequence:1,fixture:true,session:'unknown' as const};
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
let requestInstrument:typeof instrument|null=null;
function request(action:'price-alert'|'paper-ticket',account?:PaperAccount,price=9.5,id='click',order?:{side:'buy'|'sell';orderType:'limit'|'stop'}):ContextPriceRequest{return buildContextPriceRequestData({id,action,price,instrument:requestInstrument??instrument,chartId:'chart',sourceKey:'supplied-synthetic-source',style:'candles',executionIdentity:'ordinary',pointTime:null,pointIndex:null,paperOwner:account?{id:account.id,mode:account.mode,runId:account.runId}:null,...(order?{order}:{})});}
function driver<P>(Component:(props:P)=>any,props:P){const render=()=>{hooks.cursor=0;return Component(props);},element=(predicate:(node:any)=>boolean)=>{const found=find(render(),predicate);if(!found)throw new Error('Missing component handler');return found;},button=(name:string)=>element(node=>node.type==='button'&&text(node)===name),field=(name:string)=>element(node=>node.props['aria-label']===name),flush=()=>{for(let i=0;i<10;i++){render();if(!hooks.effects.length)return;hooks.effects.splice(0).forEach(run=>run());}throw new Error('Effect loop did not settle');};return{props,render,element,button,field,click:(name:string)=>button(name).props.onClick(),change:(name:string,value:string)=>field(name).props.onChange({target:{value}}),submit:()=>element(node=>node.type==='form').props.onSubmit({preventDefault:vi.fn()}),flush,text:()=>text(render())};}
function paper(price=9.5,oneClick=false,order?:{side:'buy'|'sell';orderType:'limit'|'stop'},extra:Partial<PaperPanelProps>={}){const result=processPaperQuote(createPaperAccount({oneClick}),quote,now,'ordinary',instrument);expect(result.ok).toBe(true);const account=result.account,context=request('paper-ticket',account,price,'click',order),state={live:true};const props:PaperPanelProps={account,instrument,quote,quoteSource:{key:context.sourceKey,state:'ready'},now,contextRequest:context,assertContextCurrent:vi.fn(()=>{if(!state.live)throw new Error('Source or request retired');}),onContextComplete:vi.fn(()=>{state.live=false;}),onAccountChange:vi.fn((next,expected)=>{if(expected!==props.account)return false;props.account=next;return true;})};Object.assign(props,extra);const ui=driver(PaperPanel,props);ui.flush();return{...ui,state,context};}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];hooks.cleanups=[];hooks.writes=0;vi.stubGlobal('document',{activeElement:null});vi.stubGlobal('window',{});});
afterEach(()=>{hooks.cleanups.forEach(run=>run?.());vi.unstubAllGlobals();});

const ROWS:Array<{action:PricePlusAction;price:number;side:'buy'|'sell';orderType:'limit'|'stop';priceField:string}>=[
 {action:'buy-limit',price:9.5,side:'buy',orderType:'limit',priceField:'Limit price'},
 {action:'sell-limit',price:10.5,side:'sell',orderType:'limit',priceField:'Limit price'},
 {action:'buy-stop',price:10.5,side:'buy',orderType:'stop',priceField:'Stop price'},
 {action:'sell-stop',price:9.5,side:'sell',orderType:'stop',priceField:'Stop price'},
];
const pressed=(ui:ReturnType<typeof paper>)=>({buy:ui.button('Buy 10.02').props['aria-pressed'],sell:ui.button('Sell 9.98').props['aria-pressed']});

it('the menu rows at the hovered price are exactly the four order rows, each turned into a side and order type request',()=>{
 const above=pricePlusMenu({price:10.5,text:'10.50',last:10,symbol:'GME',host:true,line:true}).map(row=>row.id),below=pricePlusMenu({price:9.5,text:'9.50',last:10,symbol:'GME',host:true,line:true}).map(row=>row.id);
 expect(above).toEqual(['alert','sell-limit','buy-stop','hline']);expect(below).toEqual(['alert','buy-limit','sell-stop','hline']);
 for(const row of ROWS)expect(pricePlusRequest(row.action,row.price,{x:1,y:2},'price')).toMatchObject({action:'order',side:row.side,orderType:row.orderType,price:row.price});
});

it('the request carries the preset only for a virtual ticket and refuses a malformed one',()=>{
 const account=processPaperQuote(createPaperAccount({}),quote,now,'ordinary',instrument).account;
 expect(request('paper-ticket',account,9.5).order).toBeUndefined();
 expect(request('paper-ticket',account,9.5,'click',{side:'sell',orderType:'stop'}).order).toEqual({side:'sell',orderType:'stop'});
 expect(Object.isFrozen(request('paper-ticket',account,9.5,'click',{side:'sell',orderType:'stop'}).order)).toBe(true);
 expect(()=>request('price-alert',undefined,9.5,'click',{side:'buy',orderType:'limit'})).toThrow(/virtual ticket/);
 for(const bad of [{side:'hold',orderType:'limit'},{side:'buy',orderType:'market'},{side:'buy'},{side:'buy',orderType:'limit',extra:1}])expect(()=>request('paper-ticket',account,9.5,'click',bad as any)).toThrow();
 expect(contextOrderDraft(request('paper-ticket',account,9.5))).toEqual({side:'buy',type:'limit'});
 expect(contextOrderDraft(request('paper-ticket',account,9.5,'click',{side:'sell',orderType:'stop'}))).toEqual({side:'sell',type:'stop'});
});

for(const row of ROWS)it(`${row.action} opens the ticket preset with ${row.side} ${row.orderType} at ${row.price} and confirms exactly that order`,()=>{
 const ui=paper(row.price,true,{side:row.side,orderType:row.orderType});
 expect(ui.field('Order type').props.value).toBe(row.orderType);expect(ui.field(row.priceField).props.value).toBe(row.price.toFixed(2));
 expect(pressed(ui)).toEqual({buy:row.side==='buy',sell:row.side==='sell'});expect(ui.text()).toContain(`${row.side==='buy'?'Buy':'Sell'} ${row.orderType==='stop'?'Stop':'Limit'}`);
 ui.submit();expect(ui.props.onAccountChange).not.toHaveBeenCalled(); // a clicked-price ticket is always confirmed, even with one-click on
 ui.button('Confirm').props.onClick();
 expect(ui.props.account.orders[0]).toMatchObject({side:row.side,type:row.orderType,quantity:1,status:'working',...(row.orderType==='stop'?{stopPrice:row.price}:{limitPrice:row.price})});
});

it('without a preset the ticket still opens as Buy Limit (the right-click Trade row)',()=>{
 const ui=paper(9.5);expect(ui.field('Order type').props.value).toBe('limit');expect(pressed(ui)).toEqual({buy:true,sell:false});expect(ui.text()).toContain('Buy Limit and one unit are local draft defaults');
});

function snapshot(){return{entity:{kind:'chart'},point:{price:99.5,unit:'price',pane:{kind:'price'}},controller:{contextMenu:{isCurrent:()=>true,handoff:()=>({release(){}})}}} as unknown as ChartMenuSnapshot;}
it('the execution hands the preset to the paper-ticket action and refuses it on any other action',async()=>{
 const seen:unknown[]=[],errors:string[]=[],actions:ChartContextActions={'paper-ticket':(_context,_lease,options)=>{seen.push(options);return true;},'price-alert':()=>true};
 const run=(action:'paper-ticket'|'price-alert',options?:any)=>createContextMenuExecution(snapshot(),{current:()=>true,actions:()=>actions,close:()=>{},busy:()=>{},error:value=>errors.push(value)}).execute(action,options);
 await run('paper-ticket',{order:{side:'sell',orderType:'stop'}});await run('paper-ticket');
 expect(seen).toEqual([{order:{side:'sell',orderType:'stop'}},undefined]);
 await run('price-alert',{order:{side:'buy',orderType:'limit'}});expect(errors.join(' ')).toContain('virtual ticket');
});

it('ChartPanel passes the row side and order type, and the App mints them into the request (source wiring)',()=>{
 const panel=readFileSync('src/ui/ChartPanel.tsx','utf8'),app=readFileSync('src/ui/App.tsx','utf8'),sheet=readFileSync('src/ui/PaperPanel.tsx','utf8');
 expect(panel).toContain("request.action==='order'&&request.side&&request.orderType?{order:{side:request.side,orderType:request.orderType}}:undefined");
 expect(panel).toContain("execution.execute(request.action==='alert'?'price-alert':'paper-ticket',preset)");
 expect(app).toContain("options?:ChartContextActionOptions)=>requestChartContext(action,snapshot,lease,options)");
 expect(app).toContain("...(action==='paper-ticket'&&options?.order?{order:options.order}:{})");
 expect(sheet).toContain('const preset=contextOrderDraft(request);return{...draftFor(latest.current.quote,latest.current.now),...preset,limitPrice:request.priceText,stopPrice:request.priceText');
});

// merge review #1: outside regular hours on an extended-session chart, a + menu STOP preset must not inherit the
// limit-only Extended hours default (the stop ticket shows no Extended hours box and failed session eligibility).
it('outside regular hours on an extended-session chart a stop preset opens without Extended hours and confirms; a limit preset keeps it',()=>{
 const us={...instrument,assetClass:'stock' as const,timezone:'America/New_York'};
 requestInstrument=us;try{
 const stop=paper(10.5,true,{side:'buy',orderType:'stop'},{sessionMode:'extended',instrument:us});
 expect(stop.text()).not.toContain('Only limit entries support entry extended hours');
 stop.submit();stop.button('Confirm').props.onClick();
 expect(stop.props.account.orders[0]).toMatchObject({side:'buy',type:'stop',stopPrice:10.5,status:'working'});
 hooks.cleanups.forEach(run=>run?.());hooks.cells=[];hooks.cursor=0;hooks.effects=[];hooks.cleanups=[]; // a fresh panel instance
 const limit=paper(9.5,true,{side:'buy',orderType:'limit'},{sessionMode:'extended',instrument:us});
 expect(limit.field('Entry outside regular hours').props.checked).toBe(true);
 }finally{requestInstrument=null;}
});
