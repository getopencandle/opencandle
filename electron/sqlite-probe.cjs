'use strict';
// Trusted capability probe only. No renderer channel exposes SQL or filesystem paths.
process.parentPort.on('message', event => {
  const startedAt = new Date().toISOString();
  let database;
  try {
    const { DatabaseSync } = require('node:sqlite');
    const path = require('node:path');
    const file = path.join(event.data.directory, 'synthetic-sqlite-probe.db');
    database = new DatabaseSync(file);
    database.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS synthetic_gate (id INTEGER PRIMARY KEY, amount TEXT NOT NULL)');
    database.exec('BEGIN IMMEDIATE');
    const write = database.prepare('INSERT OR REPLACE INTO synthetic_gate(id, amount) VALUES (?, ?)');
    write.run(1, '1000.00'); write.run(2, '1.25'); database.exec('COMMIT');
    const initial = database.prepare('SELECT id, amount FROM synthetic_gate ORDER BY id').all();
    database.close(); database = new DatabaseSync(file);
    const reopened = database.prepare('SELECT id, amount FROM synthetic_gate ORDER BY id').all();
    database.exec('BEGIN IMMEDIATE'); writeRollback(database); database.exec('ROLLBACK');
    const rolledBack = database.prepare('SELECT id, amount FROM synthetic_gate ORDER BY id').all();
    const expected = JSON.stringify([{id:1,amount:'1000.00'},{id:2,amount:'1.25'}]);
    const passed = [initial,reopened,rolledBack].every(rows => JSON.stringify(rows) === expected);
    database.close(); database = undefined;
    process.parentPort.postMessage({ok:true,value:{startedAt,completedAt:new Date().toISOString(),passed,backend:'node:sqlite',process:'Electron utility process',versions:process.versions,initial,reopened,rolledBack,synthetic:true,scope:'Create/insert/read/reopen/rollback only; no process-kill or power-loss guarantee.'}});
  } catch (error) { try { database?.close(); } catch {} process.parentPort.postMessage({ok:false,error:{code:'SQLITE_GATE_FAILED',message:String(error.message)}}); }
});
function writeRollback(database) { database.prepare('UPDATE synthetic_gate SET amount = ? WHERE id = ?').run('999.00',1); }
