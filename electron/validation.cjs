'use strict';
const MAX_JSON_BYTES = 32 * 1024 * 1024;
const MAX_IMPORT_BYTES = 64 * 1024 * 1024;
class BoundaryError extends Error { constructor(code, message) { super(message); this.code = code; } }
function fail(message) { throw new BoundaryError('INVALID_ARGUMENT', message); }
function exactKeys(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail('Expected a plain object.');
  const keys = Object.keys(value);
  if (required.some(k => !Object.hasOwn(value, k)) || keys.some(k => !required.includes(k) && !optional.includes(k))) fail('Unexpected or missing fields.');
}
function jsonData(value) {
  const ancestors = new Set();
  let count = 0, bytes = 0;
  const addBytes = amount => { bytes += amount; if (bytes > MAX_JSON_BYTES) fail('Workspace exceeds the 32 MiB limit.'); };
  // Count escaped UTF-8 before allocating the complete JSON string. Shared
  // references are counted at every occurrence, just as serialization repeats them.
  function stringBytes(text) {
    addBytes(2);
    if (text.length > MAX_JSON_BYTES - bytes) fail('Workspace exceeds the 32 MiB limit.');
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code === 34 || code === 92 || code === 8 || code === 9 || code === 10 || code === 12 || code === 13) addBytes(2);
      else if (code < 32) addBytes(6);
      else if (code < 128) addBytes(1);
      else if (code < 2048) addBytes(2);
      else if (code >= 0xd800 && code <= 0xdbff) {
        const next = text.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) { addBytes(4); i++; } else addBytes(6);
      } else if (code >= 0xdc00 && code <= 0xdfff) addBytes(6);
      else addBytes(3);
    }
  }
  function walk(v, depth) {
    if (++count > 1000000 || depth > 80) fail('Workspace structure exceeds limits.');
    if (v === null) { addBytes(4); return; }
    if (typeof v === 'string') { stringBytes(v); return; }
    if (typeof v === 'boolean') { addBytes(v ? 4 : 5); return; }
    if (typeof v === 'number') { if (!Number.isFinite(v)) fail('Non-finite numbers are unsupported.'); addBytes(String(v).length); return; }
    if (typeof v !== 'object' || ancestors.has(v)) fail('Only acyclic JSON data is accepted.');
    const array = Array.isArray(v);
    if (Object.getPrototypeOf(v) !== (array ? Array.prototype : Object.prototype)) fail('Only plain JSON objects and arrays are accepted.');
    const serializer = Object.getOwnPropertyDescriptor(v, 'toJSON');
    if (serializer && (!Object.hasOwn(serializer, 'value') || typeof serializer.value === 'function')) fail('Custom JSON serializers are unsupported.');
    if (array && v.length > 1000000 - count) fail('Workspace structure exceeds limits.');
    ancestors.add(v);
    addBytes(2);
    let items = 0;
    for (const key of Object.keys(v)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('Unsafe object keys are unsupported.');
      if (/^(password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|private[_-]?key)$/i.test(key)) fail('Credentials must not be stored.');
      const property = Object.getOwnPropertyDescriptor(v, key);
      if (!property || !Object.hasOwn(property, 'value')) fail('Only JSON data properties are accepted.');
      if (array && (String(items) !== key || !property.enumerable)) fail('Only dense JSON arrays are accepted.');
      if (items++) addBytes(1);
      if (!array) { stringBytes(key); addBytes(1); }
      walk(property.value, depth + 1);
    }
    if (array && items !== v.length) fail('Only dense JSON arrays are accepted.');
    ancestors.delete(v);
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') fail('Workspace data must be an object.');
  walk(value, 0);
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) > MAX_JSON_BYTES) fail('Workspace exceeds the 32 MiB limit.');
  return JSON.parse(text);
}
function saveInput(value) {
  exactKeys(value, ['schemaVersion', 'expectedRevision', 'data']);
  if (value.schemaVersion !== 1 || !Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 0) fail('Invalid schema or revision.');
  return { schemaVersion: 1, expectedRevision: value.expectedRevision, data: jsonData(value.data) };
}
function exportInput(value) { exactKeys(value, ['schemaVersion', 'data']); if (value.schemaVersion !== 1) fail('Unsupported schema.'); return { schemaVersion: 1, data: jsonData(value.data) }; }
function pngInput(value) {
  exactKeys(value, ['pngDataUrl'], ['suggestedName']);
  if (typeof value.pngDataUrl !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]*={0,2}$/.test(value.pngDataUrl) || value.pngDataUrl.length > 48 * 1024 * 1024) fail('Expected a bounded PNG data URL.');
  const bytes = Buffer.from(value.pngDataUrl.slice('data:image/png;base64,'.length), 'base64');
  if (bytes.length < 8 || bytes.length > MAX_JSON_BYTES || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) fail('Invalid PNG signature or size.');
  if (value.suggestedName !== undefined && (typeof value.suggestedName !== 'string' || !/^[A-Za-z0-9 _.-]{1,100}$/.test(value.suggestedName) || value.suggestedName.includes('..'))) fail('Invalid suggested name.');
  return { bytes, suggestedName: value.suggestedName || 'OpenCandle-chart.png' };
}
/** Copy chart image takes the PNG data URL only (no file name: nothing is saved). */
function pngCopyInput(value) {
  exactKeys(value, ['pngDataUrl']);
  return { bytes: pngInput(value).bytes };
}
function dataExportInput(value) {
  exactKeys(value, ['text','suggestedName','format']);
  if(!['csv','json','txt','ics'].includes(value.format)||typeof value.text!=='string'||Buffer.byteLength(value.text)>20*1024*1024||typeof value.suggestedName!=='string'||!/^[A-Za-z0-9 _.-]{1,100}$/.test(value.suggestedName)||value.suggestedName.includes('..')||!value.suggestedName.toLowerCase().endsWith('.'+value.format))fail('Expected bounded CSV/JSON/TXT/ICS text and a safe matching filename.');
  if(value.format==='json'){let parsed;try{parsed=JSON.parse(value.text);}catch{fail('Expected valid JSON export text.');}jsonData(parsed);}
  return {bytes:Buffer.from(value.text,'utf8'),suggestedName:value.suggestedName,format:value.format};
}
function binaryExportInput(value){
  exactKeys(value,['data','suggestedName','format']);
  if(value.format!=='xlsx'||!(value.data instanceof Uint8Array)||value.data.byteLength<4||value.data.byteLength>20*1024*1024||value.data[0]!==0x50||value.data[1]!==0x4b||value.data[2]!==0x03||value.data[3]!==0x04||typeof value.suggestedName!=='string'||!/^[A-Za-z0-9 _.-]{1,100}$/.test(value.suggestedName)||value.suggestedName.includes('..')||!value.suggestedName.toLowerCase().endsWith('.xlsx'))fail('Expected a bounded XLSX workbook and a safe .xlsx filename.');
  return {bytes:Buffer.from(value.data.buffer,value.data.byteOffset,value.data.byteLength),suggestedName:value.suggestedName,format:'xlsx'};
}
function csvInput(value){if(value?.format!=='csv')fail('Expected CSV export text.');return dataExportInput(value);}
function cancelInput(value) { exactKeys(value, ['requestId']); if (typeof value.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value.requestId)) fail('Invalid request identifier.'); return value.requestId; }
function isAppURL(value) {
  let parsed;try {parsed=new URL(value);} catch {return false;}
  return parsed.protocol==='lv:'&&parsed.hostname==='app'&&!parsed.username&&!parsed.password&&!parsed.port;
}
function assetPath(url, directory) {
  const path = require('node:path');
  let parsed; try { parsed = new URL(url); } catch { return null; }
  if (!isAppURL(url)) return null;
  let pathname; try { pathname = decodeURIComponent(parsed.pathname); } catch { return null; }
  if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(segment => segment === '..' || segment === '.')) return null;
  const target = path.resolve(directory, '.' + (pathname === '/' ? '/index.html' : pathname));
  const relative = path.relative(directory, target);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? target : null;
}
module.exports = { MAX_JSON_BYTES, MAX_IMPORT_BYTES, BoundaryError, exactKeys, jsonData, saveInput, exportInput, pngInput, pngCopyInput, csvInput, dataExportInput, binaryExportInput, cancelInput, isAppURL, assetPath };
