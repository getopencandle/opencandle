import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import {chartInputCommitted} from '../../src/chart/input-visibility';
import {ChartPanel} from '../../src/ui/ChartPanel';
import {defaultTheme} from '../../src/ui/themes';
const bars=[{time:100,open:1,high:3,low:1,close:2,volume:10}],source={datasetId:'synthetic-input',revision:'1',fixture:true,label:'Synthetic'};
it('price canvas is withheld synchronously for every uncommitted source, revision, correction and style',()=>{
 const committed={bars,source,style:'candles'};expect(chartInputCommitted(committed,committed)).toBe(true);expect(chartInputCommitted(null,committed)).toBe(false);
 for(const desired of [{...committed,bars:structuredClone(bars)},{...committed,source:{...source,datasetId:'other'}},{...committed,source:{...source,revision:'2'}},{...committed,source:{...source,resolution:'5m'}},{...committed,style:'heikinashi'}])expect(chartInputCommitted(committed,desired)).toBe(false);
 const correction=structuredClone(bars);correction[0].close=3;expect(chartInputCommitted(committed,{...committed,bars:correction})).toBe(false);
});
it('initial React artifact has a hidden native canvas and visible pending status, not old prices',()=>{
 const markup=renderToStaticMarkup(React.createElement(ChartPanel,{bars,source,style:'candles',appearance:defaultTheme.appearance,onReady:()=>{}}));
 expect(markup).toContain('visibility:hidden');expect(markup).toContain('aria-busy="true"');expect(markup).toContain('Loading chart...');expect(markup).not.toContain('commits');
});
