'use strict';
// Guest-side source for ctx.barcolor, the drawing objects (ctx.label, ctx.line, ctx.box,
// ctx.table) and ctx.log. script-runtime.cjs splices RUNNER into the per-run closure after the TA runner, so it
// uses the same captured primitives (fail, colorOf, optionsOf, oneOf, pick, currentBar, append, emit, requireEvent,
// field, record, onlyKeys, createObject, freeze, isInteger, isFinite, stringSlice, apply).
//
// The sandbox rules hold here too: no guest object is ever called or iterated, options are read through own data
// descriptors (optionsOf), loops are index loops, and nothing reads a bar after the current one.
//
// Every rule below is unless noted. The object budget follows the published Pine idea of
// max_labels_count / max_lines_count / max_boxes_count (a per-script cap; past it the oldest object is deleted), but the
// numbers are OpenCandle's own, so the defaults (50) and the ceiling (500) are our own choice.
// Drawing objects and logs are not kept in the snapshot: they are rebuilt by every run, as plots and visuals are.
// Linefills share the label/line/box budget rules; polylines follow Pine's max_polylines_count idea
// (default 50, at most 100) with at most 1,000 points each and 5,000 retained points in all (oldest evicted).
const OBJECT_LIMITS = Object.freeze({ defaultBudget: 50, maxBudget: 500, tables: 9, tableColumns: 20, tableRows: 50, tableCells: 500, perBar: 1000, futureBars: 500, text: 500, barcolors: 5000, logs: 1000, logText: 1000, polylineBudget: 50, polylineMax: 100, polylinePoints: 1000, polylinePointTotal: 5000 });
const RUNNER = `
    // ---- barcolor ----
    const objectsOut={barcolors:[]};
    const barcolor=color=>{
      requireEvent();if(color===null)return;const value=colorOf(color,'ctx.barcolor'),t=snapshot.processedEvent.time,rows=objectsOut.barcolors,last=rows[rows.length-1];
      if(last&&(logicalPositions?last.n===snapshot.processedCount:last.t===t)){last.color=value;return;}
      if(rows.length>=${OBJECT_LIMITS.barcolors})fail('Bar color output limit exceeded.');emit();append(rows,logicalPositions?{t,color:value,n:snapshot.processedCount}:{t,color:value});
    };
    // ---- drawing objects ----
    const OBJ_XLOCS=['index','time'],OBJ_YLOCS=['price','abovebar','belowbar'],OBJ_EXTENDS=['none','left','right','both'],OBJ_TEXT_SIZES=['auto','tiny','small','normal','large','huge'],OBJ_HALIGN=['left','center','right'],OBJ_VALIGN=['top','center','bottom'];
    const OBJ_LABEL_STYLES=['label_up','label_down','label_left','label_right','label_center','label_lower_left','label_lower_right','label_upper_left','label_upper_right','circle','square','diamond','flag','arrowup','arrowdown','triangleup','triangledown','cross','xcross','text_outline','none'];
    const OBJ_LINE_STYLES=['solid','dashed','dotted','arrowleft','arrowright','arrowboth'],OBJ_BORDER_STYLES=['solid','dashed','dotted'];
    const OBJ_POSITIONS=['top_left','top_center','top_right','middle_left','middle_center','middle_right','bottom_left','bottom_center','bottom_right'];
    const objBudget={label:${OBJECT_LIMITS.defaultBudget},line:${OBJECT_LIMITS.defaultBudget},box:${OBJECT_LIMITS.defaultBudget},linefill:${OBJECT_LIMITS.defaultBudget},polyline:${OBJECT_LIMITS.polylineBudget},table:${OBJECT_LIMITS.tables}};
    {
      const label='The objectLimits declaration',raw=field(definition,'objectLimits',label);
      if(raw!==undefined){record(raw,label);onlyKeys(raw,['labels','lines','boxes','linefills','polylines'],label);const names=['labels','lines','boxes','linefills','polylines'],kinds=['label','line','box','linefill','polyline'];
        for(let i=0;i<5;i++){const value=field(raw,names[i],label),top=kinds[i]==='polyline'?${OBJECT_LIMITS.polylineMax}:${OBJECT_LIMITS.maxBudget};if(value===undefined)continue;if(!isInteger(value)||value<1||value>top)fail('objectLimits.'+names[i]+' must be an integer from 1 to '+top+'.');objBudget[kinds[i]]=value;}}
    }
    const objLive={label:[],line:[],box:[],linefill:[],polyline:[],table:[]},objById=createObject(null),objDead=createObject(null);let polylinePoints=0;
    // Ids are bar-scoped (bar count x ${OBJECT_LIMITS.perBar} + sequence), so an id kept in ctx.state from an earlier run never names a new object.
    const objFirstId=snapshot.processedCount*${OBJECT_LIMITS.perBar};let objBar=-1,objSeq=0,objCells=0;
    const objText=(value,label)=>{if(typeof value!=='string'||value.length>${OBJECT_LIMITS.text})fail(label+' must be text of at most ${OBJECT_LIMITS.text} characters.');return value;};
    const objNumber=(value,label)=>{if(typeof value!=='number'||!isFinite(value))fail(label+' must be a finite number.');return value;};
    const objInt=(value,label,min,max)=>{if(!isInteger(value)||value<min||value>max)fail(label+' must be an integer from '+min+' to '+max+'.');return value;};
    const objColor=(value,label)=>value===null?null:colorOf(value,label);
    const objX=(value,xloc,label)=>{
      if(xloc==='index'){const top=snapshot.processedCount+${OBJECT_LIMITS.futureBars};if(!isInteger(value)||value<0||value>top)fail(label+' must be a bar index from 0 to '+top+' (at most ${OBJECT_LIMITS.futureBars} bars ahead) when xloc is index.');return value;}
      if(typeof value!=='number'||!isFinite(value))fail(label+' must be a finite time in seconds when xloc is time.');return value;
    };
    // [field, check, extra]: x (bar index or time), num, text, color (null allowed), enum, int
    const OBJ_SPECS={
      label:[['x','x'],['y','num'],['yloc','enum',OBJ_YLOCS],['text','text'],['style','enum',OBJ_LABEL_STYLES],['color','color'],['textColor','color'],['size','enum',OBJ_TEXT_SIZES],['textAlign','enum',OBJ_HALIGN],['tooltip','text']],
      line:[['x1','x'],['y1','num'],['x2','x'],['y2','num'],['extend','enum',OBJ_EXTENDS],['color','color'],['style','enum',OBJ_LINE_STYLES],['width','int',1,10]],
      box:[['left','x'],['top','num'],['right','x'],['bottom','num'],['extend','enum',OBJ_EXTENDS],['borderColor','color'],['borderWidth','int',0,10],['borderStyle','enum',OBJ_BORDER_STYLES],['bgColor','color'],['text','text'],['textColor','color'],['textSize','enum',OBJ_TEXT_SIZES],['hAlign','enum',OBJ_HALIGN],['vAlign','enum',OBJ_VALIGN]],
    };
    const objDefaults=(kind,xloc)=>{
      const bar=currentBar(),x=xloc==='index'?snapshot.processedCount:bar.time;
      if(kind==='label')return{x,y:bar.close,yloc:'price',text:'',style:'label_down',color:'#6fa8ff',textColor:'#ffffff',size:'normal',textAlign:'center',tooltip:''};
      if(kind==='line')return{x1:x,y1:bar.close,x2:x,y2:bar.close,extend:'none',color:'#6fa8ff',style:'solid',width:1};
      return{left:x,top:bar.high,right:x,bottom:bar.low,extend:'none',borderColor:'#6fa8ff',borderWidth:1,borderStyle:'solid',bgColor:'#6fa8ff33',text:'',textColor:null,textSize:'auto',hAlign:'center',vAlign:'center'};
    };
    const objFields=(kind,previous,raw,label)=>{
      const spec=OBJ_SPECS[kind],names=['xloc'];for(let i=0;i<spec.length;i++)append(names,spec[i][0]);
      const o=optionsOf(raw,names,label),xloc=o.xloc!==undefined?oneOf(o.xloc,OBJ_XLOCS,label+' xloc'):previous!==null?previous.xloc:'index';
      const base=previous!==null?previous:objDefaults(kind,xloc),out={xloc};
      for(let i=0;i<spec.length;i++){
        const row=spec[i],name=row[0],given=o[name],value=given===undefined?base[name]:given,where=label+' '+name;let checked;
        if(row[1]==='x')checked=objX(value,xloc,where);else if(row[1]==='num')checked=objNumber(value,where);else if(row[1]==='text')checked=objText(value,where);
        else if(row[1]==='color')checked=objColor(value,where);else if(row[1]==='enum')checked=oneOf(value,row[2],where);else checked=objInt(value,where,row[2],row[3]);
        out[name]=checked;
      }
      return out;
    };
    const objNewId=()=>{const now=snapshot.processedCount;if(objBar!==now){objBar=now;objSeq=0;}if(objSeq>=${OBJECT_LIMITS.perBar})fail('A script may create at most ${OBJECT_LIMITS.perBar} drawing objects per bar.');return now*${OBJECT_LIMITS.perBar}+(objSeq++);};
    const objRemove=item=>{
      const list=objLive[item.kind];for(let i=0;i<list.length;i++)if(list[i]===item){for(let j=i+1;j<list.length;j++)list[j-1]=list[j];list.length--;break;}
      if(item.kind==='table')objCells-=item.filled;if(item.kind==='polyline')polylinePoints-=item.points.length;delete objById[item.id];objDead[item.id]=item.kind;
      // As in Pine, deleting (or evicting) a line also deletes every linefill that uses it.
      if(item.kind==='line'){const fills=objLive.linefill;for(let i=fills.length-1;i>=0;i--)if(fills[i].line1===item.id||fills[i].line2===item.id)objRemove(fills[i]);}
    };
    const objAdd=(kind,item)=>{const id=objNewId(),list=objLive[kind];if(list.length>=objBudget[kind])objRemove(list[0]);item.kind=kind;item.id=id;append(list,item);objById[id]=item;return id;};
    // A live object, null for one this run deleted (or the budget removed), and an explicit refusal otherwise.
    const objFind=(kind,id,label)=>{
      if(typeof id!=='number'||!isInteger(id)||id<0)fail(label+' needs an id returned by ctx.'+kind+'.new.');
      const live=objById[id];if(live!==undefined){if(live.kind!==kind)fail(label+': id '+id+' is a '+live.kind+', not a '+kind+'.');return live;}
      const dead=objDead[id];if(dead!==undefined){if(dead!==kind)fail(label+': id '+id+' was a '+dead+', not a '+kind+'.');return null;}
      if(id<objFirstId)fail(label+': object '+id+' was created before this run. Drawing objects are not kept in the snapshot; recalculate from the first bar.');
      fail(label+': there is no '+kind+' with id '+id+'.');
    };
    const objCopy=item=>{const copy={},keys=['xloc'],spec=OBJ_SPECS[item.kind];for(let i=0;i<spec.length;i++)append(keys,spec[i][0]);for(let i=0;i<keys.length;i++)copy[keys[i]]=item.fields[keys[i]];copy.id=item.id;return freeze(copy);};
    const objApi=kind=>freeze({
      new(options){requireEvent();const label='ctx.'+kind+'.new';return objAdd(kind,{fields:objFields(kind,null,options,label)});},
      set(id,options){requireEvent();const label='ctx.'+kind+'.set',item=objFind(kind,id,label);if(item===null)return false;item.fields=objFields(kind,item.fields,options,label);return true;},
      get(id){requireEvent();const item=objFind(kind,id,'ctx.'+kind+'.get');return item===null?null:objCopy(item);},
      delete(id){requireEvent();if(id===null||id===undefined)return;const item=objFind(kind,id,'ctx.'+kind+'.delete');if(item!==null)objRemove(item);},
      all(){requireEvent();const list=objLive[kind],ids=[];for(let i=0;i<list.length;i++)append(ids,list[i].id);return freeze(ids);},
    });
    const tableApi=freeze({
      new(options){
        requireEvent();const label='ctx.table.new',o=optionsOf(options,['position','columns','rows','bgColor','frameColor','frameWidth','borderColor','borderWidth'],label);
        const fields={position:oneOf(pick(o.position,'top_right'),OBJ_POSITIONS,label+' position'),columns:objInt(pick(o.columns,1),label+' columns',1,${OBJECT_LIMITS.tableColumns}),rows:objInt(pick(o.rows,1),label+' rows',1,${OBJECT_LIMITS.tableRows}),
          bgColor:objColor(pick(o.bgColor,null),label+' bgColor'),frameColor:objColor(pick(o.frameColor,null),label+' frameColor'),frameWidth:objInt(pick(o.frameWidth,0),label+' frameWidth',0,10),borderColor:objColor(pick(o.borderColor,null),label+' borderColor'),borderWidth:objInt(pick(o.borderWidth,0),label+' borderWidth',0,10)};
        const cells=[];for(let i=0;i<fields.columns*fields.rows;i++)append(cells,null);
        return objAdd('table',{fields,cells,filled:0});
      },
      cell(id,column,row,options){
        requireEvent();const label='ctx.table.cell',item=objFind('table',id,label);if(item===null)return false;const f=item.fields;
        objInt(column,label+' column',0,f.columns-1);objInt(row,label+' row',0,f.rows-1);
        const o=optionsOf(options,['text','textColor','bgColor','hAlign','vAlign','textSize','tooltip'],label);
        const cell={text:objText(pick(o.text,''),label+' text'),textColor:objColor(pick(o.textColor,null),label+' textColor'),bgColor:objColor(pick(o.bgColor,null),label+' bgColor'),hAlign:oneOf(pick(o.hAlign,'center'),OBJ_HALIGN,label+' hAlign'),vAlign:oneOf(pick(o.vAlign,'center'),OBJ_VALIGN,label+' vAlign'),textSize:oneOf(pick(o.textSize,'normal'),OBJ_TEXT_SIZES,label+' textSize'),tooltip:objText(pick(o.tooltip,''),label+' tooltip')};
        const at=row*f.columns+column;if(item.cells[at]===null){if(objCells>=${OBJECT_LIMITS.tableCells})fail('Tables may hold at most ${OBJECT_LIMITS.tableCells} filled cells in all.');objCells++;item.filled++;}
        item.cells[at]=cell;return true;
      },
      clear(id){requireEvent();const item=objFind('table',id,'ctx.table.clear');if(item===null)return;for(let i=0;i<item.cells.length;i++)item.cells[i]=null;objCells-=item.filled;item.filled=0;},
      delete(id){requireEvent();if(id===null||id===undefined)return;const item=objFind('table',id,'ctx.table.delete');if(item!==null)objRemove(item);},
      all(){requireEvent();const list=objLive.table,ids=[];for(let i=0;i<list.length;i++)append(ids,list[i].id);return freeze(ids);},
    });
    // ---- linefill (the band between two live lines) and polyline (an immutable multi-point path) ----
    const linefillApi=freeze({
      new(options){
        requireEvent();const label='ctx.linefill.new',o=optionsOf(options,['line1','line2','color'],label);
        const a=objFind('line',o.line1,label+' line1'),b=objFind('line',o.line2,label+' line2');
        if(a===null||b===null)fail(label+' needs two live lines; a deleted line has no linefill.');if(a===b)fail(label+' needs two different lines.');
        const id=objAdd('linefill',{line1:a.id,line2:b.id,color:objColor(pick(o.color,'#6fa8ff33'),label+' color')});
        // A new linefill between the same two lines replaces the older one (Pine keeps one fill per pair).
        const fills=objLive.linefill;for(let i=fills.length-2;i>=0;i--){const f=fills[i];if(f.line1===a.id&&f.line2===b.id||f.line1===b.id&&f.line2===a.id)objRemove(f);}
        return id;
      },
      set(id,options){requireEvent();const label='ctx.linefill.set',item=objFind('linefill',id,label);if(item===null)return false;const o=optionsOf(options,['color'],label);if(o.color!==undefined)item.color=objColor(o.color,label+' color');return true;},
      get(id){requireEvent();const item=objFind('linefill',id,'ctx.linefill.get');return item===null?null:freeze({id:item.id,line1:item.line1,line2:item.line2,color:item.color});},
      delete(id){requireEvent();if(id===null||id===undefined)return;const item=objFind('linefill',id,'ctx.linefill.delete');if(item!==null)objRemove(item);},
      all(){requireEvent();const list=objLive.linefill,ids=[];for(let i=0;i<list.length;i++)append(ids,list[i].id);return freeze(ids);},
    });
    const polylineApi=freeze({
      new(options){
        requireEvent();const label='ctx.polyline.new',o=optionsOf(options,['points','xloc','curved','closed','lineColor','fillColor','lineWidth','lineStyle'],label);
        const xloc=oneOf(pick(o.xloc,'index'),OBJ_XLOCS,label+' xloc'),raw=o.points;
        if(!isArray(raw)||raw.length<2||raw.length>${OBJECT_LIMITS.polylinePoints})fail(label+' points must be a list of 2 to ${OBJECT_LIMITS.polylinePoints} {x, y} points.');
        const points=[];for(let i=0;i<raw.length;i++){const where=label+' point '+i,q=optionsOf(record(field(raw,toString(i),where),where),['x','y'],where);append(points,{x:objX(q.x,xloc,where+' x'),y:objNumber(q.y,where+' y')});}
        const flag=(value,name)=>{if(typeof value!=='boolean')fail(label+' '+name+' must be true or false.');return value;};
        const fields={xloc,curved:flag(pick(o.curved,false),'curved'),closed:flag(pick(o.closed,false),'closed'),lineColor:objColor(pick(o.lineColor,'#6fa8ff'),label+' lineColor'),fillColor:objColor(pick(o.fillColor,null),label+' fillColor'),
          lineWidth:objInt(pick(o.lineWidth,1),label+' lineWidth',1,10),lineStyle:oneOf(pick(o.lineStyle,'solid'),OBJ_LINE_STYLES,label+' lineStyle')};
        const list=objLive.polyline;while(list.length&&polylinePoints+points.length>${OBJECT_LIMITS.polylinePointTotal})objRemove(list[0]);
        polylinePoints+=points.length;return objAdd('polyline',{fields,points});
      },
      get(id){requireEvent();const item=objFind('polyline',id,'ctx.polyline.get');if(item===null)return null;const f=item.fields,points=[];for(let i=0;i<item.points.length;i++)append(points,freeze({x:item.points[i].x,y:item.points[i].y}));
        return freeze({id:item.id,xloc:f.xloc,curved:f.curved,closed:f.closed,lineColor:f.lineColor,fillColor:f.fillColor,lineWidth:f.lineWidth,lineStyle:f.lineStyle,points:freeze(points)});},
      delete(id){requireEvent();if(id===null||id===undefined)return;const item=objFind('polyline',id,'ctx.polyline.delete');if(item!==null)objRemove(item);},
      all(){requireEvent();const list=objLive.polyline,ids=[];for(let i=0;i<list.length;i++)append(ids,list[i].id);return freeze(ids);},
    });
    // ---- ctx.log ----
    const logsOut={entries:[],dropped:0};
    const logPart=value=>{if(typeof value==='string')return value;if(value===null||typeof value==='boolean'||typeof value==='number')return ''+value;fail('ctx.log messages take text, numbers, true or false, or null.');};
    const logAt=level=>(...parts)=>{
      requireEvent();if(parts.length<1||parts.length>16)fail('ctx.log.'+level+' takes 1 to 16 values.');
      let message='';for(let i=0;i<parts.length;i++){const text=logPart(parts[i]);message=i?message+' '+text:text;if(message.length>${OBJECT_LIMITS.logText})break;}
      if(message.length>${OBJECT_LIMITS.logText})message=apply(stringSlice,message,[0,${OBJECT_LIMITS.logText}]);
      if(logsOut.entries.length>=${OBJECT_LIMITS.logs}){logsOut.dropped++;return;}
      emit();append(logsOut.entries,{t:snapshot.processedEvent.time,n:snapshot.processedCount,level,message});
    };
    const log=freeze({info:logAt('info'),warn:logAt('warn'),error:logAt('error')});
    // Live objects are counted against the output budget once, at the end of the run.
    const finishObjects=()=>{
      const out={base:input.bars.length?{index:objFirstId/${OBJECT_LIMITS.perBar},time:input.bars[0].time}:null,barcolors:objectsOut.barcolors,labels:[],lines:[],boxes:[],tables:[],linefills:[],polylines:[]};
      for(let i=0;i<objLive.linefill.length;i++){emit();const item=objLive.linefill[i];append(out.linefills,{id:item.id,line1:item.line1,line2:item.line2,color:item.color});}
      for(let i=0;i<objLive.polyline.length;i++){emit();const item=objLive.polyline[i],f=item.fields,points=[];for(let j=0;j<item.points.length;j++)append(points,{x:item.points[j].x,y:item.points[j].y});
        append(out.polylines,{id:item.id,xloc:f.xloc,curved:f.curved,closed:f.closed,lineColor:f.lineColor,fillColor:f.fillColor,lineWidth:f.lineWidth,lineStyle:f.lineStyle,points});}
      const names=['label','line','box'],targets=[out.labels,out.lines,out.boxes];
      for(let k=0;k<3;k++){const list=objLive[names[k]],spec=OBJ_SPECS[names[k]];for(let i=0;i<list.length;i++){emit();const item=list[i],row={id:item.id,xloc:item.fields.xloc};for(let j=0;j<spec.length;j++)row[spec[j][0]]=item.fields[spec[j][0]];append(targets[k],row);}}
      for(let i=0;i<objLive.table.length;i++){emit();const item=objLive.table[i],f=item.fields,cells=[];
        for(let at=0;at<item.cells.length;at++){const cell=item.cells[at];if(cell===null)continue;emit();append(cells,{column:at%f.columns,row:(at-at%f.columns)/f.columns,text:cell.text,textColor:cell.textColor,bgColor:cell.bgColor,hAlign:cell.hAlign,vAlign:cell.vAlign,textSize:cell.textSize,tooltip:cell.tooltip});}
        append(out.tables,{id:item.id,position:f.position,columns:f.columns,rows:f.rows,bgColor:f.bgColor,frameColor:f.frameColor,frameWidth:f.frameWidth,borderColor:f.borderColor,borderWidth:f.borderWidth,cells});}
      return out;
    };
    const lvObjects={barcolor,label:objApi('label'),line:objApi('line'),box:objApi('box'),table:tableApi,log,linefill:linefillApi,polyline:polylineApi};
`;
module.exports = { RUNNER, OBJECT_LIMITS };
