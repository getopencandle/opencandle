/** The default script example, in a module of its own so the pure script library can upgrade saved copies. */
export const SMA_20_EXAMPLE={name:'SMA 20',source:`({\n  // A 20-bar simple moving average. The chart already shows the close, and the value is\n  // rounded to cents, so the output stays small on long histories.\n  onBar(ctx) {\n    const average = ctx.sma('average', ctx.bar.close, 20);\n    ctx.plot('SMA 20', average === null ? null : Math.round(average * 100) / 100, '#50b4c7');\n  }\n})`} as const;
/** The former default example. It plotted the close and the SMA on every bar, which with the per-bar
 * snapshot passed the 512 KiB output budget on a 3,900-bar chart. A saved copy that is still exactly this text is
 * upgraded to the SMA 20 example when it is restored (script-library.ts upgradeLegacyExample). */
export const LEGACY_SMA_EXAMPLE={name:'SMA and close',source:`({\n  onBar(ctx) {\n    ctx.plot('Close', ctx.bar.close, '#8da9c4');\n    ctx.plot('SMA 20', ctx.sma('average', ctx.bar.close, 20), '#50b4c7');\n  }\n})`} as const;
/** A saved document or binding that is still exactly the former example becomes the SMA 20 example. Anything edited is kept. */
export function upgradeLegacyExample<T extends {name:string;source:string}>(doc:T):T{
 if(doc.source!==LEGACY_SMA_EXAMPLE.source)return doc;
 return{...doc,source:SMA_20_EXAMPLE.source,name:doc.name===LEGACY_SMA_EXAMPLE.name?SMA_20_EXAMPLE.name:doc.name};
}
