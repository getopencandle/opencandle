/** Chart type favorites live in the workspace (`chartTypeFavorites`, beside `intervals.favorites`), an optional
 * additive field. The old per-viewer localStorage key `lv.chartTypeFavorites` is only read while the workspace
 * has no field yet: the first star toggle writes the shown list into the workspace, and the key is never written again. */
export const CHART_TYPE_FAVORITES_KEY='lv.chartTypeFavorites';
export const CHART_TYPE_FAVORITES_LIMIT=32;
const TYPE_ID=/^[a-z][a-z0-9]{0,39}$/;

/** Strict restore for a saved workspace value: a duplicate-free list of chart type ids. */
export function restoreChartTypeFavorites(value:unknown):string[]{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>CHART_TYPE_FAVORITES_LIMIT)throw Error('Unsupported chart type favorites.');
 const out:string[]=[];for(const row of value){if(typeof row!=='string'||!TYPE_ID.test(row)||out.includes(row))throw Error('Unsupported chart type favorites: each entry must be one chart type id.');out.push(row);}
 return out;
}

/** The legacy localStorage list, leniently (unreadable storage or junk means none). */
export function readLegacyChartTypeFavorites(storage:Pick<Storage,'getItem'>|null|undefined=safeStorage()):string[]{
 try{const raw=storage?.getItem(CHART_TYPE_FAVORITES_KEY);const list=raw?JSON.parse(raw):[];return Array.isArray(list)?[...new Set(list.filter((row:unknown):row is string=>typeof row==='string'&&TYPE_ID.test(row)))].slice(0,CHART_TYPE_FAVORITES_LIMIT):[];}catch{return [];}
}

/** Add or remove one type (newest last), capped at the limit. */
export function toggleChartTypeFavorite(list:readonly string[],type:string):string[]{
 if(list.includes(type))return list.filter(row=>row!==type);
 if(!TYPE_ID.test(type))throw Error('Unsupported chart type favorite.');
 return [...list,type].slice(-CHART_TYPE_FAVORITES_LIMIT);
}

function safeStorage():Storage|null{try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}}
