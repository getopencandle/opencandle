'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {BoundaryError,exactKeys}=require('./validation.cjs');
// The user's own SEC contact (free text such as "Jane Doe jane@example.com"). It lives in one small file in the app's
// userData folder, kept apart from saved layouts and chart files, and is used only as the User-Agent of requests to SEC.
const IDENTITY_FILE='sec-identity.json';
const MIN_LENGTH=5;
const MAX_LENGTH=120;
const UNSET_MESSAGE='Add your SEC contact to load company data.';
function checkIdentity(value){
  if(typeof value!=='string')throw new BoundaryError('INVALID_ARGUMENT','Enter your SEC contact as text.');
  const text=value.trim();
  if(text==='')return '';
  if(/[^\x20-\x7e]/.test(text))throw new BoundaryError('INVALID_ARGUMENT','Use plain letters, digits and punctuation only, on one line.');
  if(text.length<MIN_LENGTH||text.length>MAX_LENGTH)throw new BoundaryError('INVALID_ARGUMENT','Your SEC contact must be '+MIN_LENGTH+' to '+MAX_LENGTH+' characters.');
  const at=text.indexOf('@');
  if(at<0||text.indexOf('.',at)<0)throw new BoundaryError('INVALID_ARGUMENT','Include an email address, such as Jane Doe jane@example.com.');
  return text;
}
function identityInput(raw){exactKeys(raw,['value']);return checkIdentity(raw.value);}
class SecIdentity {
  constructor({directory}){this.file=path.join(directory,IDENTITY_FILE);}
  // Synchronous on purpose: the SEC client reads it at the moment it builds a request, and the file is a few bytes.
  value(){
    try{
      const record=JSON.parse(fs.readFileSync(this.file,'utf8'));
      if(record&&record.schemaVersion===1&&typeof record.value==='string'){try{return checkIdentity(record.value);}catch{return '';}}
    }catch{/* absent or unreadable means unset */}
    return '';
  }
  get(){const value=this.value();return{set:value!=='',value};}
  set(raw){
    const value=identityInput(raw);
    if(value===''){fs.rmSync(this.file,{force:true});return{set:false};}
    fs.mkdirSync(path.dirname(this.file),{recursive:true});
    const temp=this.file+'.'+process.pid+'.tmp';
    try{fs.writeFileSync(temp,JSON.stringify({schemaVersion:1,value}),{mode:0o600});fs.renameSync(temp,this.file);}
    catch(error){try{fs.rmSync(temp,{force:true});}catch{/* best effort */}throw error;}
    return{set:true};
  }
}
module.exports={SecIdentity,checkIdentity,identityInput,IDENTITY_FILE,UNSET_MESSAGE,MIN_LENGTH,MAX_LENGTH};
