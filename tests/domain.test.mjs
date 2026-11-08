import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
const source=(await readFile('assets/js/home-data.js','utf8')).replace("import { getSupabaseClient, getBeijingDate } from './supabase.js';", "const getBeijingDate=()=> '2026-11-08'; const getSupabaseClient=()=>null;");
const {appointmentSummary,togetherDays}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('date-only appointment survives the entire Beijing calendar day',()=>{
 assert.equal(appointmentSummary({date:'2026-11-08'}).active,true);
 assert.equal(appointmentSummary({date:'2026-11-08'}).text,'今天 见');
 assert.equal(appointmentSummary({date:'2026-11-07'}).active,false);
});
test('future dates include month/day and optional clock time',()=>{
 assert.match(appointmentSummary({date:'2026-11-14',time:'16:30:00'}).text,/11月14日 周六 16:30 见/);
 assert.equal(appointmentSummary({date:null}).day,'?');
});

test('together counter follows Beijing date and advances across months and years',()=>{
 assert.equal(togetherDays('2026-11-08'),231);
 assert.equal(togetherDays('2026-11-09'),232);
 assert.equal(togetherDays('2026-12-01'),254);
 assert.equal(togetherDays('2027-01-01'),285);
 assert.equal(togetherDays('2026-03-23'),1);
});
