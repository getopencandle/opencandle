// Rows of the indicator templates dropdown. Pure data; the host owns applying and undoing.
import {templateName,type IndicatorTemplate,type IndicatorTemplates} from './indicator-templates';

export type TemplateMenuItem=
 |{kind:'template';id:string;label:string;applied:boolean;template:IndicatorTemplate}
 |{kind:'action';id:'undo'|'save'|'manage';label:string}
 |{kind:'empty';label:string}
 |{kind:'separator'};
export const TEMPLATE_MENU_SAVE='Save indicator template…';
export const TEMPLATE_MENU_MANAGE='Manage templates…';
/** applied: the template the user just applied, when the host can still undo it. Saved templates sort by name, ignoring case. */
export function templateMenuItems(library:IndicatorTemplates,applied:{name:string}|null):TemplateMenuItem[]{
 const rows=[...library.records].sort((a,b)=>templateName(a.name).localeCompare(templateName(b.name),'en',{sensitivity:'base'})||a.id.localeCompare(b.id));
 return[
  ...(applied?[{kind:'action' as const,id:'undo' as const,label:'Undo apply of '+applied.name}]:[]),
  ...(rows.length?rows.map(template=>({kind:'template' as const,id:template.id,label:template.name,applied:applied?.name===template.name,template})):[{kind:'empty' as const,label:'No saved templates'}]),
  {kind:'separator'},
  {kind:'action',id:'save',label:TEMPLATE_MENU_SAVE},
  {kind:'action',id:'manage',label:TEMPLATE_MENU_MANAGE},
 ];
}
