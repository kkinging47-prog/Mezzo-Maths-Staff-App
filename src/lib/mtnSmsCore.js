// Pure request validation shared by the server and admin preview. No credentials here.
export function normalizeGhanaPhone(value) {
  let phone=String(value??'').trim().replace(/[\s().-]/g,'');
  if(phone.startsWith('+'))phone=phone.slice(1);
  if(phone.startsWith('00233'))phone=phone.slice(2);
  if(/^0\d{9}$/.test(phone))phone='233'+phone.slice(1);
  if(!/^233[235]\d{8}$/.test(phone))throw new Error('Use a Ghana mobile number, for example 0241234567 or +233241234567.');
  return phone;
}
const GSM_BASIC="@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT='\f^{}\\[~]|€';
export function messageSize(message){
  let units=0,gsm=true;
  for(const ch of message){if(GSM_BASIC.includes(ch))units++;else if(GSM_EXT.includes(ch))units+=2;else{gsm=false;break}}
  if(!gsm)units=message.length;
  const single=gsm?160:70,multi=gsm?153:67;
  return {encoding:gsm?'GSM-7':'Unicode',units,segments:units===0?0:units<=single?1:Math.ceil(units/multi)};
}
export function previewSms(input){
  if(typeof input?.message!=='string'||!input.message.trim())throw new Error('Enter a message.');
  if(input.message.length>1600)throw new Error('Keep this preview under 1,600 characters.');
  if(typeof input.recipients!=='string'||input.recipients.length>20000)throw new Error('Enter up to 1,000 phone numbers.');
  const raw=input.recipients.split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean);
  if(!raw.length||raw.length>1000)throw new Error('Preview between 1 and 1,000 phone numbers.');
  const valid=[],invalid=[];
  for(const value of raw){try{valid.push(normalizeGhanaPhone(value))}catch{invalid.push(value)}}
  const recipients=[...new Set(valid)],size=messageSize(input.message);
  return {message:input.message,recipients,invalid,duplicates:valid.length-recipients.length,...size,totalSegments:recipients.length*size.segments,sent:false};
}
export function buildMtnPayload(preview,serviceCode,senderAddress,id){
  if(!serviceCode?.trim())throw new Error('MTN-approved service code or sender value is missing.');
  if(preview.invalid.length||!preview.recipients.length)throw new Error('Correct invalid recipients first.');
  return {message:preview.message,serviceCode:serviceCode.trim(),...(senderAddress?.trim()?{senderAddress:senderAddress.trim()}:{}),receiverAddress:preview.recipients,clientCorrelatorId:id,requestDeliveryReceipt:false};
}
export async function obtainMtnToken(key,secret,fetcher=fetch){
  if(!key||!secret)throw new Error('MTN credentials are not configured.');
  // Endpoint published by the SMS v3 Swagger. MTN must confirm Ghana provisioning.
  const response=await fetcher('https://api.mtn.com/v1/oauth/access_token/accesstoken?grant_type=client_credentials',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:key,client_secret:secret}),signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error(`MTN authentication failed (HTTP ${response.status}). Check the approved app credentials with MTN.`);
  const body=await response.json();
  if(typeof body.access_token!=='string'||!body.access_token)throw new Error('MTN did not issue an access token.');
  return body.access_token;
}
