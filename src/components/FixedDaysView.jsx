import React, { useState } from 'react'

function FixedDaysView({fixedDaysOff,setFixedDaysOff,staff,addAudit,currentUser}) {
  const [filterInit,setFilterInit]=useState("");
  const filtered=fixedDaysOff.filter(f=>!filterInit||f.init===filterInit);
  const DAY_ORDER=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const sorted=[...filtered].sort((a,b)=>DAY_ORDER.indexOf(a.dayOfWeek)-DAY_ORDER.indexOf(b.dayOfWeek)||a.name?.localeCompare(b.name));
  return (
    <div>
      <div className="card">
        <div className="ch">
          <span className="ct">Fixed Days Off</span>
          <select className="fi" style={{width:180,padding:"4px 8px",marginLeft:"auto"}} value={filterInit} onChange={e=>setFilterInit(e.target.value)}>
            <option value="">All Staff</option>
            {staff.filter(s=>s.role==="staff"&&s.active).sort((a,b)=>a.name.localeCompare(b.name)).map(s=><option key={s.id} value={s.init}>{s.name}</option>)}
          </select>
        </div>
        <div className="cb">
          {sorted.length===0&&<p style={{fontSize:12.5,color:"#94a3b8",padding:"8px 0"}}>No fixed days off recorded.</p>}
          <table className="tbl">
            <thead><tr><th>Staff</th><th>Grade</th><th>Day</th><th>Reason</th><th>Added</th><th>Action</th></tr></thead>
            <tbody>{sorted.map(f=>{
              const sm=staff.find(s=>s.init===f.init);
              return (
                <tr key={f.id}>
                  <td style={{fontWeight:600}}>{f.name||f.init}</td>
                  <td>{sm?.grade||"—"}</td>
                  <td>{f.dayOfWeek}</td>
                  <td><span style={{padding:"2px 8px",borderRadius:4,background:"#eff6ff",color:"#1d4ed8",fontSize:11,fontWeight:600}}>{f.reason}</span></td>
                  <td style={{fontSize:11,color:"#94a3b8"}}>{f.addedDate||"—"}</td>
                  <td><button className="btn bs bsm" style={{color:"#ef4444",borderColor:"#ef4444"}} onClick={()=>{setFixedDaysOff(prev=>prev.filter(x=>x.id!==f.id));addAudit(currentUser.init,"Fixed Day Off",`Admin removed ${f.name||f.init} fixed ${f.reason}: ${f.dayOfWeek}`);}}>Remove</button></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default FixedDaysView
