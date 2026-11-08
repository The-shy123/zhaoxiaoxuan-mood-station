import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {transform} from 'esbuild';
import test from 'node:test';
import assert from 'node:assert/strict';

async function accountHandler({existing=false,insertError=false}={}) {
  const calls=[];
  const members=existing?{xiaoxuan:{user_id:'baby'}}:{};
  members.zhang={user_id:'admin'};
  const client={from:()=>({select(){return this;},eq(k,v){this.profile=v;return this;},async maybeSingle(){return{data:members[this.profile]||null};},async insert(row){calls.push(['member',row]);if(insertError)return{error:new Error('insert failed')};members[row.profile]={user_id:row.user_id};return{};}}),auth:{admin:{async createUser(input){calls.push(['create',input]);return{data:{user:{id:'baby'}}};},async deleteUser(id){calls.push(['rollback',id]);return{};},async getUserById(id){return{data:{user:{email:id+'@test.invalid'}}};}},async signInWithPassword(input){if(input.password==='wrong')return{data:{},error:new Error('invalid')};return{data:{session:{access_token:'verified-access',refresh_token:'verified-refresh'}}};}}};
  let handler;
  const source=(await readFile('supabase/functions/home-account/index.ts','utf8')).replace(/^import .*;\n/gm,'');
  const {code}=await transform(source,{loader:'ts',format:'iife',target:'es2022'});
  vm.runInNewContext(code,{Request,Response,console,Deno:{serve:fn=>handler=fn},createServerClient:()=>client,verifyAccessToken:async t=>t==='secret-setup-link',isOriginAllowed:()=>true,preflightResponse:()=>new Response('ok'),requirePost:r=>r.method==='POST'?null:new Response('',{status:405}),jsonResponse:(_r,data,status=200)=>Response.json(data,{status})});
  return {calls,run:body=>handler(new Request('https://qa.test',{method:'POST',body:JSON.stringify(body)}))};
}
test('login returns only session credentials, existing passwords are not reset',async()=>{const {run,calls}=await accountHandler();const r=await run({action:'login',profile:'zhang',password:'correct'});assert.equal(r.status,200);assert.deepEqual(Object.keys(await r.json()).sort(),['access_token','refresh_token']);assert.equal(calls.length,0);});
test('invalid password and unknown profile cannot log in',async()=>{const {run}=await accountHandler();assert.equal((await run({action:'login',profile:'zhang',password:'wrong'})).status,401);assert.equal((await run({action:'login',profile:'outsider',password:'correct'})).status,400);});
test('setup requires original secret and cannot change Zhang account',async()=>{const {run,calls}=await accountHandler();assert.equal((await run({action:'setup',profile:'xiaoxuan',password:'long-password'})).status,403);assert.equal((await run({action:'setup',profile:'zhang',password:'long-password',token:'secret-setup-link'})).status,403);assert.equal(calls.length,0);});
test('setup cannot overwrite an existing Xiaoxuan account',async()=>{const {run,calls}=await accountHandler({existing:true});assert.equal((await run({action:'setup',profile:'xiaoxuan',password:'long-password',token:'secret-setup-link'})).status,409);assert.equal(calls.length,0);});
test('valid setup creates membership then session',async()=>{const {run,calls}=await accountHandler();const r=await run({action:'setup',profile:'xiaoxuan',password:'long-password',token:'secret-setup-link'});assert.equal(r.status,200);assert.deepEqual(calls.map(c=>c[0]),['create','member']);});
test('failed membership creation rolls back the new account',async()=>{const {run,calls}=await accountHandler({insertError:true});const r=await run({action:'setup',profile:'xiaoxuan',password:'long-password',token:'secret-setup-link'});assert.equal(r.status,503);assert.deepEqual(calls.map(c=>c[0]),['create','member','rollback']);});
