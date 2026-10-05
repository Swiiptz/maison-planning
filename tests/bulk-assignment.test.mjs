import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {seedState} from '../app/services/seed.js';
import {occurrences,validateState} from '../app/domain/planning.js';
import {createPlanningService} from '../app/services/planning-service.js';
import {createDemoAdapter} from '../app/adapters/demo.js';
const catalog=JSON.parse(await readFile(new URL('../app/data/catalog.json',import.meta.url)));
const fixture=()=>({schemaVersion:1,revision:0,household:{id:'house',name:'M&Ms'},members:[{id:'a',name:'Alice'},{id:'b',name:'Bob'}],groups:[{id:'kitchen',name:'Cuisine',color:'#996633'}],sessions:[],overrides:{},tasks:Array.from({length:40},(_,i)=>({id:`task-${i}`,title:`Tâche ${i}`,groupId:'kitchen',memberId:'a',recurrence:'daily',anchor:'2026-10-01'}))});
async function serviceFor(state){const storage=new Map();const service=createPlanningService(createDemoAdapter(state,{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}),'a');await service.load();return service;}
test('new families start empty, with a real member and no automatically assigned tasks',()=>{
 const state=seedState(catalog,{memberName:'Alice',memberId:'a'});validateState(state);
 assert.equal(state.tasks.length,0);assert.equal(state.sessions.length,0);assert.equal(state.members[0].id,'a');
 const legacy=seedState(catalog,{empty:false,memberId:'a'});assert.ok(legacy.tasks.length);assert.ok(legacy.tasks.every(task=>task.memberId===''));
});
test('a full month can be unassigned without generating a document per occurrence and undo restores it',async()=>{
 const initial=fixture(),service=await serviceFor(initial);
 const updated=await service.clearAssignments({start:'2026-10-01',end:'2026-10-31'},0);
 const items=occurrences(updated,'2026-10-01','2026-10-31');assert.equal(items.length,1240);assert.ok(items.every(item=>item.memberId===''));assert.equal(Object.keys(updated.overrides).length,0);
 assert.ok(occurrences(updated,'2026-11-01','2026-11-01').every(item=>item.memberId==='a'));assert.equal(updated.tasks.length,40);
 await service.restoreAssignments(initial,updated.revision);assert.ok(occurrences(await service.load(),'2026-10-01','2026-10-31').every(item=>item.memberId==='a'));
});
test('period clearing respects member filters, reports and completed history',async()=>{
 const initial=fixture();initial.tasks=initial.tasks.slice(0,2);initial.tasks[1].memberId='b';
 initial.overrides['task-0@2026-10-01']={id:'task-0@2026-10-01',taskId:'task-0',scheduledDate:'2026-10-01',date:'2026-10-01',status:'done',memberId:'a',completedBy:'b',completedAt:'2026-10-01T12:00:00Z'};
 initial.overrides['task-0@2026-10-02']={id:'task-0@2026-10-02',taskId:'task-0',scheduledDate:'2026-10-02',date:'2026-10-04',status:'todo',memberId:'b'};
 const service=await serviceFor(initial),updated=await service.clearAssignments({start:'2026-10-01',end:'2026-10-05',memberId:'a'},0);
 assert.deepEqual(updated.overrides['task-0@2026-10-01'],initial.overrides['task-0@2026-10-01']);
 assert.equal(updated.overrides['task-0@2026-10-02'].memberId,'b');
 assert.ok(occurrences(updated,'2026-10-01','2026-10-05').filter(item=>item.taskId==='task-1').every(item=>item.memberId==='b'));
 await assert.rejects(service.clearAssignments({start:'2026-10-01',end:'2026-10-05'},0),/changé/);
});
test('catalogue clearing keeps sessions, tasks, recurrence and actual completion authors',async()=>{
 const initial=fixture();initial.tasks=initial.tasks.slice(0,1);initial.sessions=[{id:'session',title:'Cuisine',groupId:'kitchen',taskIds:['task-0'],enabled:true}];
 initial.overrides['task-0@2026-10-01']={id:'task-0@2026-10-01',taskId:'task-0',scheduledDate:'2026-10-01',date:'2026-10-01',status:'done',memberId:'a',completedBy:'b'};
 const service=await serviceFor(initial),updated=await service.clearAssignments({taskIds:['task-0']},0);
 assert.equal(updated.tasks[0].memberId,'');assert.equal(updated.tasks[0].recurrence,'daily');assert.deepEqual(updated.sessions,initial.sessions);assert.deepEqual(updated.overrides,initial.overrides);
});
test('catalogue duration proposals cover every original task and only fill missing estimates',async()=>{
 assert.equal(catalog.tasks.length,187);assert.ok(catalog.tasks.every(task=>Number.isInteger(task.estimatedMinutes)&&task.estimatedMinutes>0));
 assert.equal(catalog.tasks.find(task=>task.id==='source-167').estimatedMinutes,5);
 assert.ok(catalog.tasks.find(task=>task.id==='source-161').estimatedMinutes>catalog.tasks.find(task=>task.id==='source-184').estimatedMinutes);
 const initial=fixture();initial.tasks=initial.tasks.slice(0,2);initial.tasks[0].estimatedMinutes=17;
 const service=await serviceFor(initial),updated=await service.applyDurationSuggestions([{taskId:'task-0',minutes:5},{taskId:'task-1',minutes:10}],0);
 assert.equal(updated.tasks[0].estimatedMinutes,17);assert.equal(updated.tasks[1].estimatedMinutes,10);assert.equal(updated.tasks[1].estimatedMinutesSource,'proposal-active-time');
 await assert.rejects(service.applyDurationSuggestions([{taskId:'task-1',minutes:7}],0),/changé/);
});

