import React, { useState, useMemo } from 'react'
import { LEAVE_T } from '../constants/leaveTypes'
import { fmtISO, fmtDisp } from '../utils/dates'
import Modal from './Modal'

function RequestsView({user,requests,setRequests,addAudit,swaps,setSwaps,rota,setRota,staff}) {
  const isAdmin=user.role==="admin";
  const [tab,setTab]=useState("leave");

  // ── Leave state ──
  const [showForm,setSF]=useState(false);
  const [form,setForm]=useState({type:"SL",startDate:"",endDate:"",reason:""});
  const [actM,setActM]=useState(null); const [note,setNote]=useState("");
  const [filter,setFilter]=useState("all");

  // ── Swap state ──
  const [swapModal,setSwapModal]=useState(false);
  const [swapForm,setSwapForm]=useState({myShift:"",swapKind:"mutual",targetInit:"",theirShift:"",reason:""});
  const [respondModal,setRespondModal]=useState(null); // swap being responded to by staff B
  const [respondNote,setRespondNote]=useState("");
  const [adminSwapM,setAdminSwapM]=useState(null); // swap admin is acting on
  const [adminSwapNote,setAdminSwapNote]=useState("");

  const today=fmtISO(new Date());

  // Badge counts
  const pendingLeaveCount = isAdmin ? requests.filter(r=>r.status==="pending").length : 0;
  const pendingSwapCount  = isAdmin
    ? (swaps||[]).filter(s=>s.status==="accepted_b").length
    : (swaps||[]).filter(s=>s.toInit===user.init&&s.status==="pending_b").length;

  // ── Leave helpers ──
  const submit=()=>{
    if(!form.startDate||!form.endDate) return;
    const r={id:Date.now(),staffInitials:user.init,staffName:user.name,type:form.type,startDate:form.startDate,endDate:form.endDate,reason:form.reason,status:"pending",adminNote:"",createdAt:fmtISO(new Date())};
    setRequests(p=>[...p,r]);addAudit(user.init,"Leave Request",`${user.name} submitted ${LEAVE_T[form.type]?.label}`);
    setForm({type:"SL",startDate:"",endDate:"",reason:""});setSF(false);
  };
  const act=action=>{setRequests(p=>p.map(r=>r.id===actM.id?{...r,status:action,adminNote:note}:r));addAudit(user.init,`Request ${action}`,`${LEAVE_T[actM.type]?.label} for ${actM.staffName}`);setActM(null);setNote("");};
  const visible=(isAdmin?requests:requests.filter(r=>r.staffInitials===user.init)).filter(r=>filter==="all"||r.status===filter);

  // ── Swap helpers ──
  // All future rota shifts for a given person
  const getMyShifts=init=>{
    const res=[];
    Object.entries(rota||{}).forEach(([date,slots])=>{
      if(date<today) return;
      Object.entries(slots).forEach(([slotKey,assigned])=>{
        if(assigned===init) res.push({date,slotKey,label:`${fmtDisp(date)} — ${slotKey}`});
      });
    });
    return res.sort((a,b)=>a.date.localeCompare(b.date));
  };

  const myShifts=useMemo(()=>getMyShifts(user.init),[rota,user.init,today]);
  const theirShifts=useMemo(()=>swapForm.targetInit?getMyShifts(swapForm.targetInit):[],[rota,swapForm.targetInit,today]);
  const activeStaff=(staff||[]).filter(s=>s.active&&s.role==="staff"&&s.init!==user.init);

  // Grade-mismatch warning
  const swapGradeWarning=useMemo(()=>{
    if(!swapForm.myShift||!swapForm.targetInit) return null;
    const me=(staff||[]).find(s=>s.init===user.init);
    const them=(staff||[]).find(s=>s.init===swapForm.targetInit);
    if(!me||!them) return null;
    if(me.grade!==them.grade) return `Grade mismatch: you are ${me.grade}, ${them.name} is ${them.grade}. Admin will need to approve this carefully.`;
    return null;
  },[swapForm.myShift,swapForm.targetInit,staff,user.init]);

  const submitSwap=()=>{
    const [myDate,mySlot]=(swapForm.myShift||"").split("|");
    if(!myDate||!mySlot||!swapForm.targetInit) return;
    const toStaff=(staff||[]).find(s=>s.init===swapForm.targetInit);
    if(!toStaff) return;
    let toDate=myDate,toSlot=null;
    if(swapForm.swapKind==="mutual"){
      const [td,ts]=(swapForm.theirShift||"").split("|");
      if(!td||!ts) return;
      toDate=td; toSlot=ts;
    }
    const sw={
      id:Date.now(),type:"swap",
      fromInit:user.init,fromName:user.name,fromDate:myDate,fromSlot:mySlot,
      toInit:toStaff.init,toName:toStaff.name,toDate,toSlot,
      swapKind:swapForm.swapKind,reason:swapForm.reason,
      status:"pending_b",bNote:"",adminNote:"",
      createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
    };
    setSwaps(p=>[...p,sw]);
    addAudit(user.init,"Swap Request",`${user.name} requested swap with ${toStaff.name}`);
    setSwapModal(false);
    setSwapForm({myShift:"",swapKind:"mutual",targetInit:"",theirShift:"",reason:""});
  };

  const respondToSwap=(sw,action)=>{
    setSwaps(p=>p.map(s=>s.id===sw.id?{...s,status:action,bNote:respondNote,updatedAt:new Date().toISOString()}:s));
    addAudit(user.init,`Swap ${action==="accepted_b"?"accepted":"declined"}`,
      `${user.name} ${action==="accepted_b"?"accepted":"declined"} swap request from ${sw.fromName}`);
    setRespondModal(null); setRespondNote("");
  };

  const applySwapToRota=(sw)=>{
    setRota(prev=>{
      const r=JSON.parse(JSON.stringify(prev));
      r[sw.fromDate]={...(r[sw.fromDate]||{})};
      if(sw.swapKind==="mutual"){
        r[sw.toDate]={...(r[sw.toDate]||{})};
        r[sw.fromDate][sw.fromSlot]=sw.toInit;
        r[sw.toDate][sw.toSlot]=sw.fromInit;
      } else {
        r[sw.fromDate][sw.fromSlot]=sw.toInit;
      }
      return r;
    });
  };

  const handleAdminSwap=(sw,action)=>{
    if(action==="approved") applySwapToRota(sw);
    setSwaps(p=>p.map(s=>s.id===sw.id?{...s,status:action,adminNote:adminSwapNote,updatedAt:new Date().toISOString()}:s));
    addAudit("ADM",`Swap ${action}`,`Swap between ${sw.fromName} and ${sw.toName} — ${action}`);
    setAdminSwapM(null); setAdminSwapNote("");
  };

  const SWAP_STATUS_LABEL={pending_b:"Awaiting peer",accepted_b:"Awaiting admin",declined_b:"Declined",approved:"Approved",rejected:"Rejected"};
  const SWAP_STATUS_CLS={pending_b:"b-pending",accepted_b:"b-pending",declined_b:"b-rejected",approved:"b-approved",rejected:"b-rejected"};

  const SwapRow=({sw,showFrom=true,showTo=true,actions=null})=>(
    <div style={{padding:"10px 0",borderBottom:"1px solid #f1f5f9",display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
      <div style={{flex:"1 1 200px",minWidth:0}}>
        {showFrom&&<div style={{fontSize:12,fontWeight:600}}>{sw.fromName} <span style={{fontWeight:400,color:"#64748b"}}>→ {sw.toName}</span></div>}
        <div style={{fontSize:11,color:"#64748b",marginTop:2}}>
          {sw.swapKind==="mutual"
            ? <>{fmtDisp(sw.fromDate)} <strong>{sw.fromSlot}</strong> ⇄ {fmtDisp(sw.toDate)} <strong>{sw.toSlot}</strong></>
            : <>{fmtDisp(sw.fromDate)} <strong>{sw.fromSlot}</strong> → give away</>}
        </div>
        {sw.reason&&<div style={{fontSize:11,color:"#94a3b8",marginTop:1,fontStyle:"italic"}}>"{sw.reason}"</div>}
      </div>
      <span className={`badge ${SWAP_STATUS_CLS[sw.status]||"b-pending"}`}>{SWAP_STATUS_LABEL[sw.status]||sw.status}</span>
      {actions}
    </div>
  );

  return (
    <div>
      {/* ── Tab header ── */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,gap:10,flexWrap:"wrap"}}>
        <div style={{display:"flex",borderRadius:8,overflow:"hidden",border:"1px solid #e2e8f0"}}>
          <button className={`btn${tab==="leave"?" bp":""}`} style={{borderRadius:0,borderRight:"1px solid #e2e8f0"}}
            onClick={()=>setTab("leave")}>
            📝 Leave Requests
            {pendingLeaveCount>0&&<span className="badge b-pending" style={{marginLeft:6}}>{pendingLeaveCount}</span>}
          </button>
          <button className={`btn${tab==="swaps"?" bp":""}`} style={{borderRadius:0}}
            onClick={()=>setTab("swaps")}>
            🔄 Shift Swaps
            {pendingSwapCount>0&&<span className="badge b-pending" style={{marginLeft:6}}>{pendingSwapCount}</span>}
          </button>
        </div>
        {tab==="swaps"&&!isAdmin&&(
          <button className="btn bp bsm" onClick={()=>setSwapModal(true)}>＋ Request Swap</button>
        )}
      </div>

      {/* ════════════════════ LEAVE TAB ════════════════════ */}
      {tab==="leave"&&(
        <div>
          {!isAdmin&&<div style={{marginBottom:14}}><button className="btn bp" onClick={()=>setSF(!showForm)}>{showForm?"✕ Cancel":"＋ New Request"}</button></div>}
          {showForm&&(
            <div className="card" style={{marginBottom:16}}>
              <div className="ch"><span className="ct">Submit Leave Request</span></div>
              <div className="cb">
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
                  <div className="fg" style={{marginBottom:0}}><label className="fl">Type</label>
                    <select className="fi" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                      {Object.entries(LEAVE_T).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div className="fg" style={{marginBottom:0}}><label className="fl">Start</label><input type="date" className="fi" value={form.startDate} onChange={e=>setForm(f=>({...f,startDate:e.target.value}))}/></div>
                  <div className="fg" style={{marginBottom:0}}><label className="fl">End</label><input type="date" className="fi" value={form.endDate} onChange={e=>setForm(f=>({...f,endDate:e.target.value}))}/></div>
                </div>
                <div className="fg" style={{marginTop:12,marginBottom:0}}><label className="fl">Notes</label><textarea className="fta" value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))}/></div>
                <div style={{marginTop:12}}><button className="btn bp" onClick={submit}>Submit</button></div>
              </div>
            </div>
          )}
          <div className="card">
            <div className="ch">
              <span className="ct">{isAdmin?"All Leave Requests":"My Requests"}</span>
              <div style={{display:"flex",gap:5}}>
                {["all","pending","approved","rejected"].map(f=><button key={f} className={`btn bsm${filter===f?" bp":""}`} onClick={()=>setFilter(f)} style={{textTransform:"capitalize"}}>{f}</button>)}
              </div>
            </div>
            <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr>{isAdmin&&<th>Staff</th>}<th>Type</th><th>From</th><th>To</th><th>Reason</th><th>Status</th>{isAdmin&&<th>Actions</th>}</tr></thead>
              <tbody>
                {visible.length===0?<tr><td colSpan={isAdmin?7:6} style={{textAlign:"center",color:"#94a3b8",padding:24}}>No requests found.</td></tr>
                  :visible.map(r=>{const lt=LEAVE_T[r.type];return(
                    <tr key={r.id}>
                      {isAdmin&&<td style={{fontWeight:600}}>{r.staffName}</td>}
                      <td>{lt&&<span className="chip" style={{background:lt.bg,color:lt.fg,borderColor:lt.bd,fontSize:10.5}}>{lt.label}</span>}</td>
                      <td>{fmtDisp(r.startDate)}</td><td>{fmtDisp(r.endDate)}</td>
                      <td style={{maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#64748b"}}>{r.reason||"—"}</td>
                      <td><span className={`badge b-${r.status}`}>{r.status}</span></td>
                      {isAdmin&&<td>{r.status==="pending"?<div style={{display:"flex",gap:5}}><button className="btn bp bsm" onClick={()=>{setActM(r);setNote("");}}>✓</button><button className="btn bd bsm" onClick={()=>{setActM({...r,_rej:true});setNote("");}}>✗</button></div>:<span style={{fontSize:11,color:"#94a3b8"}}>{r.adminNote||"—"}</span>}</td>}
                    </tr>
                  );})}
              </tbody>
            </table>
            </div>
          </div>
          {actM&&(
            <Modal title={actM._rej?"Reject Request":"Approve Request"} onClose={()=>setActM(null)}
              footer={<><button className="btn bs" onClick={()=>setActM(null)}>Cancel</button><button className={`btn ${actM._rej?"bd":"bp"}`} onClick={()=>act(actM._rej?"rejected":"approved")}>{actM._rej?"Reject":"Approve"}</button></>}>
              <p style={{fontSize:12.5,color:"#374151",marginBottom:13}}><strong>{actM.staffName}</strong> — {LEAVE_T[actM.type]?.label} ({fmtDisp(actM.startDate)} → {fmtDisp(actM.endDate)})</p>
              <div className="fg" style={{marginBottom:0}}><label className="fl">Note for staff</label><textarea className="fta" value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional note..."/></div>
            </Modal>
          )}
        </div>
      )}

      {/* ════════════════════ SWAPS TAB — STAFF VIEW ════════════════════ */}
      {tab==="swaps"&&!isAdmin&&(
        <div>
          {/* Awaiting my response */}
          {(()=>{const awaiting=(swaps||[]).filter(s=>s.toInit===user.init&&s.status==="pending_b");return awaiting.length>0&&(
            <div className="card" style={{marginBottom:14}}>
              <div className="ch"><span className="ct" style={{color:"#d97706"}}>⏳ Awaiting Your Response</span></div>
              <div className="cb">
                {awaiting.map(sw=>(
                  <SwapRow key={sw.id} sw={sw} actions={
                    <div style={{display:"flex",gap:6}}>
                      <button className="btn bp bsm" onClick={()=>{setRespondModal({sw,action:"accepted_b"});setRespondNote("");}}>✓ Accept</button>
                      <button className="btn bd bsm" onClick={()=>{setRespondModal({sw,action:"declined_b"});setRespondNote("");}}>✗ Decline</button>
                    </div>
                  }/>
                ))}
              </div>
            </div>
          );})()}

          {/* My swap requests */}
          <div className="card">
            <div className="ch"><span className="ct">My Swap Requests</span></div>
            <div className="cb">
              {(swaps||[]).filter(s=>s.fromInit===user.init).length===0
                ?<p style={{fontSize:12,color:"#94a3b8"}}>No swap requests made yet. Click "＋ Request Swap" above to start one.</p>
                :(swaps||[]).filter(s=>s.fromInit===user.init).sort((a,b)=>b.id-a.id).map(sw=>(
                  <SwapRow key={sw.id} sw={sw}/>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════ SWAPS TAB — ADMIN VIEW ════════════════════ */}
      {tab==="swaps"&&isAdmin&&(
        <div>
          {/* Awaiting admin approval */}
          {(()=>{const pending=(swaps||[]).filter(s=>s.status==="accepted_b");return pending.length>0&&(
            <div className="card" style={{marginBottom:14}}>
              <div className="ch"><span className="ct" style={{color:"#d97706"}}>⏳ Awaiting Approval</span></div>
              <div className="cb">
                {pending.map(sw=>(
                  <SwapRow key={sw.id} sw={sw} actions={
                    <div style={{display:"flex",gap:6}}>
                      <button className="btn bp bsm" onClick={()=>{setAdminSwapM({sw,action:"approved"});setAdminSwapNote("");}}>✓ Approve</button>
                      <button className="btn bd bsm" onClick={()=>{setAdminSwapM({sw,action:"rejected"});setAdminSwapNote("");}}>✗ Reject</button>
                    </div>
                  }/>
                ))}
              </div>
            </div>
          );})()}

          {/* All swaps */}
          <div className="card">
            <div className="ch"><span className="ct">All Swap Requests</span></div>
            <div className="cb">
              {!(swaps||[]).length
                ?<p style={{fontSize:12,color:"#94a3b8"}}>No swap requests yet.</p>
                :(swaps||[]).slice().sort((a,b)=>b.id-a.id).map(sw=>(
                  <SwapRow key={sw.id} sw={sw}/>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* ════ NEW SWAP MODAL ════ */}
      {swapModal&&(
        <Modal title="Request Shift Swap" onClose={()=>{setSwapModal(false);setSwapForm({myShift:"",swapKind:"mutual",targetInit:"",theirShift:"",reason:""});}}
          footer={<>
            <button className="btn bs" onClick={()=>{setSwapModal(false);setSwapForm({myShift:"",swapKind:"mutual",targetInit:"",theirShift:"",reason:""});}}>Cancel</button>
            <button className="btn bp" onClick={submitSwap}
              disabled={!swapForm.myShift||!swapForm.targetInit||(swapForm.swapKind==="mutual"&&!swapForm.theirShift)}>
              Send Request →
            </button>
          </>}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div className="fg" style={{marginBottom:0}}>
              <label className="fl">Your shift to swap</label>
              <select className="fi" value={swapForm.myShift} onChange={e=>setSwapForm(f=>({...f,myShift:e.target.value,theirShift:""}))}>
                <option value="">— select your shift —</option>
                {myShifts.map(s=><option key={s.date+s.slotKey} value={`${s.date}|${s.slotKey}`}>{s.label}</option>)}
              </select>
              {myShifts.length===0&&<div className="al al-i" style={{marginTop:6,fontSize:11}}>No upcoming shifts found on the published rota.</div>}
            </div>

            <div>
              <label className="fl">Swap type</label>
              <div style={{display:"flex",gap:12,marginTop:4}}>
                {[["mutual","🔄 Mutual swap (trade shifts)"],["giveaway","➡️ Give away (someone covers my shift)"]].map(([v,lbl])=>(
                  <label key={v} style={{display:"flex",alignItems:"center",gap:6,fontSize:12.5,cursor:"pointer"}}>
                    <input type="radio" name="swapKind" value={v} checked={swapForm.swapKind===v} onChange={()=>setSwapForm(f=>({...f,swapKind:v,theirShift:""}))}/>
                    {lbl}
                  </label>
                ))}
              </div>
            </div>

            <div className="fg" style={{marginBottom:0}}>
              <label className="fl">{swapForm.swapKind==="mutual"?"Swap with (staff member)":"Cover by (staff member)"}</label>
              <select className="fi" value={swapForm.targetInit} onChange={e=>setSwapForm(f=>({...f,targetInit:e.target.value,theirShift:""}))}>
                <option value="">— select staff member —</option>
                {activeStaff.map(s=><option key={s.init} value={s.init}>{s.name} ({s.grade})</option>)}
              </select>
            </div>

            {swapForm.swapKind==="mutual"&&swapForm.targetInit&&(
              <div className="fg" style={{marginBottom:0}}>
                <label className="fl">Their shift to swap with</label>
                <select className="fi" value={swapForm.theirShift} onChange={e=>setSwapForm(f=>({...f,theirShift:e.target.value}))}>
                  <option value="">— select their shift —</option>
                  {theirShifts.map(s=><option key={s.date+s.slotKey} value={`${s.date}|${s.slotKey}`}>{s.label}</option>)}
                </select>
                {theirShifts.length===0&&<div className="al al-i" style={{marginTop:6,fontSize:11}}>This person has no upcoming shifts on the rota.</div>}
              </div>
            )}

            {swapGradeWarning&&<div className="al al-w" style={{fontSize:11.5}}>⚠️ {swapGradeWarning}</div>}

            <div className="fg" style={{marginBottom:0}}>
              <label className="fl">Reason / note (optional)</label>
              <textarea className="fta" value={swapForm.reason} onChange={e=>setSwapForm(f=>({...f,reason:e.target.value}))} placeholder="e.g. family event, course, prefer this date…"/>
            </div>
          </div>
        </Modal>
      )}

      {/* ════ STAFF B RESPOND MODAL ════ */}
      {respondModal&&(
        <Modal title={respondModal.action==="accepted_b"?"Accept Swap":"Decline Swap"}
          onClose={()=>{setRespondModal(null);setRespondNote("");}}
          footer={<>
            <button className="btn bs" onClick={()=>{setRespondModal(null);setRespondNote("");}}>Cancel</button>
            <button className={`btn ${respondModal.action==="accepted_b"?"bp":"bd"}`}
              onClick={()=>respondToSwap(respondModal.sw,respondModal.action)}>
              {respondModal.action==="accepted_b"?"✓ Accept Swap":"✗ Decline Swap"}
            </button>
          </>}>
          <div style={{marginBottom:12,padding:12,background:"#f8fafc",borderRadius:8,fontSize:12.5}}>
            <strong>{respondModal.sw.fromName}</strong> wants to swap:<br/>
            <span style={{color:"#64748b"}}>
              {respondModal.sw.swapKind==="mutual"
                ?<>Their {fmtDisp(respondModal.sw.fromDate)} <strong>{respondModal.sw.fromSlot}</strong> ⇄ your {fmtDisp(respondModal.sw.toDate)} <strong>{respondModal.sw.toSlot}</strong></>
                :<>They want you to cover their {fmtDisp(respondModal.sw.fromDate)} <strong>{respondModal.sw.fromSlot}</strong></>}
            </span>
            {respondModal.sw.reason&&<div style={{marginTop:6,fontStyle:"italic",color:"#94a3b8"}}>"{respondModal.sw.reason}"</div>}
          </div>
          <div className="fg" style={{marginBottom:0}}><label className="fl">Your note (optional)</label>
            <textarea className="fta" value={respondNote} onChange={e=>setRespondNote(e.target.value)} placeholder="Optional message…"/>
          </div>
        </Modal>
      )}

      {/* ════ ADMIN APPROVE/REJECT MODAL ════ */}
      {adminSwapM&&(
        <Modal title={adminSwapM.action==="approved"?"Approve Swap":"Reject Swap"}
          onClose={()=>{setAdminSwapM(null);setAdminSwapNote("");}}
          footer={<>
            <button className="btn bs" onClick={()=>{setAdminSwapM(null);setAdminSwapNote("");}}>Cancel</button>
            <button className={`btn ${adminSwapM.action==="approved"?"bp":"bd"}`}
              onClick={()=>handleAdminSwap(adminSwapM.sw,adminSwapM.action)}>
              {adminSwapM.action==="approved"?"✓ Approve & apply to rota":"✗ Reject"}
            </button>
          </>}>
          <div style={{marginBottom:12,padding:12,background:"#f8fafc",borderRadius:8,fontSize:12.5}}>
            <strong>{adminSwapM.sw.fromName}</strong> ⇄ <strong>{adminSwapM.sw.toName}</strong><br/>
            <span style={{color:"#64748b",fontSize:11.5}}>
              {adminSwapM.sw.swapKind==="mutual"
                ?<>{fmtDisp(adminSwapM.sw.fromDate)} <strong>{adminSwapM.sw.fromSlot}</strong> ⇄ {fmtDisp(adminSwapM.sw.toDate)} <strong>{adminSwapM.sw.toSlot}</strong></>
                :<>{fmtDisp(adminSwapM.sw.fromDate)} <strong>{adminSwapM.sw.fromSlot}</strong> → {adminSwapM.sw.toName} covers</>}
            </span>
            {adminSwapM.sw.bNote&&<div style={{marginTop:6,fontSize:11,color:"#64748b"}}>Note from {adminSwapM.sw.toName}: "{adminSwapM.sw.bNote}"</div>}
            {adminSwapM.action==="approved"&&<div className="al al-s" style={{marginTop:10,fontSize:11.5}}>✓ The rota will be updated automatically on approval.</div>}
          </div>
          <div className="fg" style={{marginBottom:0}}><label className="fl">Admin note (optional)</label>
            <textarea className="fta" value={adminSwapNote} onChange={e=>setAdminSwapNote(e.target.value)} placeholder="Optional note for both staff…"/>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default RequestsView
