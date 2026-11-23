# Mezzo Staff: admin-only MTN bulk SMS

Location: https://staff.mezzomaths.org/bulk-sms
Repository: kkinging47-prog/Mezzo-Maths-Staff-App

## Included

The route and navigation are admin-only. The Vercel API checks the authenticated
user against the Staff database and requires an active admin on every request.
Compose, paste numbers, add active staff contacts, import CSV/Excel (Phone/Mobile
column), validate/deduplicate up to 1,000 Ghana mobile numbers, preview segment
counts, prepare immutable campaigns, explicitly confirm sends, submit batches of
25, pause between batches and inspect the latest 20 campaigns.

Campaigns and batch claims are stored in the Staff database. A durable unique
(campaign_id,batch_index) claim prevents replay from sending a batch twice, even
if a provider timeout or interrupted function leaves the result unknown. Unknown,
processing and rejected batches must be reviewed with MTN; they are not retried.
MTN acceptance is not confirmed handset delivery. Delivery callbacks, recurring
schedules and contact subscription management are not enabled in this release.

## Activation dependencies

1. Register/sign in at https://developers.mtn.com using the business email.
2. Create a Mezzo Staff application and add SMS v3 for Ghana.
3. Obtain MTN Ghana production approval, Consumer Key/Secret, approved service code
   or alphanumeric sender value, pricing, network coverage and provisioning rules.
   A personal SIM, MoMo phone number or PIN is not an API credential.
4. Apply `supabase/update-2026-11-23-admin-bulk-sms.sql` to the STAFF database
   (the current production frontend uses project dacxvblpfywspzfemwoh).
   This is a different project from Battle Arena. It is not accessible through the
   Supabase connector in this session, so the script has NOT been applied here.
5. Set these server-only environment variables on the Staff Vercel project:
   MTN_SMS_CONSUMER_KEY, MTN_SMS_CONSUMER_SECRET, MTN_SMS_SERVICE_CODE,
   MTN_SMS_SENDER_ADDRESS (optional, approved by MTN).
   Never prefix secrets with VITE_ or save them in localStorage.
6. Redeploy and use Bulk SMS → Refresh status → Verify MTN credentials.
7. After pricing, sender approval, Ghana entitlement and coverage are confirmed,
   set MTN_SMS_ENABLED=true and redeploy. Then explicitly approve a one-number
   delivery test before a bulk campaign. A successful token check alone does not
   establish SMS delivery or available credits.

## Provider details to confirm

SMS v3 Swagger publishes OAuth token URL:
https://api.mtn.com/v1/oauth/access_token/accesstoken?grant_type=client_credentials
The general OAuth guide instead publishes:
https://api.mtn.com/v1/oauth/access_token?grant_type=client_credentials
The connector follows the product-specific Swagger. MTN must confirm the URL
for this Ghana app if authentication fails. It does not silently send credentials
to alternative endpoints.

Outbound: POST https://api.mtn.com/v3/sms/messages/sms/outbound
Required: message, serviceCode, receiverAddress[], clientCorrelatorId.
requestDeliveryReceipt is false because callback verification/subscription is not
configured yet. No delivery status is fabricated from a successful HTTP response.

Sources checked 23 November 2026:
https://developers.mtn.com/products/sms-v3-api
https://developers.mtn.com/products/sms-v3-api/download/swagger
https://developers.mtn.com/getting-started/understanding-oauth-20
https://developers.mtn.com/faq

## Checks

npm run build
node tests/mtn-sms-core.test.mjs
node tests/mtn-sms-api.test.mjs

Tests use a mock provider; they do not send real SMS or verify a real MTN account.
The campaign tables enable RLS and revoke client-role access. Only the server's
service role accesses them after checking the actual user's role and active status.
No changes were published to the Battle Arena frontend.
