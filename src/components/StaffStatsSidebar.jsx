import React, { useState, useMemo } from 'react'
import { QUARTERS } from '../constants/quarters'
import { getDatesInRange } from '../utils/dates'
import { countShifts, getHoursRemaining, getEffectiveWTE, getTarget, effGrade, getPersonTarget } from '../utils/rota'
import HoursCorrectModal from './HoursCorrectModal'

function StatCell({done, target}) {
  const color = target === 0 ? "#94a3b8" : done > target ? "#ef4444" : done >= target - 1 ? "#f59e0b" : "#94a3b8";
  return (
    <td style={{padding:"3px 5px",textAlign:"center",fontSize:10,fontWeight:600,color,whiteSpace:"nowrap"}}>
      {done}<span style={{color:"#cbd5e1",fontWeight:400}}>/{target}</span>
    </td>
  );
}

function StaffStatsSidebar({staff, rota, wteConfig, staffHours, selQ, leaveEntries, hoursCorrections, setHoursCorrections, addAudit, currentUser, availability, staffShiftOverrides}) {
  const [mode, setMode] = useState("quarter"); // "quarter" | "year"
  const [corrModal, setCorrModal] = useState(null); // {init, name, grade}

  const currentQ = useMemo(() => QUARTERS.find(q=>q.id===selQ) || QUARTERS[0], [selQ]);
  const qDates   = useMemo(() => currentQ ? getDatesInRange(currentQ.start, currentQ.end) : [], [currentQ]);
  const allDates  = useMemo(() => {
    const ds = new Set();
    Object.keys(rota).forEach(d => ds.add(d));
    return Array.from(ds);
  }, [rota]);

  const dates = mode === "quarter" ? qDates : allDates;
  const qid = currentQ?.id || "Q1";

  // Pre-compute all counts outside map (no hooks in loops)
  const allCounts = useMemo(() => {
    const result = {};
    staff.forEach(s => { result[s.init] = countShifts(s.init, dates, rota); });
    return result;
  }, [staff, dates, rota]);

  return (
    <div className="stats-sb" style={{width:300,flexShrink:0,background:"white",borderRadius:11,border:"1px solid #e2e8f0",overflow:"hidden",position:"sticky",top:0,maxHeight:"calc(100vh - 120px)",display:"flex",flexDirection:"column"}}>
      <div style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <span style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:12,fontWeight:700,color:"#0d1b2a"}}>Shift Counts</span>
        <div style={{display:"flex",background:"#f1f5f9",borderRadius:6,padding:2,gap:1}}>
          {[["quarter","Q: "+(currentQ?.id||"—")],["year","Year"]].map(([k,lbl])=>(
            <button key={k} onClick={()=>setMode(k)}
              style={{padding:"3px 8px",border:"none",borderRadius:4,cursor:"pointer",fontSize:10,fontWeight:600,
                background:mode===k?"white":"none",color:mode===k?"#0d1b2a":"#64748b",
                boxShadow:mode===k?"0 1px 2px rgba(0,0,0,.08)":"none",transition:"all .1s"}}>
              {lbl}
            </button>
          ))}
        </div>
      </div>
      <div style={{overflowY:"auto",flex:1}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr style={{background:"#f8fafc"}}>
              <th style={{padding:"4px 8px",textAlign:"left",fontSize:9,fontWeight:700,color:"#64748b",borderBottom:"1px solid #e2e8f0"}}>Name</th>
              <th style={{padding:"4px 4px",textAlign:"center",fontSize:9,fontWeight:700,color:"#1e1b4b",borderBottom:"1px solid #e2e8f0"}}>Ngt</th>
              <th style={{padding:"4px 4px",textAlign:"center",fontSize:9,fontWeight:700,color:"#6d28d9",borderBottom:"1px solid #e2e8f0"}}>W/E</th>
              <th style={{padding:"4px 4px",textAlign:"center",fontSize:9,fontWeight:700,color:"#14532d",borderBottom:"1px solid #e2e8f0"}}>Ear</th>
              <th style={{padding:"4px 4px",textAlign:"center",fontSize:9,fontWeight:700,color:"#1e3a8a",borderBottom:"1px solid #e2e8f0"}}>Mid</th>
              <th style={{padding:"4px 4px",textAlign:"center",fontSize:9,fontWeight:700,color:"#78350f",borderBottom:"1px solid #e2e8f0"}}>Lat</th>
              <th style={{padding:"4px 4px",textAlign:"center",fontSize:9,fontWeight:700,color:"#0f766e",borderBottom:"1px solid #e2e8f0"}}>Hrs</th>
            </tr>
          </thead>
          <tbody>
            {staff.map(s => {
              const wte = getEffectiveWTE(s.init, effGrade(s), qid, wteConfig, staffHours);
              const counts = allCounts[s.init] || {nights:0,weekends:0,earlies:0,mids:0,lates:0};
              const tN = mode==="quarter" ? getPersonTarget(wteConfig,s,"nights",  wte,staffShiftOverrides,qid) : QUARTERS.reduce((a,q)=>a+getPersonTarget(wteConfig,s,"nights",  getEffectiveWTE(s.init,effGrade(s),q.id,wteConfig,staffHours),staffShiftOverrides,q.id),0);
              const tW = mode==="quarter" ? getPersonTarget(wteConfig,s,"weekends",wte,staffShiftOverrides,qid) : QUARTERS.reduce((a,q)=>a+getPersonTarget(wteConfig,s,"weekends",getEffectiveWTE(s.init,effGrade(s),q.id,wteConfig,staffHours),staffShiftOverrides,q.id),0);
              const tE = mode==="quarter" ? getPersonTarget(wteConfig,s,"earlies", wte,staffShiftOverrides,qid) : QUARTERS.reduce((a,q)=>a+getPersonTarget(wteConfig,s,"earlies", getEffectiveWTE(s.init,effGrade(s),q.id,wteConfig,staffHours),staffShiftOverrides,q.id),0);
              const tM = mode==="quarter" ? getPersonTarget(wteConfig,s,"mids",    wte,staffShiftOverrides,qid) : QUARTERS.reduce((a,q)=>a+getPersonTarget(wteConfig,s,"mids",    getEffectiveWTE(s.init,effGrade(s),q.id,wteConfig,staffHours),staffShiftOverrides,q.id),0);
              const tL = mode==="quarter" ? getPersonTarget(wteConfig,s,"lates",   wte,staffShiftOverrides,qid) : QUARTERS.reduce((a,q)=>a+getPersonTarget(wteConfig,s,"lates",   getEffectiveWTE(s.init,effGrade(s),q.id,wteConfig,staffHours),staffShiftOverrides,q.id),0);
              const hrs = mode==="quarter"
                ? getHoursRemaining(s.init, s.grade, qid, wteConfig, staffHours, rota, leaveEntries, hoursCorrections)
                : QUARTERS.reduce((a,q)=>a+(getHoursRemaining(s.init,s.grade,q.id,wteConfig,staffHours,rota,leaveEntries,hoursCorrections)||0),0);
              const hrsCol = hrs==null?"#94a3b8":hrs>8?"#d97706":hrs>=-8?"#16a34a":"#ef4444";
              return (
                <tr key={s.id} style={{borderBottom:"1px solid #f8fafc"}}>
                  <td style={{padding:"4px 8px",fontSize:10,fontWeight:600,color:"#374151",maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}
                    title={s.name}>
                    <div style={{display:"flex",alignItems:"center",gap:3}}>
                      <span>{s.name.split(" ")[0]} {s.name.split(" ")[1]?.[0]}.</span>
                      <button onClick={()=>setCorrModal(s)} title="Hours corrections"
                        style={{background:"none",border:"1px solid #d1d5db",borderRadius:3,cursor:"pointer",fontSize:8,padding:"0 3px",color:"#6366f1",lineHeight:"14px",flexShrink:0}}>⊕</button>
                    </div>
                  </td>
                  <StatCell done={counts.nights}   target={tN}/>
                  <StatCell done={counts.weekends}  target={tW}/>
                  <StatCell done={counts.earlies}   target={tE}/>
                  <StatCell done={counts.mids}      target={tM}/>
                  <StatCell done={counts.lates}     target={tL}/>
                  <td style={{padding:"3px 5px",textAlign:"center",fontSize:10,fontWeight:700,color:hrsCol,whiteSpace:"nowrap"}}>
                    {hrs!=null?hrs:"—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{padding:"6px 10px",borderTop:"1px solid #f1f5f9",fontSize:9,color:"#94a3b8",flexShrink:0}}>
        done/target · red=over · amber=near · Hrs=remaining
      </div>
      {corrModal&&(
        <HoursCorrectModal
          staffMember={corrModal}
          hoursCorrections={hoursCorrections}
          setHoursCorrections={setHoursCorrections}
          addAudit={addAudit}
          currentUser={currentUser}
          wteConfig={wteConfig}
          staffHours={staffHours}
          rota={rota}
          leaveEntries={leaveEntries}
          onClose={()=>setCorrModal(null)}
        />
      )}
    </div>
  );
}

export default StaffStatsSidebar
