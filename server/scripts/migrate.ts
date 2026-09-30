import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '..', 'migrations');

await pool.query(`
  create table if not exists migrations (
    id integer primary key,
    applied_at timestamptz not null default now()
  );
`);

const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

for (const f of files) {
  const id = Number(f.split('_')[0]);
  const applied = (await pool.query('select 1 from migrations where id = $1', [id])).rowCount;
  if (applied && applied > 0) continue;
  const sql = fs.readFileSync(path.join(dir, f), 'utf8');
  await pool.query('begin');
  try {
    await pool.query(sql);
    await pool.query('insert into migrations (id) values ($1)', [id]);
    await pool.query('commit');
    console.log(`applied ${f}`);
  } catch (e) {
    await pool.query('rollback');
    throw e;
  }
}

await pool.end();
console.log('done');
