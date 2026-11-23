import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import {createHash,randomUUID} from 'node:crypto';
import {previewSms,buildMtnPayload,obtainMtnToken} from '../src/lib/mtnSmsCore.js';
let role='admin',user=true,status='active',outboundCalls=0,providerStatus=200;
const campaigns=[],batches=[];
class Query{
 constructor(table){this.table=table;this.filters=[];this.action='select'}
 select(){return this}eq(k,v){this.filters.push([k,v]);return this}limit(){return this}order(){return this}single(){this.singleResult=true;return this}insert(v){this.action='insert';this.value=v;return this}update(v){this.action='update';this.value=v;return this}
 then(resolve,reject){try{let rows=this.table==='profiles'?[{id:'admin',role,status}]:this.table==='sms_campaigns'?campaigns:batches;let selected=rows.filter(r=>this.filters.every(([k,v])=>r[k]===v));let error=null;
 if(this.action==='insert'){const duplicate=rows.some(r=>r.id===this.value.id||(this.table==='sms_batches'&&r.campaign_id===this.value.campaign_id&&r.batch_index===this.value.batch_index));if(duplicate)error={code:'23505'};else rows.push({...this.value})}
 if(this.action==='update')selected.forEach(r=>Object.assign(r,this.value));resolve({data:this.singleResult?selected[0]:selected,error});}catch(e){reject(e)}}
}
const makeClient=()=>({auth:{getUser:async()=>({data:{user:user?{id:'admin'}:null},error:null})},from:t=>new Query(t)});
const env={SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'dummy',MTN_SMS_CONSUMER_KEY:'dummy',MTN_SMS_CONSUMER_SECRET:'dummy',MTN_SMS_SERVICE_CODE:'MezzoMaths',MTN_SMS_ENABLED:'false'};
const fetcher=async(url,options)=>{if(url.includes('/oauth/'))return new Response(JSON.stringify({access_token:'test-token'}));outboundCalls++;assert.equal(url,'https://api.mtn.com/v3/sms/messages/sms/outbound');const p=JSON.parse(options.body);assert(p.receiverAddress.length<=25);assert.equal(p.requestDeliveryReceipt,false);return new Response(JSON.stringify({statusCode:providerStatus===200?'0000':'5000'}),{status:providerStatus})};
let source=await readFile(new URL('../api/sms.ts',import.meta.url),'utf8');source=source.replace(/^import .*\n/gm,'').replace('export function createSmsHandler','function createSmsHandler').replace('export default createSmsHandler();','');const js=(await transform(source,{loader:'ts',format:'esm'})).code;
const factory=new Function('createClient','createHash','randomUUID','previewSms','buildMtnPayload','obtainMtnToken',js+';return createSmsHandler') (makeClient,createHash,randomUUID,previewSms,buildMtnPayload,obtainMtnToken);
const handler=factory({env,makeClient,fetcher});
async function call(action,extra={},auth=true){const res={code:200,setHeader(){},status(n){this.code=n;return this},json(body){this.body=body;return this}};await handler({method:'POST',headers:auth?{authorization:'Bearer test'}:{},body:{action,...extra}},res);return res}
assert.equal((await call('status',{},false)).code,401);user=false;assert.equal((await call('status')).code,401);user=true;role='staff';assert.equal((await call('status')).code,403);role='admin';status='left';assert.equal((await call('status')).code,403);status='active';
const id=randomUUID();assert.equal((await call('prepare',{message:'Hi',recipients:'0241234567',requestId:id})).code,400);
assert.equal((await call('prepare',{message:'Hi',recipients:'wrong',requestId:id,consent:true})).code,400);
let prepared=await call('prepare',{message:'Hi',recipients:'0241234567,+233241234567',requestId:id,consent:true});assert.equal(prepared.body.recipients,1);assert.equal(prepared.body.sent,false);
await call('prepare',{message:'Hi',recipients:'0241234567',requestId:id,consent:true});assert.equal(campaigns.length,1);
assert.equal((await call('prepare',{message:'Different',recipients:'0241234567',requestId:id,consent:true})).code,409);
assert.equal((await call('send_batch',{id,batchIndex:0,confirm:true})).code,409);assert.equal(outboundCalls,0);
env.MTN_SMS_ENABLED='true';assert.equal((await call('send_batch',{id,batchIndex:0})).code,400);assert.equal(outboundCalls,0);
assert.equal((await call('send_batch',{id,batchIndex:0,confirm:true})).body.status,'accepted');assert.equal(outboundCalls,1);
assert.equal((await call('send_batch',{id,batchIndex:0,confirm:true})).body.duplicate,true);assert.equal(outboundCalls,1);
const id2=randomUUID();await call('prepare',{message:'Hi',recipients:'0241234567',requestId:id2,consent:true});providerStatus=500;assert.equal((await call('send_batch',{id:id2,batchIndex:0,confirm:true})).body.status,'unknown');await call('send_batch',{id:id2,batchIndex:0,confirm:true});assert.equal(outboundCalls,2);
console.log('Staff SMS API: auth/active-admin guards, consent, campaign idempotency, disabled mode, confirmed sends, batch replay and ambiguous failure protection passed (mock MTN only).');