test('removing a day occurrence preserves its series, other days and supports restoration',async()=>{
 const initial=fixture();initial.tasks=initial.tasks.slice(0,1);
 const service=await serviceFor(initial),item=occurrences(initial,'2026-10-05','2026-10-05')[0];
 const updated=await service.removeOccurrence(item,0);
 assert.equal(occurrences(updated,'2026-10-05','2026-10-05').length,0);
 assert.equal(occurrences(updated,'2026-10-06','2026-10-06').length,1);
 assert.deepEqual(updated.tasks,initial.tasks);assert.equal(updated.overrides[item.id].skipped,true);
 await assert.rejects(service.update([item],{status:'done'}),/retirée/);
 await service.restoreMove(initial.overrides,updated.revision);
 assert.equal(occurrences(await service.load(),'2026-10-05','2026-10-05').length,1);
});
test('removing a reported occurrence affects its displayed day and preserves completed history',async()=>{
 const initial=fixture();initial.tasks=initial.tasks.slice(0,1);
 const reported={id:'task-0@2026-10-02',taskId:'task-0',scheduledDate:'2026-10-02',date:'2026-10-05',memberId:'a',status:'todo'};
 initial.overrides[reported.id]=reported;
 const service=await serviceFor(initial),item=occurrences(initial,'2026-10-05','2026-10-05').find(item=>item.id===reported.id);
 await service.removeOccurrence(item,0);let updated=await service.load();
 assert.equal(occurrences(updated,'2026-10-02','2026-10-02').length,0);
 assert.deepEqual(occurrences(updated,'2026-10-05','2026-10-05').map(item=>item.id),['task-0@2026-10-05']);
 const done=occurrences(updated,'2026-10-06','2026-10-06')[0];await service.update([done],{status:'done'});updated=await service.load();
 await assert.rejects(service.removeOccurrence({...done,status:'done'},updated.revision),/réalisée/);
 assert.equal((await service.load()).overrides[done.id].completedBy,'a');
 await assert.rejects(service.removeOccurrence(done,0),/changé/);
});
