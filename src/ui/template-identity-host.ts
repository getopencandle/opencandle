// R4 (REPLAY_POLICY): applies the pure TemplateIdentityEffect decision (template-application.ts) through host hooks.
// A source-changing template retires the replay session, alert identities and script identities tied to the old source;
// ordinary virtual paper history is never touched here. Every applied template mints a fresh execution identity.
import type {TemplateIdentityEffect} from './template-application';

export interface TemplateIdentityHost {retireReplay():void;retireAlerts():void;retireScripts():void;freshExecutionIdentity():void}
export type TemplateIdentityStep='replay'|'alerts'|'scripts'|'execution';

export function applyTemplateIdentityEffect(effect:TemplateIdentityEffect,host:TemplateIdentityHost):TemplateIdentityStep[]{
 if(!effect||effect.freshExecutionIdentity!==true||[effect.retireReplay,effect.retireAlerts,effect.retireScripts].some(flag=>typeof flag!=='boolean'))throw new Error('Template identity policy needs an explicit effect.');
 const applied:TemplateIdentityStep[]=[];
 if(effect.retireReplay){host.retireReplay();applied.push('replay');}
 if(effect.retireAlerts){host.retireAlerts();applied.push('alerts');}
 if(effect.retireScripts){host.retireScripts();applied.push('scripts');}
 host.freshExecutionIdentity();applied.push('execution');
 return applied;
}
