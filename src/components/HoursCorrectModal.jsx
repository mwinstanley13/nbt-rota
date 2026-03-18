import React, { useState } from 'react'
import { QUARTERS } from '../constants/quarters'
import { fmtISO } from '../utils/dates'
import { getHoursRemaining } from '../utils/rota'
import Modal from './Modal'

function HoursCorrectModal({staffMember, hoursCorrections, setHoursCorrections, addAudit, currentUser, wteConfig, staffHours, rota, leaveEntries, onClose}) {
  const [qid, setQid] = useState("Q1");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const existing = (hoursCorrections || []).filter(c => c.init === staffMember.init);

  const save = () => {
    const num = parseFloat(amount);
    if (isNaN(num) || !reason.trim()) return;
    const entry = {id:Date.now(), init:staffMember.init, qid, amount:num, reason:reason.trim(), createdBy:currentUser.init, createdAt:fmtISO(new Date())};
    setHoursCorrections(p => [...p, entry]);
    addAudit(currentUser.init, "Hours Correction", `${staffMember.init} ${qid} ${num>0?"+":""}${num}h — ${reason.trim()}`);
    setAmount(""); setReason(""); setQid("Q1");
  };

  return (
    <Modal title={`Hours Corrections — ${staffMember.name}`} onClose={onClose}
      footer={<button className="btn bs" onClick={onClose}>Close</button>}>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11.5,fontWeight:700,color:"#374151",marginBottom:8}}>Current balances</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:14}}>
          {QUARTERS.map(q=>{
            const rem = getHoursRemaining(staffMember.init, staffMember.grade, q.id, wteConfig, staffHours, rota, leaveEntries, hoursCorrections);
            const col = rem==null?"#94a3b8":rem>=10?"#16a34a":rem>=0?"#d97706":"#ef4444";
            return (
              <div key={q.id} style={{background:"#f8fafc",borderRadius:7,padding:"8px 10px",textAlign:"center",border:`1px solid ${col}30`}}>
                <div style={{fontSize:9,color:"#64748b",fontWeight:700}}>{q.id}</div>
                <div style={{fontSize:14,fontWeight:800,color:col}}>{rem!=null?rem:"—"}</div>
                <div style={{fontSize:8,color:"#94a3b8"}}>hrs left</div>
              </div>
            );
          })}
        </div>
        <div style={{fontSize:11.5,fontWeight:700,color:"#374151",marginBottom:8}}>Add correction</div>
        <div style={{display:"grid",gridTemplateColumns:"80px 90px 1fr",gap:8,alignItems:"flex-end",marginBottom:10}}>
          <div className="fg" style={{marginBottom:0}}>
            <label className="fl">Quarter</label>
            <select className="fi" value={qid} onChange={e=>setQid(e.target.value)}>
              {QUARTERS.map(q=><option key={q.id} value={q.id}>{q.id}</option>)}
            </select>
          </div>
          <div className="fg" style={{marginBottom:0}}>
            <label className="fl">Hours (+/-)</label>
            <input type="number" className="fi" value={amount} onChange={e=>setAmount(e.target.value)} step="0.5" placeholder="e.g. -8"/>
          </div>
          <div className="fg" style={{marginBottom:0}}>
            <label className="fl">Reason</label>
            <input className="fi" value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. Bank holiday"/>
          </div>
        </div>
        <button className="btn bp bsm" onClick={save} disabled={!amount||!reason.trim()}>Add correction</button>
      </div>
      {existing.length>0&&(
        <div>
          <div style={{fontSize:11.5,fontWeight:700,color:"#374151",marginBottom:8}}>Existing corrections</div>
          <table className="tbl" style={{fontSize:11}}>
            <thead><tr><th>Q</th><th>Amount</th><th>Reason</th><th>By</th><th>Date</th></tr></thead>
            <tbody>
              {existing.map(c=>(
                <tr key={c.id}>
                  <td><span className="badge b-staff">{c.qid}</span></td>
                  <td style={{fontWeight:700,color:c.amount>=0?"#16a34a":"#ef4444"}}>{c.amount>=0?"+":""}{c.amount}h</td>
                  <td>{c.reason}</td>
                  <td style={{color:"#64748b"}}>{c.createdBy}</td>
                  <td style={{color:"#94a3b8",fontSize:10}}>{c.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

export default HoursCorrectModal
