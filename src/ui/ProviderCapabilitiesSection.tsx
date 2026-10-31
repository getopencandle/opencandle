import React from 'react';
import {PROVIDER_REGISTRY,formatProviderDelay,providerAccessLabel,providerValidationLabel,type ProviderRecord} from '../domain/provider-capabilities';

/**
 * Data sources > Technical details. A read-only list of every bar
 * source the app can show (src/domain/provider-capabilities.ts): how it is reached, what it covers and whether it was ever
 * checked against the real feed. Nothing here acts or makes a request.
 */
const DD:React.CSSProperties={margin:0};
const FIELD_WORDS:Readonly<Record<string,string>>={ohlcv:'open, high, low, close, volume','corporate-actions':'splits and dividends',quotes:'quotes',trades:'trades'};
/** Plain wording for the technical list: no internal ids, no all-caps registry words. */
export function plainSourceText(text:string):string{
 const out=text.replace(/(?:SYNTHETIC|COINBASE|US):<([^>]+)>/g,(_m,name)=>'the '+name).replace(/(?:SYNTHETIC|COINBASE|US):(?=[a-z])/g,'the ').replace(/<([^>]+)>/g,'$1').replace(/\bsynthetic\b/gi,'example').replace(/\bSYNTH\b/g,'example');
 return out.charAt(0).toUpperCase()+out.slice(1);
}
const plainWord=(word:string)=>FIELD_WORDS[word]??word.replace(/-/g,' ');
const plainList=(words:readonly string[],glue=', ')=>words.map(plainWord).join(glue);
export interface ProviderCapabilitiesSectionProps {records?:readonly ProviderRecord[]}
export function ProviderCapabilitiesSection({records=PROVIDER_REGISTRY}:ProviderCapabilitiesSectionProps){
 return <section className="lv-provider-capabilities" aria-label="What each source supplies">
  <h3>What each source supplies</h3>
  <p className="lv-live-note">Every source OpenCandle can chart, what it covers and how it is reached. A source is only called verified after a check against its real feed.</p>
  {records.map(row=>{const c=row.capabilities;return <details key={c.id} data-lv-provider={c.id} data-lv-provider-access={row.access} data-lv-provider-validation={row.validation}>
   <summary>{row.name} <span className="lv-provider-access">{providerAccessLabel(row.access)}</span></summary>
   <dl style={{display:'grid',gridTemplateColumns:'max-content 1fr',gap:'2px 12px',margin:'4px 0 8px',fontSize:12}}>
    <dt>Symbols</dt><dd style={DD}>{plainSourceText(c.universe)}</dd>
    <dt>How symbols are named</dt><dd style={DD}>{plainSourceText(row.symbolIdentity)}</dd>
    <dt>Assets</dt><dd style={DD}>{plainList(c.assets)}</dd>
    <dt>Fields</dt><dd style={DD}>{plainList(c.fields)}</dd>
    <dt>Intervals</dt><dd style={DD}>{c.resolutions.join(', ')}</dd>
    <dt>Streaming</dt><dd style={DD}>{c.streaming?'Yes':'No'}</dd>
    <dt>Delay</dt><dd style={DD}>{formatProviderDelay(c.delaySeconds,c.streaming)}</dd>
    <dt>Sessions</dt><dd style={DD}>{plainList(c.sessions)}</dd>
    <dt>Timezone</dt><dd style={DD}>{plainSourceText(row.timezone)}</dd>
    <dt>Splits and dividends</dt><dd style={DD}>{plainSourceText(row.corporateActions)}</dd>
    <dt>Price basis</dt><dd style={DD}>{plainList(c.adjustmentBases)}</dd>
    <dt>Limits</dt><dd style={DD}>{plainSourceText(c.limits.join('; '))}</dd>
    <dt>Access</dt><dd style={DD}>{plainSourceText(row.entitlement)}</dd>
    <dt>Export</dt><dd style={DD}>{c.redistributable===false?'Display only; bars cannot be exported or shared':c.redistributable===true?'May be exported (labelled as demo data where it is)':'Depends on the rights of the source'}</dd>
    <dt>Validation</dt><dd style={DD}>{providerValidationLabel(row)}</dd>
   </dl>
  </details>;})}
 </section>;
}
