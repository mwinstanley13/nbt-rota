import React, { useState } from 'react'
import { QUARTERS } from '../constants/quarters.js'
import { DEFAULT_SHIFT_TIMES, getShiftDuration, GRADE_KEYS, SHIFT_FIELDS } from '../constants/rules.js'
import { effGrade } from '../utils/rota.js'
import Modal from './Modal.jsx'

function RotaConfig({wteConfig, setWteConfig, staffHours, setStaffHours, staff, addAudit, shiftTimes, setShiftTimes, staffShiftTimes, setStaffShiftTimes, trainingDays, setTrainingDays, staffShiftOverrides, setShiftOverrides}) {
  const [tab, setTab] = useState("fte"); // "fte" | "hours" | "targets" | "shifttimes" | "training"
  const [targetModal, setTargetModal] = useState(null); // {init, name, grade, qid}
  const activeStaff = staff.filter(s => s.role==="staff" && s.active);
  const [tdDate,setTdDate]  = useState("");
  const [tdType,setTdType]  = useState("SpR");
  const [tdNote,setTdNote]  = useState("");
  const [stStaff,setStStaff] = useState(""); // for per-staff shift time overrides
  const [stSlot,setStSlot]   = useState("E1");

  const setFTE = (grade, field, val) => {
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) return;
    setWteConfig(prev => ({ ...prev, [grade]: { ...(prev[grade]||{}), [field]: num } }));
  };

  const setFTEHours = (grade, val) => {
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0) return;
    setWteConfig(prev => ({ ...prev, [grade]: { ...(prev[grade]||{}), hoursPerWeek: num } }));
  };

  const setStaffWTEVal = (init, grade, qid, wteVal) => {
    if (wteVal === "") {
      setStaffHours(prev => { const n={...prev,[init]:{...(prev[init]||{})}}; delete n[init][qid]; return n; });
      return;
    }
    const wte = parseFloat(wteVal);
    if (isNaN(wte) || wte < 0 || wte > 2) return;
    const cfg = wteConfig[effGrade({grade})] || wteConfig["ST4+"] || {};
    const full = cfg.hoursPerQuarter ?? Math.round((cfg.hoursPerWeek || 0) * 13 * 10) / 10;
    const hours = Math.round(wte * full * 10) / 10;
    setStaffHours(prev => ({ ...prev, [init]: { ...(prev[init]||{}), [qid]: hours } }));
    addAudit("ADM", "WTE Override", `${init} ${qid} → ${wte} WTE (${hours}h)`);
  };

  const SLOT_KEYS_ALL = ["E1","E2","E3","E4","M1","M2","M3","L1","L2","L3","L4","WE1","WE2","WE3","WL1","WL2","N1","N2","SN","AN","SL","RESEARCH","FELLOW","MILITARY"];

  return (
    <div>
      <div style={{display:"flex",gap:7,marginBottom:18,flexWrap:"wrap"}}>
        {[["fte","FTE Targets"],["hours","Staff WTE"],["targets","Shift Targets"],["shifttimes","Shift Times"],["training","Training Days"]].map(([k,lbl])=>(
          <button key={k} className={`btn${tab===k?" bp":" bs"}`} onClick={()=>setTab(k)}>{lbl}</button>
        ))}
      </div>

      {tab==="fte"&&(
        <div>
          <div className="al al-i" style={{marginBottom:14}}>
            Set the <strong>full-time equivalent</strong> targets for each grade. Individual targets are scaled by each person's effective hours.
          </div>
          <div className="card">
            <div style={{overflowX:"auto"}}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Grade</th><th>hrs/wk</th><th>Net hrs/qtr</th>
                    {SHIFT_FIELDS.map(f=><th key={f.key}>{f.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {GRADE_KEYS.map(grade=>{
                    const cfg = wteConfig[grade] || {};
                    return (
                      <tr key={grade}>
                        <td style={{fontWeight:700}}>{grade}</td>
                        <td><input type="number" className="fi" style={{width:65,padding:"3px 6px"}} value={cfg.hoursPerWeek||""} onChange={e=>setFTEHours(grade,e.target.value)} step="0.25" min="0"/></td>
                        <td><input type="number" className="fi" style={{width:75,padding:"3px 6px"}} value={cfg.hoursPerQuarter||""} onChange={e=>setFTE(grade,"hoursPerQuarter",e.target.value)} step="0.5" min="0"/></td>
                        {SHIFT_FIELDS.map(f=>(
                          <td key={f.key}><input type="number" className="fi" style={{width:55,padding:"3px 6px",textAlign:"center"}} value={cfg[f.key]??""} onChange={e=>setFTE(grade,f.key,e.target.value)} min="0" step="1"/></td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab==="hours"&&(
        <div>
          <div className="al al-i" style={{marginBottom:14}}>
            Set each person's WTE (whole-time equivalent) per quarter. <strong>1.0 = full-time</strong>, 0.5 = half-time, etc. Targets are scaled proportionally from the FTE config. Leave blank to use 1.0 (full-time).
          </div>
          <div className="card">
            <div style={{overflowX:"auto"}}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Grade</th>
                    <th style={{color:"#64748b",fontSize:11}}>FT hrs/qtr</th>
                    {QUARTERS.map(q=><th key={q.id}>{q.id} WTE</th>)}
                    <th style={{color:"#6366f1"}}>Annual hrs</th>
                  </tr>
                </thead>
                <tbody>
                  {activeStaff.map(s=>{
                    const sh = staffHours[s.init] || {};
                    const cfg = wteConfig[effGrade(s)] || wteConfig["ST4+"] || {};
                    const fullQtr = cfg.hoursPerQuarter ?? Math.round((cfg.hoursPerWeek || 0) * 13 * 10) / 10;
                    const annual = QUARTERS.reduce((sum,q)=>{
                      const storedHrs = sh[q.id] != null ? sh[q.id] : fullQtr;
                      return sum + storedHrs;
                    }, 0);
                    return (
                      <tr key={s.id}>
                        <td style={{fontWeight:600}}>{s.name}{s.military&&<span className="badge b-admin" style={{marginLeft:4,fontSize:9,padding:"1px 4px"}}>MIL</span>}</td>
                        <td style={{color:"#64748b"}}>{s.grade}</td>
                        <td style={{textAlign:"center",fontSize:11,color:"#94a3b8"}}>{fullQtr}</td>
                        {QUARTERS.map(q=>{
                          const storedHrs = sh[q.id];
                          const displayWTE = storedHrs != null && fullQtr > 0 ? Math.round(storedHrs / fullQtr * 100) / 100 : "";
                          return (
                            <td key={q.id} style={{padding:"4px 6px"}}>
                              <input type="number" className="fi"
                                style={{width:68,padding:"4px 7px",textAlign:"center",
                                  color: storedHrs != null ? "#1e293b" : "#94a3b8"}}
                                value={displayWTE}
                                placeholder="1.0"
                                step="0.1" min="0" max="2"
                                onChange={e=>setStaffWTEVal(s.init,s.grade,q.id,e.target.value)}/>
                            </td>
                          );
                        })}
                        <td style={{textAlign:"center",fontWeight:700,color:"#6366f1",fontSize:12}}>
                          {Math.round(annual * 10) / 10}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab==="targets"&&staffShiftOverrides!==undefined&&(
        <div>
          <div className="al al-i" style={{marginBottom:14}}>
            Override the calculated shift targets for a specific person and quarter. The calculated value is shown in brackets. Leave a reason for the override.
          </div>
          <div className="card">
            <div style={{overflowX:"auto"}}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Name</th><th>Grade</th>
                    {QUARTERS.map(q=><th key={q.id}>{q.id}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {activeStaff.map(s=>{
                    return (
                      <tr key={s.id}>
                        <td style={{fontWeight:600}}>{s.name}</td>
                        <td style={{color:"#64748b"}}>{s.grade}{s.military&&<span className="badge b-admin" style={{marginLeft:4,fontSize:9,padding:"1px 4px"}}>MIL</span>}</td>
                        {QUARTERS.map(q=>{
                          const ov = staffShiftOverrides?.[s.init]?.[q.id];
                          const hasOv = ov && SHIFT_FIELDS.some(f=>ov[f.key]!=null);
                          return (
                            <td key={q.id} style={{padding:"4px 8px"}}>
                              <button className={`btn bsm ${hasOv?"bp":"bs"}`} style={{fontSize:10}}
                                onClick={()=>setTargetModal({init:s.init,name:s.name,grade:s.grade,military:s.military,qid:q.id})}>
                                {hasOv?"Overridden":"Set"}
                              </button>
                              {ov?.reason&&<div style={{fontSize:9,color:"#94a3b8",marginTop:2,maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={ov.reason}>{ov.reason}</div>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {targetModal&&(()=>{
            const {init,name,grade,military,qid} = targetModal;
            const ov = staffShiftOverrides?.[init]?.[qid] || {};
            const cfg = wteConfig[effGrade({grade,military})] || wteConfig["ST4+"] || {};
            const sh = staffHours[init] || {};
            const fullQtr = cfg.hoursPerQuarter ?? Math.round((cfg.hoursPerWeek||0)*13*10)/10;
            const storedHrs = sh[qid] != null ? sh[qid] : fullQtr;
            const wte = fullQtr > 0 ? storedHrs / fullQtr : 1.0;
            const calcTarget = f => Math.round((cfg[f]||0)*wte*10)/10;
            const saveOv = (field, val) => {
              const num = val===""||val==null ? null : parseFloat(val);
              if (num!==null && isNaN(num)) return;
              setShiftOverrides(prev=>{
                const next={...prev,[init]:{...(prev[init]||{}),[qid]:{...(prev[init]?.[qid]||{}),[field]:num}}};
                return next;
              });
            };
            const saveReason = reason => {
              setShiftOverrides(prev=>({...prev,[init]:{...(prev[init]||{}),[qid]:{...(prev[init]?.[qid]||{}),reason}}}));
            };
            const clearAll = () => {
              setShiftOverrides(prev=>{const n={...prev};if(n[init]){const q2={...n[init]};delete q2[qid];n[init]=q2;}return n;});
              setTargetModal(null);
              addAudit("ADM","Shift Override Cleared",`${name} ${qid} overrides removed`);
            };
            return (
              <Modal title={`Shift Targets — ${name} ${qid}`} onClose={()=>setTargetModal(null)}
                footer={<>
                  <button className="btn bd bsm" onClick={clearAll}>Clear All Overrides</button>
                  <button className="btn bs" onClick={()=>setTargetModal(null)}>Close</button>
                  <button className="btn bp" onClick={()=>{addAudit("ADM","Shift Override",`${name} ${qid} targets updated`);setTargetModal(null);}}>Save</button>
                </>}>
                <div className="al al-i" style={{marginBottom:12,fontSize:12}}>
                  Override any shift count target for <strong>{name}</strong> in <strong>{qid}</strong>. Leave blank to use the calculated value (shown in grey).
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  {SHIFT_FIELDS.map(f=>(
                    <div key={f.key} className="fg">
                      <label className="fl">{f.label} <span style={{color:"#94a3b8",fontWeight:400}}>(calc: {calcTarget(f.key)})</span></label>
                      <input type="number" className="fi" min="0" step="1"
                        value={ov[f.key]??""} placeholder={String(calcTarget(f.key))}
                        onChange={e=>saveOv(f.key,e.target.value)}/>
                    </div>
                  ))}
                </div>
                <div className="fg">
                  <label className="fl">Reason for override</label>
                  <input className="fi" value={ov.reason||""} onChange={e=>saveReason(e.target.value)} placeholder="e.g. Reduced duties, on secondment…"/>
                </div>
              </Modal>
            );
          })()}
        </div>
      )}

      {tab==="shifttimes"&&shiftTimes&&(
        <div>
          <div className="al al-i" style={{marginBottom:14}}>Default shift start/end times used for rest-rule calculations in the AI rota generator. <strong>All times in 24hr format.</strong></div>
          <div className="card" style={{marginBottom:14}}>
            <div className="ch"><span className="ct">Default Slot Times</span></div>
            <div className="cb">
              <table className="tbl">
                <thead><tr><th>Slot</th><th>Start</th><th>End</th><th style={{color:"#94a3b8"}}>Duration</th></tr></thead>
                <tbody>{SLOT_KEYS_ALL.map(sk=>{
                  const t = shiftTimes[sk] || DEFAULT_SHIFT_TIMES[sk] || {start:"",end:""};
                  const dur = getShiftDuration(sk,null,shiftTimes,{});
                  return (
                    <tr key={sk}>
                      <td style={{fontWeight:700,color:"#475569"}}>{sk}</td>
                      <td><input className="fi" style={{width:80,padding:"3px 7px"}} value={t.start} onChange={e=>setShiftTimes(p=>({...p,[sk]:{...(p[sk]||{}),start:e.target.value,end:(p[sk]||{}).end||t.end}}))} placeholder="HH:MM"/></td>
                      <td><input className="fi" style={{width:80,padding:"3px 7px"}} value={t.end}   onChange={e=>setShiftTimes(p=>({...p,[sk]:{...(p[sk]||{}),end:e.target.value,start:(p[sk]||{}).start||t.start}}))} placeholder="HH:MM"/></td>
                      <td style={{color:"#94a3b8",fontSize:12}}>{dur>0?`${dur}h`:""}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </div>
          {staffShiftTimes&&setStaffShiftTimes&&(
            <div className="card">
              <div className="ch"><span className="ct">Per-Staff Time Overrides</span><span style={{fontSize:11,color:"#94a3b8",marginLeft:8}}>Override individual timings for a specific person</span></div>
              <div className="cb">
                <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end",marginBottom:16}}>
                  <div className="fg" style={{margin:0}}>
                    <label className="fl">Staff</label>
                    <select className="fi" style={{padding:"5px 8px",minWidth:160}} value={stStaff} onChange={e=>setStStaff(e.target.value)}>
                      <option value="">Select…</option>
                      {activeStaff.map(s=><option key={s.id} value={s.init}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="fg" style={{margin:0}}>
                    <label className="fl">Slot</label>
                    <select className="fi" style={{padding:"5px 8px"}} value={stSlot} onChange={e=>setStSlot(e.target.value)}>
                      {SLOT_KEYS_ALL.map(sk=><option key={sk}>{sk}</option>)}
                    </select>
                  </div>
                </div>
                {stStaff&&(()=>{
                  const overrides = staffShiftTimes[stStaff]||{};
                  const existingKeys = Object.keys(overrides);
                  return (
                    <div>
                      {existingKeys.length===0&&<p style={{fontSize:12.5,color:"#94a3b8"}}>No overrides set for {staff.find(s=>s.init===stStaff)?.name||stStaff}.</p>}
                      {existingKeys.map(sk=>{
                        const t=overrides[sk];
                        return (
                          <div key={sk} style={{display:"flex",gap:10,alignItems:"center",padding:"6px 0",borderBottom:"1px solid #f1f5f9"}}>
                            <span style={{width:50,fontWeight:700,fontSize:13}}>{sk}</span>
                            <input className="fi" style={{width:75,padding:"3px 7px"}} value={t.start} onChange={e=>setStaffShiftTimes(p=>({...p,[stStaff]:{...(p[stStaff]||{}),[sk]:{...t,start:e.target.value}}}))} placeholder="HH:MM"/>
                            <span style={{color:"#94a3b8"}}>→</span>
                            <input className="fi" style={{width:75,padding:"3px 7px"}} value={t.end}   onChange={e=>setStaffShiftTimes(p=>({...p,[stStaff]:{...(p[stStaff]||{}),[sk]:{...t,end:e.target.value}}}))} placeholder="HH:MM"/>
                            <button className="btn bs bsm" style={{color:"#ef4444",borderColor:"#ef4444"}} onClick={()=>setStaffShiftTimes(p=>{const copy={...p};const sc={...(copy[stStaff]||{})};delete sc[sk];return{...copy,[stStaff]:sc};})}>✕</button>
                          </div>
                        );
                      })}
                      <button className="btn bs bsm" style={{marginTop:10}} onClick={()=>{
                        const defaults=shiftTimes[stSlot]||DEFAULT_SHIFT_TIMES[stSlot]||{start:"08:00",end:"16:30"};
                        setStaffShiftTimes(p=>({...p,[stStaff]:{...(p[stStaff]||{}),[stSlot]:{...defaults}}}));
                      }}>＋ Add {stSlot} override for {staff.find(s=>s.init===stStaff)?.name||stStaff}</button>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {tab==="training"&&trainingDays!==undefined&&(
        <div>
          <div className="al al-i" style={{marginBottom:14}}>Add SpR regional training days or ACP training days. These highlight the whole day on the rota calendar and availability calendar.</div>
          <div className="card" style={{marginBottom:14}}>
            <div className="ch"><span className="ct">Add Training Day</span></div>
            <div className="cb">
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
                <div className="fg" style={{margin:0}}><label className="fl">Date</label><input type="date" className="fi" style={{padding:"5px 8px"}} value={tdDate} onChange={e=>setTdDate(e.target.value)}/></div>
                <div className="fg" style={{margin:0}}><label className="fl">Type</label>
                  <select className="fi" style={{padding:"5px 8px"}} value={tdType} onChange={e=>setTdType(e.target.value)}>
                    <option value="SpR">SpR Regional Training</option>
                    <option value="ACP">ACP Training Day</option>
                  </select>
                </div>
                <div className="fg" style={{margin:0,flex:1,minWidth:160}}><label className="fl">Note (optional)</label><input className="fi" style={{padding:"5px 8px"}} value={tdNote} onChange={e=>setTdNote(e.target.value)} placeholder="e.g. Bristol Royal Infirmary"/></div>
                <button className="btn bp" style={{height:34,alignSelf:"flex-end"}} disabled={!tdDate} onClick={()=>{
                  if(!tdDate) return;
                  setTrainingDays(p=>[...p,{id:Date.now(),date:tdDate,type:tdType,note:tdNote}]);
                  setTdDate(""); setTdNote("");
                }}>＋ Add</button>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="ch"><span className="ct">All Training Days</span></div>
            <div className="cb">
              {trainingDays.length===0&&<p style={{fontSize:12.5,color:"#94a3b8"}}>No training days added yet.</p>}
              <table className="tbl">
                <thead><tr><th>Date</th><th>Day</th><th>Type</th><th>Note</th><th>Action</th></tr></thead>
                <tbody>{[...trainingDays].sort((a,b)=>a.date.localeCompare(b.date)).map(td=>(
                  <tr key={td.id}>
                    <td style={{fontWeight:600}}>{td.date}</td>
                    <td style={{color:"#64748b"}}>{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(td.date).getDay()]}</td>
                    <td><span style={{padding:"2px 8px",borderRadius:4,fontWeight:700,fontSize:11,background:td.type==="SpR"?"#fef9c3":"#f3e8ff",color:td.type==="SpR"?"#713f12":"#6b21a8"}}>{td.type}</span></td>
                    <td style={{fontSize:12,color:"#64748b"}}>{td.note||"—"}</td>
                    <td><button className="btn bs bsm" style={{color:"#ef4444",borderColor:"#ef4444"}} onClick={()=>setTrainingDays(p=>p.filter(x=>x.id!==td.id))}>Remove</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default RotaConfig
