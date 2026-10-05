import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
async function harness(favorite='b') {
 let households=[{householdId:'a',memberId:'alice',name:'A',canInvite:true},{householdId:'b',memberId:'bob',name:'B',canInvite:false}];
 const opened=[],disposed=[],favorites=[];
 const infrastructure={auth:{current:()=>({name:'Moi'})},listHouseholds:async()=>({households,favoriteHouseholdId:favorite}),setFavoriteHousehold:async id=>{favorite=id;favorites.push(id);},createDataAdapter:id=>({householdId:id,dispose:()=>disposed.push(id)}),createHousehold:async initial=>{households.push({householdId:initial.household.id,memberId:'me',canInvite:true});return {householdId:initial.household.id,memberId:'me'};},joinHousehold:async()=>({householdId:'a',memberId:'alice'})};
 let source=await readFile(new URL('../app/services/bootstrap.js',import.meta.url),'utf8');
 source=source.replace(/^import .*;\r?\n/gm,'').replace('export async function','async function').replace("const { createFirebaseInfrastructure } = await import('../adapters/firebase.js');",'const createFirebaseInfrastructure = async () => globalThis.infrastructure;').replaceAll('import.meta.url','"https://example.test/app/"');
 const context=vm.createContext({infrastructure,URL,config:{provider:'firebase',firebase:{}},fetch:async()=>({ok:true,json:async()=>({tasks:[]})}),seedState:()=>({household:{id:'new'},members:[{id:'me'}]}),createPlanningService:(adapter,memberId)=>{opened.push([adapter.householdId,memberId]);return {householdId:adapter.householdId};}});
 vm.runInContext(source+'\nglobalThis.factory=createRuntime;',context);
 return {runtime:await context.factory(),opened,disposed,favorites};
}
test('a favorite family opens by default and switching retains all memberships',async()=>{
 const {runtime,opened,disposed}=await harness();
 await runtime.open();assert.equal(runtime.memberId,'bob');assert.equal(runtime.permissions.canInvite,false);
 await runtime.open('a');assert.equal(runtime.memberId,'alice');assert.equal(runtime.permissions.canInvite,true);
 assert.equal(runtime.households.length,2);assert.deepEqual(opened,[['b','bob'],['a','alice']]);assert.deepEqual(disposed,['b']);
 assert.equal(await runtime.open('forbidden'),null);assert.equal(runtime.memberId,'alice');
});
test('an inaccessible favorite falls back to an authorized family',async()=>{
 const {runtime}=await harness('missing');await runtime.open();assert.equal(runtime.memberId,'alice');
});
test('creating and joining families preserve the existing favorite',async()=>{
 const {runtime,favorites}=await harness();await runtime.createHousehold('Nouvelle famille');assert.equal(runtime.memberId,'me');assert.equal(runtime.households.length,3);assert.equal(runtime.favoriteHouseholdId,'b');assert.equal(favorites.length,0);
 await runtime.joinHousehold('token');assert.equal(runtime.memberId,'alice');assert.equal(runtime.favoriteHouseholdId,'b');
 await runtime.setFavorite('a');await runtime.open();assert.equal(runtime.memberId,'alice');assert.deepEqual(favorites,['a']);
});
test('first family becomes the favorite automatically',async()=>{
 const {runtime,favorites}=await harness(null);await runtime.createHousehold('Maison');assert.deepEqual(favorites,['new']);assert.equal(runtime.favoriteHouseholdId,'new');
});
