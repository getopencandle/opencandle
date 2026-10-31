import {DEFAULT_STRATEGY_CONFIG,backtestStrategy,strategyOrderLabel,validateStrategyConfig,type StrategyConfig} from './strategy';
import {scriptOrdersToSignals} from './strategy-script-orders';
import type {Bar} from './types';

/**
 * Strategy order-fill alerts.
 *
 * A strategy alert is a script alert source (output 'fill') whose source text, input values and Strategy tester
 * properties are frozen when the alert is created. On each observed prefix the script reruns (as for any script alert),
 * its virtual order proposals are backtested with the frozen properties, and the source reads 1 when at least one
 * virtual order filled on the endpoint bar (0 otherwise). The fill details travel with the observation so the message
 * placeholders {{strategy.order.*}}, {{strategy.position_size}} and {{strategy.market_position}} read the fill of the
 * trigger bar. Nothing is sent anywhere: delivery is the existing local popup, sound, desktop toast and log.
 *
 * When several orders fill on the endpoint bar, the placeholders describe the
 * last one and `fills` counts them; the position values are signed units (negative short) after and before that fill.
 */
export interface AlertStrategyFill {
 action:'buy'|'sell';contracts:number;price:number;orderId:string;
 /** Signed position units after the reported fill, and before it. */
 positionSize:number;prevPositionSize:number;
 /** Fills on the endpoint bar (at least 1). */
 fills:number;
}
export const STRATEGY_FILL_OUTPUT_ID='order-fills';
const STRATEGY_KEYS=new Set([...Object.keys(DEFAULT_STRATEGY_CONFIG),'defaultQuantity','accountCurrency','orderDelayBars']);
const plain=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
/** A frozen Strategy tester configuration: plain JSON data with the engine's own keys, accepted by its own validation. */
export function validateFrozenStrategyConfig(value:unknown):asserts value is StrategyConfig{
 if(!plain(value))throw new Error('A strategy alert requires its frozen Strategy tester properties.');
 for(const key of Reflect.ownKeys(value)){const property=Object.getOwnPropertyDescriptor(value,key)!;if(typeof key!=='string'||!STRATEGY_KEYS.has(key)||!property.enumerable||!Object.hasOwn(property,'value'))throw new Error('Strategy alert properties contain an unsupported field.');}
 for(const key of Object.keys(DEFAULT_STRATEGY_CONFIG))if(!Object.hasOwn(value,key))throw new Error('Strategy alert properties are incomplete.');
 for(const nested of ['commission','defaultQuantity']){const item=value[nested];if(item===undefined&&nested==='defaultQuantity')continue;if(!plain(item)||Reflect.ownKeys(item).some(key=>typeof key!=='string'||!['kind','value'].includes(key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)!,'value')))throw new Error('Strategy alert properties are malformed.');}
 let json:string;try{json=JSON.stringify(value);}catch{throw new Error('Strategy alert properties are malformed.');}
 if(json.length>4000)throw new Error('Strategy alert properties exceed local limits.');
 const problems=validateStrategyConfig(value as unknown as StrategyConfig);if(problems.length)throw new Error('Strategy alert properties are invalid: '+problems.join(' '));
}
/** The properties an alert freezes: the applied Strategy tester properties, with the chart type of the alert's transform. */
export function freezeStrategyConfig(config:StrategyConfig,transform:'standard'|'heikinashi'):StrategyConfig{
 // A fill alert replays the bar-close OHLC route; it does not read lower-timeframe bars or the forming bar the Strategy tester can.
 if(config.barMagnifier||config.calcOnEveryTick)throw new Error('Strategy fill alerts replay fills on the bar-close OHLC route. Turn off Bar Magnifier and Recalculate on every tick in the Strategy tester properties to alert on these fills.');
 // A fill alert runs the script once, so it cannot replay the onFill feedback the Strategy tester settles.
 if(config.calcOnOrderFills)throw new Error('Strategy fill alerts run the script once per update and cannot recalculate after fills. Turn off Recalculate after order is filled in the Strategy tester properties to alert on these fills.');
 const frozen:StrategyConfig={...structuredClone(config),chartType:transform==='heikinashi'?'heikin-ashi':'standard'};
 if(frozen.defaultQuantity===undefined)delete frozen.defaultQuantity;
 // The tester date range limits a report, not live fills; an alert watches every new bar.
 delete frozen.dateRange;
 validateFrozenStrategyConfig(frozen);return frozen;
}
/** The fill on the endpoint (last) bar of a script run's prefix, or null when no virtual order filled there. */
export function strategyFillAtEndpoint(input:{orders:readonly Record<string,unknown>[];bars:readonly Bar[];barIds:readonly string[];standardBars:readonly Bar[];config:StrategyConfig}):{fill:AlertStrategyFill|null;diagnostics:string[]}{
 if(!input.bars.length)return{fill:null,diagnostics:['The strategy has no supplied rows to fill on.']};
 let signals;try{signals=scriptOrdersToSignals(input.orders,input.bars,input.barIds);}catch(error){return{fill:null,diagnostics:['Strategy order proposals were not accepted: '+(error instanceof Error?error.message:String(error)).slice(0,500)]};}
 const result=backtestStrategy({bars:input.bars,standardBars:input.standardBars,barIds:input.barIds,signals,config:input.config});
 if(!result.ok)return{fill:null,diagnostics:result.diagnostics.length?result.diagnostics.slice(0,5):['The strategy backtest did not complete.']};
 // Position units are rounded to 15 significant digits, so fills that net out read exactly 0.
 const round=(value:number)=>Number(value.toPrecision(15)),end=input.bars.length-1;
 let position=0,before=0,after=0,last:typeof result.fills[number]|null=null,count=0;
 for(const fill of result.fills){
  const next=round(position+(fill.side==='buy'?fill.quantity:-fill.quantity));
  if(fill.barIndex===end){before=position;after=next;last=fill;count++;}
  position=next;
 }
 if(!last)return{fill:null,diagnostics:[]};
 const order=result.orders.find(row=>row.id===last!.orderId);
 return{fill:{action:last.side,contracts:last.quantity,price:last.price,orderId:(order?strategyOrderLabel(order):last.orderId).slice(0,200)||'order',positionSize:after,prevPositionSize:before,fills:count},diagnostics:[]};
}
export function validateAlertStrategyFill(value:unknown):asserts value is AlertStrategyFill{
 if(!plain(value))throw new Error('Invalid strategy fill record.');
 const keys=['action','contracts','price','orderId','positionSize','prevPositionSize','fills'];
 if(Reflect.ownKeys(value).some(key=>typeof key!=='string'||!keys.includes(key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)!,'value'))||keys.some(key=>!Object.hasOwn(value,key)))throw new Error('Invalid strategy fill record.');
 const finite=(item:unknown):item is number=>typeof item==='number'&&Number.isFinite(item);
 if(!['buy','sell'].includes(value.action as string)||!finite(value.contracts)||value.contracts<=0||!finite(value.price)||value.price<=0||typeof value.orderId!=='string'||!value.orderId||value.orderId.length>200||!finite(value.positionSize)||!finite(value.prevPositionSize)||!Number.isSafeInteger(value.fills)||(value.fills as number)<1)throw new Error('Invalid strategy fill record.');
}
