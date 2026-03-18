import React, { useMemo } from 'react'
import { SLOTS } from '../constants/slots'
import { LEAVE_T } from '../constants/leaveTypes'
import { fmtISO } from '../utils/dates'
import { generateICS, downloadICS } from '../utils/ical'

// Christmas period: 21 Dec – 3 Jan
const isXmasPeriod = d => { const mm=parseInt(d.slice(5,7)),dd=parseInt(d.slice(8,10)); return (mm===12&&dd>=21)||(mm===1&&dd<=3); };

// Group label for display — shows category name, not specific slot
const GRP_LABEL = {
  EARLY:"Early", MID:"Mid", LATE:"Late",
  WE_EARLY:"W/E Early", WE_LATE:"W/E Late",
  NIGHT1:"Night (SDM 1)", NIGHT2:"Night (SDM 2)",
  ST3_NIGHT:"Night (ST3)", ACP_NIGHT:"Night (ACP)"
};

// Representative slot per group (for colour chips in breakdown)
const GRP_REP = {};
SLOTS.forEach(s => { if(!GRP_REP[s.grp]) GRP_REP[s.grp] = s; });

function MyShifts({user,rota,leaveEntries,dayNotes,shiftTimes,staffShiftTimes,staff}) {
  const today=fmtISO(new Date());
  const mySlots=useMemo(()=>{
    const res=[];
    Object.entries(rota).forEach(([d,slots])=>{
      Object.entries(slots).forEach(([sk,init])=>{if(init===user.init){const sl=SLOTS.find(s=>s.key===sk);if(sl)res.push({date:d,slot:sl});}});
    });
    Object.entries(leaveEntries).forEach(([d,entries])=>{
      entries.forEach(e=>{if(e.init===user.init){const lt=LEAVE_T[e.type];if(lt)res.push({date:d,slot:{...lt,key:e.type}});}});
    });
    return res.sort((a,b)=>a.date.localeCompare(b.date));
  },[rota,leaveEntries,user]);

  const upcoming=mySlots.filter(x=>x.date>=today), past=mySlots.filter(x=>x.date<today);

  // Group shift breakdown by category (grp), not individual slot key
  const groupCounts = useMemo(()=>{
    const counts = {};
    mySlots.forEach(x => {
      // Leave types don't have grp — keep them by key
      const groupKey = x.slot.grp || x.slot.key;
      if(!counts[groupKey]) counts[groupKey] = {count:0, slot:x.slot};
      counts[groupKey].count++;
    });
    return counts;
  }, [mySlots]);

  // Get the display label for a slot in the upcoming list
  const slotDisplayLabel = sl => sl.grp ? (GRP_LABEL[sl.grp] || sl.label) : sl.label;

  const handleExport = () => {
    const ics = generateICS({user, rota, leaveEntries, shiftTimes, staffShiftTimes, staff: staff||[]});
    const name = (staff||[]).find(s=>s.init===user.init)?.name || user.init;
    downloadICS(`NBT-Rota-${name.replace(/\s+/g,'-')}.ics`, ics);
  };

  return (
    <div>
      <div className="sg" style={{gridTemplateColumns:"repeat(3,1fr)",marginBottom:18}}>
        <div className="sc" style={{"--sc-bg":"linear-gradient(135deg,#10b981,#059669)"}}><span className="sc-icon">📅</span><div className="sv">{mySlots.length}</div><div className="sl">Total Shifts</div></div>
        <div className="sc" style={{"--sc-bg":"linear-gradient(135deg,#6366f1,#4f46e5)"}}><span className="sc-icon">⏩</span><div className="sv">{upcoming.length}</div><div className="sl">Upcoming</div></div>
        <div className="sc" style={{"--sc-bg":"linear-gradient(135deg,#f59e0b,#d97706)"}}><span className="sc-icon">✅</span><div className="sv">{past.length}</div><div className="sl">Completed</div></div>
      </div>
      <div className="dg2">
        <div className="card">
          <div className="ch">
            <span className="ct">Upcoming Shifts</span>
            <button className="btn bs bsm" onClick={handleExport} title="Download as .ics to import into Apple/Google Calendar">📅 Export .ics</button>
          </div>
          <div className="cb" style={{maxHeight:380,overflowY:"auto"}}>
            {upcoming.length===0?<p style={{color:"#94a3b8",fontSize:12}}>No upcoming shifts assigned.</p>
              :upcoming.map((x,i)=>{const dt=new Date(x.date+"T00:00:00"),note=dayNotes[x.date],xmas=isXmasPeriod(x.date);return(
                <div key={i} style={{display:"flex",alignItems:"center",gap:11,padding:"8px 0",borderBottom:"1px solid #f1f5f9",background:xmas?"#fff1f2":"transparent",marginLeft:xmas?-12:0,marginRight:xmas?-12:0,paddingLeft:xmas?12:0,paddingRight:xmas?12:0,borderLeft:xmas?"3px solid #fca5a5":"none"}}>
                  <div style={{textAlign:"center",width:36,flexShrink:0}}>
                    <div style={{fontSize:17,fontWeight:800,fontFamily:"'Plus Jakarta Sans',sans-serif",color:xmas?"#be123c":"#0d1b2a"}}>{dt.getDate()}</div>
                    <div style={{fontSize:9,color:"#64748b"}}>{dt.toLocaleDateString("en-GB",{month:"short"})}</div>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
                      {dt.toLocaleDateString("en-GB",{weekday:"long"})}
                      {xmas&&<span style={{fontSize:11}}>🎄</span>}
                    </div>
                    <span className="chip" style={{background:x.slot.bg,color:x.slot.fg,borderColor:x.slot.bd,fontSize:10.5}}>{slotDisplayLabel(x.slot)}</span>
                    {note&&<div style={{fontSize:10,color:"#92400e",marginTop:2}}>📌 {note}</div>}
                  </div>
                </div>
              );})}
          </div>
        </div>
        <div className="card">
          <div className="ch"><span className="ct">Shift Breakdown</span></div>
          <div className="cb">
            {mySlots.length===0?<p style={{color:"#94a3b8",fontSize:12}}>No shifts assigned yet.</p>
              :Object.entries(groupCounts).map(([groupKey,{count,slot}])=>{
                // Use representative slot for the group for colours
                const rep = slot.grp ? (GRP_REP[slot.grp]||slot) : slot;
                const displayLabel = slot.grp ? (GRP_LABEL[slot.grp]||slot.label) : (slot.label||groupKey);
                const tot = mySlots.length;
                return(
                  <div key={groupKey} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #f1f5f9"}}>
                    <span className="chip" style={{background:rep.bg,color:rep.fg,borderColor:rep.bd,fontSize:10,width:95,textAlign:"center"}}>{displayLabel}</span>
                    <div className="rt"><div className="rf" style={{width:`${(count/tot)*100}%`,background:rep.fg}}/></div>
                    <span style={{fontSize:11,color:"#64748b",width:22,textAlign:"right"}}>{count}</span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default MyShifts
