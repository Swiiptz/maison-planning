import { addDays, daysBetween, datesBetween, parseDate, weekStart } from './dates.js';
import { occurrences } from './planning.js';

function completionDay(item) {
  if (item.completedAt && Number.isFinite(new Date(item.completedAt).getTime())) {
    const value = new Date(item.completedAt);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return item.date;
}

// Derived, provider-independent statistics. No analytics events or fake history.
export function householdStatistics(state, {start, end, now, allHistory = false, memberId = '', groupId = '', frequency = ''}) {
  parseDate(start); parseDate(end); parseDate(now);
  if (end < start || daysBetween(start,end)>365) throw new Error('Choisis une période de statistiques de moins d’un an.');
  const tasks = new Map(state.tasks.map(task => [task.id,task]));
  const taskMatches = task => (!groupId || task.groupId===groupId) && (!frequency || task.recurrence===frequency);
  const history = Object.values(state.overrides).filter(item => item.status==='done' && !item.mergedInto && tasks.has(item.taskId)).map(item => {
    const task=tasks.get(item.taskId), completedDate=completionDay(item);
    return {...item,task,completedDate,approximateDate:!item.completedAt || !Number.isFinite(new Date(item.completedAt).getTime()),actorId:item.completedBy || '',minutes:task.estimatedMinutes || 0,lateDays:Math.max(0,daysBetween(item.date,completedDate))};
  }).filter(item => item.completedDate<=now && (allHistory || (item.completedDate>=start && item.completedDate<=end)) && taskMatches(item.task) && (!memberId || item.actorId===memberId)).sort((a,b)=>(b.completedAt || b.completedDate).localeCompare(a.completedAt || a.completedDate) || a.id.localeCompare(b.id));
  const planned=occurrences(state,start,end).filter(item => taskMatches(item.task) && (!memberId || item.memberId===memberId));
  const pending=planned.filter(item=>item.status!=='done'), scheduledDone=planned.filter(item=>item.status==='done').length;
  const sum = list => list.reduce((total,item)=>total+item.minutes,0);
  const aggregate = key => {
    const rows=new Map();
    for (const item of history) {
      const id=key(item); if (!rows.has(id)) rows.set(id,{id,count:0,minutes:0,missing:0,late:0});
      const row=rows.get(id); row.count++; row.minutes+=item.minutes; row.missing+=!item.minutes; row.late+=item.lateDays>0;
    }
    return [...rows.values()].sort((a,b)=>b.count-a.count || b.minutes-a.minutes || a.id.localeCompare(b.id));
  };
  const byMember=aggregate(item=>item.actorId), byRoom=aggregate(item=>item.task.groupId), byFrequency=aggregate(item=>item.task.recurrence || 'unscheduled');
  const byTask=aggregate(item=>item.task.seriesId || item.task.id).map(row => {
    const related=history.filter(item=>(item.task.seriesId || item.task.id)===row.id);
    return {...row,title:related[0].task.title,groupId:related[0].task.groupId,last:related[0].completedDate,participants:[...new Set(related.map(item=>item.actorId))]};
  });
  const dayCounts=new Map(); for(const item of history) dayCounts.set(item.completedDate,(dayCounts.get(item.completedDate) || 0)+1);
  let bestStreak=0,run=0,previous=null;
  for(const date of [...dayCounts.keys()].sort()) { run=previous && daysBetween(previous,date)===1 ? run+1 : 1; bestStreak=Math.max(bestStreak,run); previous=date; }
  let currentStreak=0, cursor=dayCounts.has(now)?now:addDays(now,-1);
  while(dayCounts.has(cursor)) { currentStreak++; cursor=addDays(cursor,-1); }
  const weekdays=Array.from({length:7},(_,id)=>({id,count:0,minutes:0}));
  for(const item of history) { const row=weekdays[(parseDate(item.completedDate).getUTCDay()+6)%7]; row.count++; row.minutes+=item.minutes; }
  const completedEnd=end<now?end:now;
  const chartStart=allHistory || daysBetween(start,end)>90 ? addDays(completedEnd,-83) : start;
  const heatStart=weekStart(chartStart), heatEnd=addDays(weekStart(completedEnd),6);
  const heatmap=datesBetween(heatStart,heatEnd).map(date=>({date,count:dayCounts.get(date)||0,outside:date<chartStart || date>completedEnd}));
  const timed=history.filter(item=>!item.approximateDate), late=timed.filter(item=>item.lateDays>0), datesEstimated=history.filter(item=>item.approximateDate).length;
  const tracked=Object.values(state.overrides).filter(item=>tasks.has(item.taskId) && taskMatches(tasks.get(item.taskId)) && (!memberId || item.memberId===memberId) && (allHistory || (item.date>=start && item.date<=end)));
  return {sessions:state.sessions.filter(session=>session.enabled && (!groupId || session.groupId===groupId) && session.taskIds.some(id=>tasks.has(id) && taskMatches(tasks.get(id)) && (!memberId || tasks.get(id).memberId===memberId))).length,moved:tracked.filter(item=>item.date!==item.scheduledDate && !item.mergedInto).length,merged:tracked.filter(item=>item.mergedInto).length,reassigned:tracked.filter(item=>item.memberId!==tasks.get(item.taskId).memberId && !item.mergedInto).length,subtasksDone:history.reduce((sum,item)=>sum+(item.subtaskDone?.length||0),0),history,byMember,byRoom,byFrequency,byTask,weekdays,heatmap,chartStart,chartEnd:completedEnd,completed:history.length,minutes:sum(history),missing:history.filter(item=>!item.minutes).length,unknownActor:history.filter(item=>!item.actorId).length,datesEstimated,activeDays:dayCounts.size,bestStreak,currentStreak,timingKnown:timed.length,onTime:timed.length-late.length,late:late.length,averageDelay:late.length?late.reduce((sum,item)=>sum+item.lateDays,0)/late.length:0,planned:planned.length,scheduledDone,pending:pending.length,overdue:pending.filter(item=>item.date<now).length,remainingMinutes:pending.reduce((sum,item)=>sum+(item.task.estimatedMinutes||0),0),remainingMissing:pending.filter(item=>!item.task.estimatedMinutes).length,progress:planned.length?Math.round(scheduledDone/planned.length*100):0,catalog:{active:state.tasks.filter(task=>!task.archived && taskMatches(task) && (!memberId || task.memberId===memberId)).length,archived:state.tasks.filter(task=>task.archived && taskMatches(task) && (!memberId || task.memberId===memberId)).length,unconfigured:state.tasks.filter(task=>!task.archived && taskMatches(task) && (!task.anchor || !task.recurrence)).length,subtasks:state.tasks.filter(task=>!task.archived && taskMatches(task) && (!memberId || task.memberId===memberId)).reduce((sum,task)=>sum+(task.subtasks?.length||0),0)}};
}
