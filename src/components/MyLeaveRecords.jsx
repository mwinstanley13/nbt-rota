import React, { useState, useMemo } from 'react'
import { LEAVE_T } from '../constants/leaveTypes'
import { fmtDisp, getDatesInRange } from '../utils/dates'
import { normaliseAvailEntry } from '../utils/availability'

const LEAVE_RECORD_TYPES=["SL","MILITARY","FELLOW","PHEM","RESEARCH"];

function MyLeaveRecords({user,leaveEntries,requests,availability}) {
  const init=user.init;
  // Collect all leave records from all sources, deduplicated by date+type
  const records=useMemo(()=>{
    const map=new Map(); // key = `${date}|${type}` → record object
    const add=(date,type,source,note)=>{
      const k=`${date}|${type}`;
      if(!map.has(k)) map.set(k,{date,type,source,note:note||""});
    };
    // From leaveEntries state
    Object.entries(leaveEntries||{}).forEach(([d,es])=>{
      es.filter(e=>e.init===init&&LEAVE_RECORD_TYPES.includes(e.type))
        .forEach(e=>add(d,e.type,"leave entry",e.note||""));
    });
    // From availability base entries (staff marked day in availability form)
    if(availability&&availability[init]){
      Object.entries(availability[init]).forEach(([d,raw])=>{
        const e=normaliseAvailEntry(raw);
        if(e&&LEAVE_RECORD_TYPES.includes(e.base)) add(d,e.base,"availability","");
      });
    }
    // From requests (all statuses — show request status)
    (requests||[]).filter(r=>(r.staffInitials===init||r.init===init)&&LEAVE_RECORD_TYPES.includes(r.type))
      .forEach(r=>{
        const ds=getDatesInRange(r.startDate,r.endDate);
        const src=`request (${r.status})`;
        ds.forEach(d=>add(d,r.type,src,r.reason||""));
      });
    return [...map.values()].sort((a,b)=>b.date.localeCompare(a.date));
  },[init,leaveEntries,availability,requests]);

  // Group by type for summary
  const summary=LEAVE_RECORD_TYPES.map(t=>({type:t,count:records.filter(r=>r.type===t).length})).filter(s=>s.count>0);
  const [filter,setFilter]=useState("all");
  const visible=filter==="all"?records:records.filter(r=>r.type===filter);

  const typeColor={
    SL:{bg:"#fef3c7",fg:"#92400e"},
    MILITARY:{bg:"#dcfce7",fg:"#14532d"},
    FELLOW:{bg:"#e0f2fe",fg:"#075985"},
    PHEM:{bg:"#fae8ff",fg:"#6b21a8"},
    RESEARCH:{bg:"#f0fdf4",fg:"#166534"},
  };
  const typeLabel=t=>(LEAVE_T[t]?.label||t);

  return (
    <div>
      {/* Summary stat cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10,marginBottom:16}}>
        {LEAVE_RECORD_TYPES.map(t=>{
          const cnt=records.filter(r=>r.type===t).length;
          const col=typeColor[t]||{bg:"#f1f5f9",fg:"#475569"};
          return (
            <div key={t} className="card" style={{padding:"12px 14px",textAlign:"center",cursor:"pointer",border:`2px solid ${filter===t?"#6366f1":"transparent"}`,transition:"border .15s"}}
              onClick={()=>setFilter(f=>f===t?"all":t)}>
              <div style={{fontSize:28,fontWeight:800,color:col.fg,lineHeight:1}}>{cnt}</div>
              <div style={{fontSize:11,fontWeight:600,color:"#64748b",marginTop:4}}>{typeLabel(t)}</div>
              {user[t.toLowerCase()+"Days"]>0&&<div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>of {user[t.toLowerCase()+"Days"]} days</div>}
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="ch">
          <span className="ct">📒 Leave Records — {user.name}</span>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontSize:11,color:"#94a3b8"}}>Filter:</span>
            <div className="mtog">
              <button className={`mtog-btn${filter==="all"?" act":""}`} onClick={()=>setFilter("all")}>All ({records.length})</button>
              {summary.map(s=>(
                <button key={s.type} className={`mtog-btn${filter===s.type?" act":""}`} onClick={()=>setFilter(s.type)}>
                  {typeLabel(s.type)} ({s.count})
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="cb" style={{padding:0}}>
          {visible.length===0
            ?<p style={{color:"#94a3b8",fontSize:12,padding:"18px 18px"}}>No leave records found.</p>
            :<table className="tbl" style={{width:"100%"}}>
              <thead>
                <tr>
                  <th style={{textAlign:"left",padding:"8px 14px",fontWeight:700,fontSize:11,color:"#475569",background:"#f8fafc",borderBottom:"2px solid #e2e8f0"}}>Date</th>
                  <th style={{textAlign:"left",padding:"8px 10px",fontWeight:700,fontSize:11,color:"#475569",background:"#f8fafc",borderBottom:"2px solid #e2e8f0"}}>Type</th>
                  <th style={{textAlign:"left",padding:"8px 10px",fontWeight:700,fontSize:11,color:"#475569",background:"#f8fafc",borderBottom:"2px solid #e2e8f0"}}>Source</th>
                  <th style={{textAlign:"left",padding:"8px 10px",fontWeight:700,fontSize:11,color:"#475569",background:"#f8fafc",borderBottom:"2px solid #e2e8f0"}}>Note</th>
                </tr>
              </thead>
              <tbody>{visible.map((r,i)=>{
                const col=typeColor[r.type]||{bg:"#f1f5f9",fg:"#475569"};
                return (
                  <tr key={i} style={{borderBottom:"1px solid #f1f5f9"}} onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                    <td style={{padding:"7px 14px",fontWeight:600,fontSize:12.5,color:"#1e293b"}}>{fmtDisp(r.date)}</td>
                    <td style={{padding:"7px 10px"}}>
                      <span style={{display:"inline-block",padding:"2px 8px",borderRadius:5,fontSize:11,fontWeight:700,background:col.bg,color:col.fg}}>{typeLabel(r.type)}</span>
                    </td>
                    <td style={{padding:"7px 10px",fontSize:11.5,color:"#64748b",textTransform:"capitalize"}}>{r.source}</td>
                    <td style={{padding:"7px 10px",fontSize:11.5,color:"#64748b"}}>{r.note||<span style={{color:"#cbd5e1"}}>—</span>}</td>
                  </tr>
                );
              })}</tbody>
            </table>}
        </div>
        <div style={{padding:"7px 14px",borderTop:"1px solid #f1f5f9",fontSize:10.5,color:"#94a3b8"}}>
          Records combined from leave entries, availability form entries &amp; submitted requests · sorted newest first
        </div>
      </div>
    </div>
  );
}

export default MyLeaveRecords
