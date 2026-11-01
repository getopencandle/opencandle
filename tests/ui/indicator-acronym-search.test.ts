import {describe,expect,it} from 'vitest';
import type {IndicatorId} from '../../src/domain/indicators';
import {isProfileIndicator,isPatternIndicator} from '../../src/domain/indicator-selector-catalog';
import {INDICATOR_KINDS} from '../../src/chart/indicator-settings';
import {filterIndicatorCatalog,indicatorDisplayName,indicatorNames,standardAcronym} from '../../src/ui/indicator-dialog-model';

const catalog=(INDICATOR_KINDS as readonly IndicatorId[]).filter(kind=>!isProfileIndicator(kind)&&!isPatternIndicator(kind));
const first=(query:string)=>filterIndicatorCatalog(catalog,'All',[],query).rows[0];

describe('standard acronyms in the Indicators list',()=>{
 it('shows the acronym after the spelled-out name',()=>{
  expect(indicatorDisplayName('rsi')).toBe('Relative Strength Index (RSI)');
  expect(indicatorDisplayName('atr')).toBe('Average True Range (ATR)');
  expect(indicatorDisplayName('vwap')).toBe('Volume Weighted Average Price (VWAP)');
  expect(indicatorDisplayName('cmo' as IndicatorId)).toBe('Chande momentum oscillator (CMO)');
  expect(indicatorDisplayName('ad' as IndicatorId)).toBe('Accumulation/distribution (A/D)');
  expect(indicatorDisplayName('avwap' as IndicatorId)).toBe('Anchored VWAP (AVWAP)');
 });
 it('leaves names that already carry the acronym, or have no common one, unchanged',()=>{
  for(const kind of ['macd','psar','stochrsi','willr','stochastic','volume','supertrend','ichimoku'] as IndicatorId[]){
   expect(standardAcronym(kind)).toBe('');expect(indicatorDisplayName(kind)).toBe(indicatorNames[kind]);
  }
 });
 it('every listed acronym is a non-empty token that the name does not already contain',()=>{
  for(const kind of catalog){
   const acronym=standardAcronym(kind);if(!acronym)continue;
   expect(acronym.trim()).toBe(acronym);
   expect(indicatorNames[kind].split(/[^A-Za-z/]+/)).not.toContain(acronym);
  }
 });
 it.each([
  ['rsi','rsi'],['RSI','rsi'],['atr','atr'],['vwap','vwap'],['obv','obv'],['ema','ema'],['sma','sma'],['adx','adx'],['cci','cci'],
  ['mfi','mfi'],['cmf','cmf'],['roc','roc'],['dmi','dmi'],['hma','hma'],['wma','wma'],['tsi','tsi'],['dpo','dpo'],['kst','kst'],
  ['ppo','ppo'],['adr','adr'],['alma','alma'],['kama','kama'],['uo','uo'],['bb','bb'],['kc','kc'],['dc','dc'],['orb','orb'],
  ['avwap','avwap'],['rvol','relvolume'],['a/d','ad'],['ao','ao'],['ac','accelosc'],['cmo','cmo'],['efi','efi'],['smma','smma'],
 ])('typing %s puts its indicator first',(query,kind)=>{
  expect(first(query)).toBe(kind);
 });
 it('partial typing still finds the indicator near the top',()=>{
  expect(filterIndicatorCatalog(catalog,'All',[],'vwa').rows.slice(0,3)).toContain('vwap');
  expect(filterIndicatorCatalog(catalog,'All',[],'rs').rows.slice(0,5)).toContain('rsi');
  expect(first('relative strength')).toBe('rsi');
 });
});
