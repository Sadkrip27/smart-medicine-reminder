const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const dbPath = path.resolve(__dirname, process.env.DB_PATH || '../database/medicine.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new sqlite3.Database(dbPath);
db.serialize(() => db.run('PRAGMA foreign_keys = ON'));
const run = (sql, params=[]) => new Promise((resolve,reject)=>db.run(sql,params,function(err){err?reject(err):resolve({id:this.lastID,changes:this.changes})}));
const get = (sql, params=[]) => new Promise((resolve,reject)=>db.get(sql,params,(err,row)=>err?reject(err):resolve(row)));
const all = (sql, params=[]) => new Promise((resolve,reject)=>db.all(sql,params,(err,rows)=>err?reject(err):resolve(rows)));
async function init(){ const schema=fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'); await run('BEGIN'); try { for(const statement of schema.split(';').map(s=>s.trim()).filter(Boolean)) await run(statement); await run('COMMIT'); } catch(e){ await run('ROLLBACK'); throw e; } }
module.exports={db,dbPath,run,get,all,init};
