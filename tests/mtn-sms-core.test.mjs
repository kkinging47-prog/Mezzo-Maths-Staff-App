import assert from 'node:assert/strict'
import {normalizeGhanaPhone,previewSms,messageSize,buildMtnPayload,obtainMtnToken} from '../src/lib/mtnSmsCore.js'
for(const n of ['0241234567','+233241234567','00233241234567','233 24 123 4567'])assert.equal(normalizeGhanaPhone(n),'233241234567')
for(const n of ['','+234241234567','024123456','233041234567','241234567','024<script>'])assert.throws(()=>normalizeGhanaPhone(n))
assert.equal(messageSize('a'.repeat(160)).segments,1);assert.equal(messageSize('a'.repeat(161)).segments,2)
assert.equal(messageSize('^'.repeat(81)).segments,2);assert.equal(messageSize('😀'.repeat(36)).segments,2)
let p=previewSms({message:'Hello',recipients:'0241234567,+233241234567,wrong'});assert.equal(p.duplicates,1);assert.equal(p.invalid.length,1);assert.equal(p.totalSegments,1);assert.equal(p.sent,false)
assert.throws(()=>previewSms({message:' ',recipients:'0241234567'}));assert.throws(()=>previewSms({message:'hello',recipients:Array(1001).fill('0241234567').join(',')}))
assert.throws(()=>buildMtnPayload(p,'MezzoMaths','','id'));p=previewSms({message:'Hello',recipients:'0241234567'})
assert.deepEqual(buildMtnPayload(p,'MezzoMaths','MezzoMaths','test-id'),{message:'Hello',serviceCode:'MezzoMaths',senderAddress:'MezzoMaths',receiverAddress:['233241234567'],clientCorrelatorId:'test-id',requestDeliveryReceipt:false})
let calls=0;const fetcher=async(url,options)=>{calls++;assert.equal(url,'https://api.mtn.com/v1/oauth/access_token/accesstoken?grant_type=client_credentials');assert.equal(options.body.get('client_id'),'test-key');assert.equal(options.body.get('client_secret'),'test-secret');return new Response(JSON.stringify({access_token:'mock-token'}))}
assert.equal(await obtainMtnToken('test-key','test-secret',fetcher),'mock-token');assert.equal(calls,1)
await assert.rejects(()=>obtainMtnToken('','',fetcher));assert.equal(calls,1)
await assert.rejects(()=>obtainMtnToken('x','y',async()=>new Response('{}',{status:401})))
await assert.rejects(()=>obtainMtnToken('x','y',async()=>new Response('{}')))
console.log('MTN SMS: normalisation, validation, segment billing estimates, payload and mocked OAuth tests passed; no SMS sent.')
