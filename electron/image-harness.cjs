'use strict';
// Image tool: a SYNTHETIC image for executable-interface flows only. The Image drawing tool opens the
// operating system file chooser, which the exe harness cannot drive (trusted visible-UI input only, no setInputFiles). Under
// the harness gate below, the main process hands the renderer one fixed, invented PNG (a 24 x 16 blue and white checker made
// for this purpose, not a user file) through the trusted lv:harness:image channel, and arming Image imports it through the
// same guarded import path a chosen file takes, so a flow can verify placement. Nothing is read from disk and nothing leaves
// the process: this module has no file, network, process or shell access.
//
// Selection (decided per call from the run's environment): LV_IMAGE_HARNESS=synthetic-png, and --lv-profile must name a
// folder inside the OS temp folder (a throwaway profile: never the default profile or local-data/demo-profile). A packaged
// build also needs LV_EXE_HARNESS=image-inject. Anything else answers null, and the Image tool opens the file chooser as
// always. main.cjs loads this module only when LV_IMAGE_HARNESS is set.
const HARNESS_IMAGE_FLAG='LV_IMAGE_HARNESS',HARNESS_IMAGE_VALUE='synthetic-png',HARNESS_FLAG='LV_EXE_HARNESS',HARNESS_VALUE='image-inject';
const SYNTHETIC_NAME='LV-SYNTHETIC-harness-image.png';
const SYNTHETIC_PNG_BASE64='iVBORw0KGgoAAAANSUhEUgAAABgAAAAQCAIAAACDRijCAAAAJElEQVR42mPQTPoPR8iAVHGGYWwQJZqRxYezQaPpaDQdUcEgANIyZW4j7KZzAAAAAElFTkSuQmCC';

/** True when `profile` is a folder strictly inside `tmpdir`. Both are absolute paths the caller already resolved (realpath). */
function profileUnderTemp(profile,tmpdir){
  if(typeof profile!=='string'||typeof tmpdir!=='string'||!profile||!tmpdir)return false;
  const norm=value=>{let text=value.split(String.fromCharCode(92)).join('/').replace(/\/+$/,'');if(/^[a-z]:\//i.test(text))text=text.toLowerCase();return text;};
  const p=norm(profile),t=norm(tmpdir);
  if(!t||/(^|\/)\.\.?(\/|$)/.test(p))return false;
  return p.startsWith(t+'/')&&p.length>t.length+1;
}
function imageHarnessDecision({env,packaged,profile=null,tmpdir=null}){
  const requested=env&&typeof env[HARNESS_IMAGE_FLAG]==='string'?env[HARNESS_IMAGE_FLAG]:'';
  if(!requested)return {mode:'off',reason:null};
  if(requested!==HARNESS_IMAGE_VALUE)return {mode:'blocked',reason:HARNESS_IMAGE_FLAG+' must be "'+HARNESS_IMAGE_VALUE+'".'};
  if(!profileUnderTemp(profile,tmpdir))return {mode:'blocked',reason:'The synthetic harness image is used only on a throwaway profile: --lv-profile must name a folder inside the OS temp folder.'};
  if(packaged&&env[HARNESS_FLAG]!==HARNESS_VALUE)return {mode:'blocked',reason:'A packaged build uses the synthetic harness image only under the exe harness ('+HARNESS_FLAG+'='+HARNESS_VALUE+').'};
  return {mode:'synthetic',reason:null};
}
/** The synthetic image for an enabled decision, else null. A fresh copy each call. */
function harnessImage(decision){
  if(!decision||decision.mode!=='synthetic')return null;
  return {schemaVersion:1,synthetic:true,name:SYNTHETIC_NAME,bytes:new Uint8Array(Buffer.from(SYNTHETIC_PNG_BASE64,'base64'))};
}
module.exports={imageHarnessDecision,harnessImage,profileUnderTemp,HARNESS_IMAGE_FLAG,HARNESS_IMAGE_VALUE,HARNESS_FLAG,HARNESS_VALUE,SYNTHETIC_NAME};
