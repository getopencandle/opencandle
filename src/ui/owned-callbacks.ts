/** Retired chart trees may finish native callbacks after a replacement commits.
 * Keep callback identities stable within one tree, while forwarding only to the
 * current handlers and only while that tree still owns the workspace. */
export function ownedCallbacks<T extends Record<string,(...args:any[])=>any>>(read:()=>T,isCurrent:()=>boolean):T{
 return Object.fromEntries(Object.keys(read()).map(name=>[name,(...args:any[])=>isCurrent()?read()[name](...args):false])) as T;
}
