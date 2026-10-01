import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { PgDialect } from 'drizzle-orm/pg-core';
import assert from 'node:assert/strict';
import { performanceGoalUpsertSql } from '../src/lib/performance-goal-upsert';
import type { GoalInput } from '../src/lib/performance-goals';
const state=JSON.parse(readFileSync('/workspace/tmp/kpi-membership-release.json','utf8'));
const dialect=new PgDialect();
const goal:GoalInput={metric:'active_memberships',scope:'company',scopeValue:null,effectiveFrom:'2026-10-01',effectiveTo:'2026-10-31',targetValue:500,unit:'count'};
// Each transaction creates a SESSION-LOCAL shadow table. No public data or public sequences touched.
async function main() {
for(const [name,p] of Object.entries(state.projects) as [string,any][]){const sql=neon(p.env.DATABASE_URL);const q=(x:GoalInput)=>{const v=dialect.sqlToQuery(performanceGoalUpsertSql(x));return sql.query(v.sql,v.params);};
 const results=await sql.transaction([
 sql.query(`CREATE TEMP TABLE targets (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,metric text,scope text,scope_value text,effective_from date,effective_to date,target_value bigint,unit text,notes text,updated_at timestamp DEFAULT now()) ON COMMIT DROP`),
 q(goal),q({...goal,targetValue:600}),q({...goal,effectiveFrom:'2026-10-15',effectiveTo:'2026-11-15'}),q({...goal,id:1,targetValue:700}),
 sql.query(`INSERT INTO targets (metric,scope,scope_value,effective_from,effective_to,target_value,unit) VALUES ('revenue','department','hvac','2026-10-01','2026-10-31',9900,'cents') RETURNING id`),
 q({...goal,id:2,targetValue:1,effectiveFrom:'2026-11-01',effectiveTo:'2026-11-30'}),sql.query('SELECT id,metric,scope,target_value FROM targets ORDER BY id'),
 sql.query('DELETE FROM targets WHERE id=1 RETURNING id'),sql.query('SELECT count(*) FROM targets')]);
 assert.equal(results[1][0].action,'inserted');assert.equal(results[2][0].action,'updated');assert.equal(results[3][0].action,'conflict');assert.equal(results[4][0].action,'updated');assert.equal(results[6][0].action,'not_found');assert.equal(Number(results[7][0].target_value),700);assert.equal(Number(results[7][1].target_value),9900);assert.equal(Number(results[9][0].count),1);console.log(JSON.stringify({tenant:name,checks:8,temporaryTableOnly:true,result:'PASS'}));}

}
main().catch(e=>{console.error(e.message);process.exit(1);});
