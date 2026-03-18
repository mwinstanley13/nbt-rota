import React, { useState } from 'react'
import { QUARTERS } from '../constants/quarters'
import { fmtISO } from '../utils/dates'

function HoursAdjustView({staff,hoursCorrections,setHoursCorrections,addAudit,currentUser,wteConfig,staffHours,rota,leaveEntries}) {
  const [filterInit, setFilterInit] = useState("");
  const [targetInit, setTargetInit] = useState("");
  const [qid, setQid]               = useState("Q1");
  const [amount, setAmount]         = useState("");
  const [reason, setReason]         = useState("");
  const [isCarryFwd, setIsCarryFwd] = useState(false);

  const activeStaff = staff.filter(s => s.role==="staff" && s.active);
  const visible = [...(hoursCorrections||[])]
    .filter(c => !filterInit || c.init===filterInit)
    .sort((a,b) => b.id - a.id);

  const save = () => {
    const num = parseFloat(amount);
    if (isNaN(num) || !reason.trim() || !targetInit) return;
    const entry = {id:Date.now(),init:targetInit,qid,amount:num,reason:reason.trim(),createdBy:currentUser.init,createdAt:fmtISO(new Date()),carryForward:isCarryFwd};
    setHoursCorrections(p=>[...p,entry]);
    addAudit(currentUser.init,"Hours Correction",`${targetInit} ${qid} ${num>=0?"+":""}${num}h${isCarryFwd?" [CF]":""} — ${reason.trim()}`);
    setAmount(""); setReason(""); setIsCarryFwd(false);
  };

  const del = (id) => {
    if (!window.confirm("Delete this correction?")) return;
    setHoursCorrections(p=>p.filter(c=>c.id!==id));
    addAudit(currentUser.init,"Hours Correction Deleted",`id=${id}`);
  };

  return (
    <div>
      <div className="card" style={{marginBottom:16}}>
        <div className="ch"><span className="ct">Add Hours Adjustment</span></div>
        <div className="cb">
          <div className="al al-i" style={{marginBottom:14}}>
            Log a one-off hours adjustment for any staff member. Use negative values to deduct (e.g. −16 for sick cover), positive to add. A reason is required for audit purposes.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 100px 100px 1fr auto",gap:10,alignItems:"flex-end"}}>
            <div className="fg" style={{marginBottom:0}}>
              <label className="fl">Staff member</label>
              <select className="fi" value={targetInit} onChange={e=>setTargetInit(e.target.value)}>
                <option value="">— select —</option>
                {activeStaff.map(s=><option key={s.id} value={s.init}>{s.name} ({s.init})</option>)}
              </select>
            </div>
            <div className="fg" style={{marginBottom:0}}>
              <label className="fl">Quarter</label>
              <select className="fi" value={qid} onChange={e=>setQid(e.target.value)}>
                {QUARTERS.map(q=><option key={q.id} value={q.id}>{q.id}</option>)}
              </select>
            </div>
            <div className="fg" style={{marginBottom:0}}>
              <label className="fl">Hours (+/−)</label>
              <input type="number" className="fi" value={amount} onChange={e=>setAmount(e.target.value)} step="0.5" placeholder="e.g. −16"/>
            </div>
            <div className="fg" style={{marginBottom:0}}>
              <label className="fl">Reason</label>
              <input className="fi" value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. Sick cover, study day"/>
            </div>
            <button className="btn bp" onClick={save} disabled={!amount||!reason.trim()||!targetInit} style={{whiteSpace:"nowrap"}}>
              Add
            </button>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:7,marginTop:12,fontSize:12.5,color:"#475569",cursor:"pointer"}}>
            <input type="checkbox" checked={isCarryFwd} onChange={e=>setIsCarryFwd(e.target.checked)} style={{width:14,height:14}}/>
            Mark as carry-forward from previous quarter
          </label>
        </div>
      </div>

      <div className="card">
        <div className="ch">
          <span className="ct">All Adjustments</span>
          <select className="fi" style={{width:180}} value={filterInit} onChange={e=>setFilterInit(e.target.value)}>
            <option value="">All staff</option>
            {activeStaff.map(s=><option key={s.id} value={s.init}>{s.name}</option>)}
          </select>
        </div>
        <div style={{overflowX:"auto"}}>
          {visible.length===0
            ? <div style={{padding:24,textAlign:"center",color:"#94a3b8"}}>No adjustments recorded{filterInit ? " for this person" : ""}.</div>
            : <table className="tbl">
                <thead>
                  <tr><th>Staff</th><th>Q</th><th>Amount</th><th>Reason</th><th>Logged by</th><th>Date</th><th></th></tr>
                </thead>
                <tbody>
                  {visible.map(c=>{
                    const s = staff.find(x=>x.init===c.init);
                    return (
                      <tr key={c.id}>
                        <td style={{fontWeight:600}}>{s?.name||c.init}</td>
                        <td><span className="badge b-staff">{c.qid}</span></td>
                        <td style={{fontWeight:700,color:c.amount>=0?"#16a34a":"#ef4444"}}>{c.amount>=0?"+":""}{c.amount}h{c.carryForward&&<span style={{marginLeft:5,fontSize:9,fontWeight:700,background:"#ede9fe",color:"#4c1d95",padding:"1px 4px",borderRadius:3}}>CF</span>}</td>
                        <td>{c.reason}</td>
                        <td style={{color:"#64748b"}}>{c.createdBy}</td>
                        <td style={{color:"#94a3b8",fontSize:11}}>{c.createdAt}</td>
                        <td><button className="btn bd bsm" onClick={()=>del(c.id)}>Delete</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
          }
        </div>
      </div>
    </div>
  );
}

export default HoursAdjustView
