import React, { useMemo } from 'react'
import { IS_DEMO } from '../utils/storage'
import { SLOTS } from '../constants/slots'
import { QUARTERS } from '../constants/quarters'
import { LEAVE_T } from '../constants/leaveTypes'
import { fmtISO, fmtDisp } from '../utils/dates'

function Dashboard({user,staff,rota,requests,dayNotes,availability,quarterStatus,quarters,demoMode,loadDemoData,resetToFresh,isAdmin:isAdminProp,swaps,setView}) {
  const qs = quarters || QUARTERS;
  const today=fmtISO(new Date()), isAdmin=isAdminProp||(user.role==="admin");
  const myPendingSwaps = (swaps||[]).filter(s=>s.toInit===user.init&&s.status==="pending_b");
  const todaySlots=rota[today]||{};
  const todayStaffInit=[...new Set(Object.values(todaySlots).filter(Boolean))];
  const pending=requests.filter(r=>r.status==="pending");
  const openQs=qs.filter(q=>quarterStatus[q.id]==="open");
  const myAvail=availability[user.init]||{};
  const myNextShift=useMemo(()=>{
    if(isAdmin) return null;
    return Object.keys(rota).sort().map(d=>({d,slots:Object.values(rota[d]).filter(Boolean)}))
      .find(x=>x.d>=today&&x.slots.includes(user.init));
  },[rota,user,today,isAdmin]);

  const hr=new Date().getHours();
  const greet=hr<12?"Good morning":hr<17?"Good afternoon":"Good evening";
  const firstName=user.name?.split(" ")[0]||user.init;

  return (
    <div style={{maxWidth:960,margin:"0 auto"}}>

      {/* Welcome banner */}
      <div className="dash-welcome">
        <div>
          <div className="dash-greet">{greet}, {firstName} 👋</div>
          <div className="dash-sub">{new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})} · {IS_DEMO?"Demo Environment":"RotaFlow"}</div>
        </div>
        {isAdmin&&<div style={{display:"flex",gap:8}}>
          <button className="qa-btn" onClick={()=>setView&&setView("builder")}>🗂 Build Rota</button>
          <button className="qa-btn" onClick={()=>setView&&setView("requests")}>📥 Requests{pending.length>0&&<span style={{background:"#ef4444",color:"white",borderRadius:10,padding:"1px 6px",fontSize:10,fontWeight:700,marginLeft:4}}>{pending.length}</span>}</button>
        </div>}
      </div>

      {/* Alerts */}
      {(dayNotes[today])&&<div className="al al-w" style={{marginBottom:14}}>📌 <strong>Today:</strong> {dayNotes[today]}</div>}
      {!isAdmin&&openQs.length>0&&<div className="al al-i" style={{marginBottom:14}}>📋 Availability open for <strong>{openQs.map(q=>q.id).join(", ")}</strong> — please submit yours.</div>}
      {!isAdmin&&myPendingSwaps.length>0&&<div className="al al-w" style={{marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span>🔄 You have <strong>{myPendingSwaps.length}</strong> shift swap request{myPendingSwaps.length>1?"s":""} awaiting your response.</span>
        {setView&&<button className="btn bsm" style={{marginLeft:12,flexShrink:0}} onClick={()=>setView("requests")}>View</button>}
      </div>}

      {/* Stat cards */}
      <div className="sg">
        <div className="sc" style={{"--sc-bg":"linear-gradient(135deg,#10b981,#059669)"}}>
          <span className="sc-icon">👥</span>
          <div className="sv">{staff.filter(s=>s.role==="staff"&&s.active).length}</div>
          <div className="sl">Active Staff</div>
        </div>
        <div className="sc" style={{"--sc-bg":"linear-gradient(135deg,#6366f1,#4f46e5)"}}>
          <span className="sc-icon">🏥</span>
          <div className="sv">{todayStaffInit.length}</div>
          <div className="sl">On Shift Today</div>
        </div>
        <div className="sc" style={{"--sc-bg":"linear-gradient(135deg,#f59e0b,#d97706)"}}>
          <span className="sc-icon">📋</span>
          <div className="sv">{pending.length}</div>
          <div className="sl">Pending Requests</div>
        </div>
        <div className="sc" style={{"--sc-bg":"linear-gradient(135deg,#3b82f6,#2563eb)"}}>
          <span className="sc-icon">📅</span>
          <div className="sv">{openQs.length}</div>
          <div className="sl">Open Avail Quarters</div>
        </div>
      </div>

      {/* Main panels */}
      <div className="dg2">
        <div className="card">
          <div className="ch">
            <span className="ct">Today's Shifts</span>
            <span style={{fontSize:10.5,color:"#94a3b8",background:"#f1f5f9",padding:"2px 8px",borderRadius:20}}>{fmtDisp(today)}</span>
          </div>
          <div className="cb" style={{maxHeight:290,overflowY:"auto"}}>
            {todayStaffInit.length===0
              ?<div style={{textAlign:"center",padding:"24px 0",color:"#94a3b8"}}>
                  <div style={{fontSize:28,marginBottom:8}}>🌙</div>
                  <div style={{fontSize:12}}>No shifts assigned today</div>
                </div>
              :todayStaffInit.map(init=>{
                const s=staff.find(x=>x.init===init);
                const mySlots=Object.entries(todaySlots).filter(([k,v])=>v===init).map(([k])=>SLOTS.find(sl=>sl.key===k)).filter(Boolean);
                return (
                  <div key={init} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #f4f6fb"}}>
                    <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#10b981,#0284c7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9.5,fontWeight:800,color:"white",flexShrink:0}}>{init.slice(0,2)}</div>
                    <div style={{flex:1}}><div style={{fontSize:12.5,fontWeight:600,color:"#0d1b2a"}}>{s?.name||init}</div><div style={{fontSize:10,color:"#94a3b8"}}>{s?.grade}</div></div>
                    {mySlots.slice(0,2).map(sl=><span key={sl.key} className="chip" style={{background:sl.bg,color:sl.fg,borderColor:sl.bd,fontSize:9.5}}>{sl.label}</span>)}
                  </div>
                );
              })}
          </div>
        </div>

        <div className="card">
          <div className="ch"><span className="ct">{isAdmin?"Pending Requests":"My Overview"}</span></div>
          <div className="cb">
            {isAdmin?(
              pending.length===0
                ?<div style={{textAlign:"center",padding:"24px 0",color:"#94a3b8"}}>
                    <div style={{fontSize:28,marginBottom:8}}>✅</div>
                    <div style={{fontSize:12}}>All clear — no pending requests</div>
                  </div>
                :pending.slice(0,6).map(r=>(
                  <div key={r.id} style={{display:"flex",alignItems:"center",gap:9,padding:"8px 0",borderBottom:"1px solid #f4f6fb"}}>
                    <div style={{width:32,height:32,borderRadius:"50%",background:"#fef3c7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>📝</div>
                    <div style={{flex:1}}><div style={{fontSize:12.5,fontWeight:600,color:"#0d1b2a"}}>{r.staffName}</div><div style={{fontSize:10,color:"#94a3b8"}}>{LEAVE_T[r.type]?.label} · {fmtDisp(r.startDate)}</div></div>
                    <span className="badge b-pending">Pending</span>
                  </div>
                ))
            ):(
              <div>
                {myNextShift
                  ?<div style={{padding:16,background:"linear-gradient(135deg,#f0fdf4,#dcfce7)",borderRadius:10,marginBottom:14,border:"1px solid #bbf7d0"}}>
                      <div style={{fontSize:10,color:"#16a34a",fontWeight:600,marginBottom:3,textTransform:"uppercase",letterSpacing:".4px"}}>Next Shift</div>
                      <div style={{fontSize:20,fontWeight:800,fontFamily:"'Plus Jakarta Sans',sans-serif",color:"#14532d"}}>{fmtDisp(myNextShift.d)}</div>
                    </div>
                  :<div className="al al-i">No upcoming shifts assigned yet.</div>}
                <div style={{fontSize:11.5,fontWeight:700,color:"#374151",marginBottom:7}}>Availability submitted</div>
                {Object.keys(myAvail).length===0
                  ?<p style={{fontSize:12,color:"#94a3b8"}}>No availability submitted yet.</p>
                  :<div style={{fontSize:13,fontWeight:700,color:"#10b981"}}>{Object.keys(myAvail).length} <span style={{color:"#64748b",fontWeight:400}}>dates marked</span></div>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Data Management — demo only */}
      {isAdmin&&IS_DEMO&&(
        <div className="card" style={{marginTop:20,border:"1px solid #fecaca"}}>
          <div className="ch" style={{background:"linear-gradient(90deg,#fff7ed,#fef2f2)"}}>
            <span className="ct" style={{color:"#9a3412"}}>🔧 Data Management</span>
            <span style={{fontSize:11,color:"#94a3b8",marginLeft:8}}>Demo only</span>
          </div>
          <div className="cb">
            <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:220,padding:14,background:"#f0fdf4",borderRadius:10,border:"1px solid #86efac"}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:4,color:"#14532d"}}>🧪 Load Demo Data</div>
                <div style={{fontSize:12,color:"#166534",marginBottom:10}}>Loads all default staff with realistic Q1 availability so you can test the AI rota builder straight away.{demoMode&&<span style={{marginLeft:6,fontWeight:700}}> (Active)</span>}</div>
                <button className="btn bp bsm" onClick={loadDemoData}>{demoMode?"Reload Demo":"Load Demo"}</button>
              </div>
              <div style={{flex:1,minWidth:220,padding:14,background:"#fff1f2",borderRadius:10,border:"1px solid #fca5a5"}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:4,color:"#7f1d1d"}}>🗑 Fresh Start</div>
                <div style={{fontSize:12,color:"#991b1b",marginBottom:10}}>Removes <strong>all staff and all data</strong>. Keeps year structure and config. Use when ready to go live.</div>
                <button className="btn bsm" style={{background:"#ef4444",color:"white",border:"none",cursor:"pointer",borderRadius:6,padding:"5px 12px",fontWeight:600}} onClick={resetToFresh}>Reset to Fresh Start</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard
