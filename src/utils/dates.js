import { SLOTS } from '../constants/slots.js';
import { QUARTERS } from '../constants/quarters.js';

export const fmtISO = d => { const x=new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`; };
export const fmtDisp = s => new Date(s+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
export const fmtShort = s => new Date(s+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"});
export const isWeekend = d => { const dow=new Date(d+"T00:00:00").getDay(); return dow===0||dow===6; };
export const getDayName = d => new Date(d+"T00:00:00").toLocaleDateString("en-GB",{weekday:"short"});
export const getSlotsForDay = d => SLOTS.filter(s => isWeekend(d) ? s.we : s.wd);

export const getWeekDates = anchor => {
  const d=new Date(anchor+"T00:00:00"), day=d.getDay(), diff=d.getDate()-day+(day===0?-6:1);
  d.setDate(diff);
  return Array.from({length:7},(_,i)=>{ const x=new Date(d); x.setDate(x.getDate()+i); return fmtISO(x); });
};

export const getMonthDays = (yr,mo) => {
  const days=[],first=new Date(yr,mo,1),last=new Date(yr,mo+1,0),sp=(first.getDay()+6)%7;
  for(let i=sp;i>0;i--) days.push({date:fmtISO(new Date(yr,mo,1-i)),inMonth:false});
  for(let d=1;d<=last.getDate();d++) days.push({date:fmtISO(new Date(yr,mo,d)),inMonth:true});
  const ep=7-(days.length%7); if(ep<7) for(let i=1;i<=ep;i++) days.push({date:fmtISO(new Date(yr,mo+1,i)),inMonth:false});
  return days;
};

export const getDatesInRange = (start,end) => {
  const dates=[]; let cur=new Date(start+"T00:00:00"); const last=new Date(end+"T00:00:00");
  while(cur<=last){ dates.push(fmtISO(cur)); cur.setDate(cur.getDate()+1); }
  return dates;
};

export const getQuarterForDate = d => QUARTERS.find(q=>d>=q.start&&d<=q.end);
