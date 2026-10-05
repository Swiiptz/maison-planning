import test from 'node:test';
import assert from 'node:assert/strict';
import { householdStatistics } from '../app/domain/statistics.js';
import { occurrenceId } from '../app/domain/planning.js';

const fixture = () => ({schemaVersion:1,revision:0,household:{id:'h',name:'Maison'},members:[{id:'alice',name:'Alice'},{id:'bob',name:'Bob'}],groups:[{id:'kitchen',name:'Cuisine',color:'#123456'}],sessions:[],tasks:[{id:'clean',title:'Nettoyer',groupId:'kitchen',memberId:'alice',anchor:'2026-10-01',recurrence:'daily',estimatedMinutes:10}],overrides:{}});
const options={start:'2026-10-01',end:'2026-10-07',now:'2026-10-07'};
function complete(state,scheduledDate,completedDate,actor='alice',taskId='clean',extra={}) {
  const id=occurrenceId(taskId,scheduledDate);
  state.overrides[id]={id,taskId,scheduledDate,date:scheduledDate,memberId:'alice',status:'done',completedBy:actor,completedAt:`${completedDate}T12:00:00`,...extra};
}

test('statistics distinguish actual completion actor and date from assignment and due date',()=>{
  const state=fixture();complete(state,'2026-10-01','2026-10-02','bob');complete(state,'2026-10-03','2026-10-03');
  const original=structuredClone(state),stats=householdStatistics(state,options);
  assert.equal(stats.completed,2);assert.equal(stats.minutes,20);
  assert.equal(stats.planned,7);assert.equal(stats.scheduledDone,2);assert.equal(stats.pending,5);assert.equal(stats.overdue,4);
  assert.equal(stats.progress,29);assert.equal(stats.late,1);assert.equal(stats.onTime,1);assert.equal(stats.averageDelay,1);
  assert.equal(stats.byMember.find(row=>row.id==='bob').count,1);
  const personal=householdStatistics(state,{...options,memberId:'bob'});
  assert.equal(personal.completed,1);assert.equal(personal.planned,0);
  assert.equal(stats.heatmap.find(day=>day.date==='2026-10-01').count,0);
  assert.equal(stats.heatmap.find(day=>day.date==='2026-10-02').count,1);
  assert.deepEqual(state,original);
});

test('unknown durations and dates are not invented and unknown authors remain unassigned',()=>{
  const state=fixture();delete state.tasks[0].estimatedMinutes;
  complete(state,'2026-10-01','2026-10-01');
  delete state.overrides['clean@2026-10-01'].completedAt;delete state.overrides['clean@2026-10-01'].completedBy;
  const stats=householdStatistics(state,options);
  assert.equal(stats.completed,1);assert.equal(stats.minutes,0);assert.equal(stats.missing,1);assert.equal(stats.unknownActor,1);assert.equal(stats.datesEstimated,1);
  assert.equal(stats.timingKnown,0);assert.equal(stats.onTime,0);assert.equal(stats.byMember[0].id,'');
  state.overrides['clean@2026-10-01'].completedAt='invalid';assert.equal(householdStatistics(state,options).datesEstimated,1);
});

test('merged occurrences are excluded and timing follows the rescheduled due date',()=>{
  const state=fixture();complete(state,'2026-10-01','2026-10-04','alice','clean',{date:'2026-10-04'});
  complete(state,'2026-10-02','2026-10-04','alice','clean',{mergedInto:'clean@2026-10-01'});
  const stats=householdStatistics(state,options);
  assert.equal(stats.completed,1);assert.equal(stats.onTime,1);assert.equal(stats.late,0);assert.equal(stats.moved,1);assert.equal(stats.merged,1);
});

test('series are aggregated across archived definitions and unchecking removes the completion',()=>{
  const state=fixture();state.tasks[0].until='2026-10-02';state.tasks[0].archived=true;
  state.tasks.push({...state.tasks[0],id:'new',seriesId:'clean',title:'Nouvelle version',anchor:'2026-10-03',until:null,archived:false,estimatedMinutes:20});
  complete(state,'2026-10-01','2026-10-01');complete(state,'2026-10-03','2026-10-03','bob','new');
  const stats=householdStatistics(state,options);
  assert.equal(stats.byTask.length,1);assert.equal(stats.byTask[0].count,2);assert.equal(stats.byTask[0].minutes,30);assert.equal(stats.byTask[0].title,'Nouvelle version');
  state.overrides['new@2026-10-03'].status='todo';assert.equal(householdStatistics(state,options).completed,1);
});

test('activity streaks, weekday totals and filters use actual completion dates',()=>{
  const state=fixture();for(const date of ['2026-10-01','2026-10-02','2026-10-03','2026-10-06'])complete(state,date,date);
  const stats=householdStatistics(state,options);
  assert.equal(stats.bestStreak,3);assert.equal(stats.currentStreak,1);assert.equal(stats.activeDays,4);
  assert.equal(stats.weekdays.reduce((sum,day)=>sum+day.count,0),4);
  assert.equal(householdStatistics(state,{...options,groupId:'other'}).completed,0);
  assert.equal(householdStatistics(state,{...options,frequency:'weekly'}).completed,0);
});

test('all-history includes old validations while the planned range remains explicitly bounded',()=>{
  const state=fixture();state.tasks[0].anchor='2025-01-01';complete(state,'2025-01-01','2025-01-01');complete(state,'2026-10-01','2026-10-01');
  const stats=householdStatistics(state,{...options,allHistory:true});
  assert.equal(stats.completed,2);assert.equal(stats.planned,7);assert.ok(stats.heatmap.length<=91);
  assert.throws(()=>householdStatistics(state,{...options,start:'2024-01-01'}),/moins d’un an/);
});
