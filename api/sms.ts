import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import { previewSms, buildMtnPayload, obtainMtnToken } from '../src/lib/mtnSmsCore.js';

export function createSmsHandler({env=process.env,makeClient=createClient,fetcher=fetch}={}) {
 return async function handler(req:any,res:any){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed.'})}
  const url=env.SUPABASE_URL||env.VITE_SUPABASE_URL,key=env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return res.status(503).json({error:'The staff server database connection is not configured.'});
  try{
   const token=String(req.headers.authorization||'').replace(/^Bearer /i,'');
   if(!token)return res.status(401).json({error:'Sign in as an administrator.'});
   const db=makeClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
   const {data:auth,error:authError}=await db.auth.getUser(token);
   if(authError||!auth?.user)return res.status(401).json({error:'Your session expired. Sign in again.'});
   const {data:profile,error:profileError}=await db.from('profiles').select('id,role,status').eq('id',auth.user.id).single();
   if(profileError||profile?.role!=='admin'||profile.status!=='active')return res.status(403).json({error:'Only active administrators can use bulk SMS.'});
   if(typeof req.body==='string'&&req.body.length>40000)return res.status(413).json({error:'Request too large.'});
   const input=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
   if(JSON.stringify(input).length>40000)return res.status(413).json({error:'Request too large.'});
   const configured=Boolean(env.MTN_SMS_CONSUMER_KEY&&env.MTN_SMS_CONSUMER_SECRET&&env.MTN_SMS_SERVICE_CODE);
   const enabled=env.MTN_SMS_ENABLED==='true';
   if(input.action==='status'){
    const {error}=await db.from('sms_campaigns').select('id').limit(0);
    return res.json({configured,enabled:configured&&enabled&&!error,journalReady:!error,sender:env.MTN_SMS_SENDER_ADDRESS||env.MTN_SMS_SERVICE_CODE||'',account:'MTN Developer / approved Ghana SMS v3 application'});
   }
   if(input.action==='check'){
    if(!configured)return res.status(409).json({error:'MTN application credentials and approved sender/service code are not configured on the staff server.'});
    try{await obtainMtnToken(env.MTN_SMS_CONSUMER_KEY,env.MTN_SMS_CONSUMER_SECRET,fetcher);return res.json({message:'MTN authentication succeeded. No SMS sent. Ghana entitlement, sender approval, coverage and billing still require MTN confirmation.'})}catch{return res.status(502).json({error:'MTN authentication failed. Confirm the Ghana application credentials and OAuth endpoint with MTN.'})}
   }
   if(input.action==='contacts'){
    const {data,error}=await db.from('profiles').select('full_name,phone').eq('status','active').order('full_name').limit(1000);
    if(error)throw Error('Staff contacts could not be loaded.');return res.json({contacts:data||[]});
   }
   if(input.action==='history'){
    const {data,error}=await db.from('sms_campaigns').select('id,title,created_at,recipient_count,total_segments').order('created_at',{ascending:false}).limit(20);
    if(error)throw Error('SMS journal is not installed. Complete the database setup first.');return res.json({campaigns:data||[]});
   }
   const uuid=(s:any)=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
   if(input.action==='prepare'){
    if(input.consent!==true)return res.status(400).json({error:'Confirm permission to message these recipients.'});
    if(!uuid(input.requestId))return res.status(400).json({error:'Invalid campaign reference.'});
    let p;try{p=previewSms(input)}catch(e){return res.status(400).json({error:e.message})}
    if(p.invalid.length||!p.recipients.length)return res.status(400).json({error:'Correct all invalid recipient numbers before preparing.'});
    const hash=createHash('sha256').update(JSON.stringify([auth.user.id,p.message,p.recipients])).digest('hex');
    const values={id:input.requestId,created_by:auth.user.id,title:String(input.title||'SMS campaign').slice(0,100),message:p.message,recipients:p.recipients,recipient_count:p.recipients.length,total_segments:p.totalSegments,content_hash:hash};
    const {error}=await db.from('sms_campaigns').insert(values);
    if(error){if(error.code!=='23505')throw Error('Could not prepare campaign. Check SMS database setup.');const prior=await db.from('sms_campaigns').select('content_hash').eq('id',input.requestId).single();if(prior.data?.content_hash!==hash)return res.status(409).json({error:'Campaign reference already used. Preview again.'});}
    return res.json({id:input.requestId,recipients:p.recipients.length,totalSegments:p.totalSegments,batches:Math.ceil(p.recipients.length/25),sent:false});
   }
   if(input.action==='campaign'||input.action==='send_batch'){
    if(!uuid(input.id))return res.status(400).json({error:'Invalid campaign.'});
    const campaign=await db.from('sms_campaigns').select('*').eq('id',input.id).single();if(campaign.error||!campaign.data)return res.status(404).json({error:'Campaign unavailable.'});
    const c=campaign.data;
    if(input.action==='campaign'){const batches=await db.from('sms_batches').select('batch_index,status,recipient_count,created_at').eq('campaign_id',c.id).order('batch_index');if(batches.error)throw Error('Could not read campaign status.');return res.json({id:c.id,title:c.title,recipient_count:c.recipient_count,totalSegments:c.total_segments,message:c.message,batchCount:Math.ceil(c.recipients.length/25),batches:batches.data||[]})}
    if(!configured||!enabled)return res.status(409).json({error:'Live SMS is disabled. Complete MTN approval, server credentials and activation first.'});
    if(input.confirm!==true)return res.status(400).json({error:'Explicit sending confirmation is required.'});
    const index=input.batchIndex,total=Math.ceil(c.recipients.length/25);
    if(!Number.isInteger(index)||index<0||index>=total)return res.status(400).json({error:'Invalid batch.'});
    const recipients=c.recipients.slice(index*25,index*25+25),id=randomUUID();
    // Durable unique claim BEFORE contacting MTN. Replays never resend this batch,
    // including ambiguous timeouts or a crash after provider acceptance.
    const claim=await db.from('sms_batches').insert({id,campaign_id:c.id,batch_index:index,status:'processing',recipient_count:recipients.length});
    if(claim.error){if(claim.error.code==='23505'){const prior=await db.from('sms_batches').select('status').eq('campaign_id',c.id).eq('batch_index',index).single();return res.json({status:prior.data?.status||'unknown',duplicate:true})}throw Error('Could not reserve the sending batch. Nothing sent.');}
    let status='unknown';
    try{
     const token=await obtainMtnToken(env.MTN_SMS_CONSUMER_KEY,env.MTN_SMS_CONSUMER_SECRET,fetcher);
     const p=previewSms({message:c.message,recipients:recipients.join(',')});
     const response=await fetcher('https://api.mtn.com/v3/sms/messages/sms/outbound',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(buildMtnPayload(p,env.MTN_SMS_SERVICE_CODE,env.MTN_SMS_SENDER_ADDRESS,id)),signal:AbortSignal.timeout(15000)});
     const body=await response.json();
     // Provider acceptance is not delivery. Do not expose provider bodies/tokens.
     status=response.ok&&String(body.statusCode)==='0000'?'accepted':response.status>=500?'unknown':'rejected';
    }catch{status='unknown'}
    const saved=await db.from('sms_batches').update({status}).eq('id',id);
    return res.json({status:saved.error?'unknown':status,duplicate:false,message:status==='accepted'?'MTN accepted this batch; delivery is not yet confirmed.':'Batch needs review. Do not create a duplicate campaign to retry it.'});
   }
   return res.status(400).json({error:'Unknown SMS action.'});
  }catch{return res.status(503).json({error:'SMS request could not be completed. Check campaign status before retrying any send.'})}
 }
}
export default createSmsHandler();
