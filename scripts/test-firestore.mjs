import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const project = 'demo-maison-planning';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error('Tests réservés à un émulateur local.');
const base = `http://${host}/v1/projects/${project}/databases/(default)/documents`;
const prefix = 'test_' + randomUUID().replaceAll('-', '_');
const owner = `${prefix}_owner`, guest = `${prefix}_guest`, outsider = `${prefix}_outside`;
const family = `${prefix}-family`, second = `${prefix}-second`;
const email = uid => `${uid}@example.test`;
function bearer(uid, verified = true) {
 const now = Math.floor(Date.now()/1000);
 const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
 return `${encode({alg:'none',typ:'JWT'})}.${encode({sub:uid,user_id:uid,aud:project,iss:`https://securetoken.google.com/${project}`,iat:now,exp:now+3600,email:email(uid),email_verified:verified,firebase:{sign_in_provider:'google.com'}})}.`;
}
function value(v) {
 if (v instanceof Date) return {timestampValue:v.toISOString()};
 if (typeof v === 'string') return {stringValue:v};
 if (typeof v === 'number') return {integerValue:String(v)};
 return {mapValue:{fields:fields(v)}};
}
function fields(obj) {return Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,value(v)]));}
function write(path,data,mask,serverTime=false) {
 return {update:{name:`projects/${project}/databases/(default)/documents/${path}`,fields:fields(data)},...(mask?{updateMask:{fieldPaths:mask}}:{}),...(serverTime?{updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}]}:{})};
}
async function request(uid,path,body,verified=true) {
 const res=await fetch(`${base}${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${bearer(uid,verified)}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 return {status:res.status,data:await res.json()};
}
async function allow(uid,writes) {const r=await request(uid,':commit',{writes});assert.equal(r.status,200,JSON.stringify(r.data));}
async function deny(uid,writes,verified=true) {const r=await request(uid,':commit',{writes},verified);assert.equal(r.status,403,JSON.stringify(r.data));}
function creation(hid,uid,mid) {return [write(`households/${hid}`,{schemaVersion:1,revision:0,name:'Famille test',ownerUid:uid,access:{[uid]:{memberId:mid}}}),write(`households/${hid}/members/${mid}`,{id:mid,name:'Moi'}),write(`households/${hid}/accountLinks/${mid}`,{uid,memberId:mid}),write(`identities/${uid}/memberships/${hid}`,{householdId:hid,memberId:mid})];}
await allow(owner,creation(family,owner,'creator'));
await allow(guest,creation(second,guest,'creator'));
await allow(owner,[write(`households/${family}/members/invitee`,{id:'invitee',name:'Invité'})]);
assert.equal((await request(outsider,`/households/${family}`)).status,403);
assert.equal((await request(guest,`/households/${family}/members/invitee`)).status,403);
const token=`${prefix}-invite`;
const invitation={householdId:family,memberId:'invitee',email:email(guest),createdBy:owner,expiresAt:new Date(Date.now()+7*86400000)};
await allow(owner,[write(`invitations/${token}`,invitation,null,true)]);
assert.equal((await request(guest,`/invitations/${token}`)).status,200);
assert.equal((await request(outsider,`/invitations/${token}`)).status,403);
function join(uid,code=token,mid='invitee') {return [write(`households/${family}`,{access:{[uid]:{memberId:mid,invitationId:code}}},[`access.${uid}`]),write(`households/${family}/accountLinks/${mid}`,{uid,memberId:mid}),write(`identities/${uid}/memberships/${family}`,{householdId:family,memberId:mid}),write(`invitations/${code}`,{usedBy:uid},['usedBy'])];}
await deny(outsider,join(outsider));
await deny(guest,join(guest),false);
await deny(guest,join(guest).filter(w=>!w.update.name.includes('/invitations/')));
await allow(guest,join(guest));
await deny(guest,join(guest));
const duplicate = `${prefix}-duplicate`;
await deny(owner,[write(`invitations/${duplicate}`,{...invitation,email:email(outsider)},null,true)]);
assert.equal((await request(guest,`/households/${family}`)).status,200);
assert.equal((await request(guest,`/households/${second}`)).status,200);
await allow(guest,[write(`identities/${guest}`,{favoriteHouseholdId:family})]);
await allow(guest,[write(`identities/${guest}`,{favoriteHouseholdId:second},['favoriteHouseholdId'])]);
await deny(outsider,[write(`identities/${outsider}`,{favoriteHouseholdId:family})]);
await deny(guest,[write(`households/${family}/members/creator`,{id:'creator',name:'Intrus'})]);
await allow(guest,[write(`households/${family}/members/invitee`,{name:'Mon prénom'},['name'])]);
await deny(guest,[write(`identities/${owner}/memberships/${second}`,{householdId:second,memberId:'creator'})]);
await deny(guest,[write(`households/${family}`,{ownerUid:guest},['ownerUid'])]);
// Expired invitations must be rejected even with an otherwise valid atomic join.
const expired=`${prefix}-expired`;
await allow(owner,[write(`households/${family}/members/late`,{id:'late',name:'Tardif'})]);
await allow(owner,[write(`invitations/${expired}`,{...invitation,email:email(outsider),memberId:'late',expiresAt:new Date(Date.now()+1500)},null,true)]);
await new Promise(resolve=>setTimeout(resolve,2000));
await deny(outsider,join(outsider,expired,'late'));
console.log('Règles Firestore : création, isolation, multi-famille, favorite, invitations atomiques/expirantes et droits validés.');
