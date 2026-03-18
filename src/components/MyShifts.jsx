import React, { useMemo } from 'react'
import { SLOTS } from '../constants/slots'
import { LEAVE_T } from '../constants/leaveTypes'
import { fmtISO } from '../utils/dates'

function MyShifts({user,rota,leaveEntries,dayNotes}) {
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
  const counts=mySlots.reduce((a,x)=>{a[x.slot.key]=(a[x.slot.key]||0)+1;return a;},{});

  return (
    <div>
      <div className="sg" style={{gridTemplateColumns:"repeat(3,1fr)",marginBottom:18}}>
        <div className="sc" style={{"--sc-bg":"linear-gradient(135deg,#10b981,#059669)"}}><span className="sc-icon">📅</span><div className="sv">{mySlots.length}</div><div className="sl">Total Shifts</div></div>
        <div className="sc" style={{"--sc-bg":"linear-gradient(135deg,#6366f1,#4f46e5)"}}><span className="sc-icon">⏩</span><div className="sv">{upcoming.length}</div><div className="sl">Upcoming</div></div>
        <div className="sc" style={{"--sc-bg":"linear-gradient(135deg,#f59e0b,#d97706)"}}><span className="sc-icon">✅</span><div className="sv">{past.length}</div><div className="sl">Completed</div></div>
      </div>
      <div className="dg2">
        <div className="card">
          <div className="ch"><span className="ct">Upcoming Shifts</span></div>
          <div className="cb" style={{maxHeight:380,overflowY:"auto"}}>
            {upcoming.length===0?<p style={{color:"#94a3b8",fontSize:12}}>No upcoming shifts assigned.</p>
              :upcoming.map((x,i)=>{const dt=new Date(x.date+"T00:00:00"),note=dayNotes[x.date];return(
                <div key={i} style={{display:"flex",alignItems:"center",gap:11,padding:"8px 0",borderBottom:"1px solid #f1f5f9"}}>
                  <div style={{textAlign:"center",width:36,flexShrink:0}}>
                    <div style={{fontSize:17,fontWeight:800,fontFamily:"'Plus Jakarta Sans',sans-serif",color:"#0d1b2a"}}>{dt.getDate()}</div>
                    <div style={{fontSize:9,color:"#64748b"}}>{dt.toLocaleDateString("en-GB",{month:"short"})}</div>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:600}}>{dt.toLocaleDateString("en-GB",{weekday:"long"})}</div>
                    <span className="chip" style={{background:x.slot.bg,color:x.slot.fg,borderColor:x.slot.bd,fontSize:10.5}}>{x.slot.label}</span>
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
              :Object.entries(counts).map(([k,c])=>{const sl=SLOTS.find(s=>s.key===k)||LEAVE_T[k];if(!sl)return null;const tot=mySlots.length;return(
                <div key={k} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #f1f5f9"}}>
                  <span className="chip" style={{background:sl.bg,color:sl.fg,borderColor:sl.bd,fontSize:10,width:85,textAlign:"center"}}>{sl.label||k}</span>
                  <div className="rt"><div className="rf" style={{width:`${(c/tot)*100}%`,background:sl.fg}}/></div>
                  <span style={{fontSize:11,color:"#64748b",width:22,textAlign:"right"}}>{c}</span>
                </div>
              );})}
          </div>
        </div>
      </div>
    </div>
  );
}

export default MyShifts
