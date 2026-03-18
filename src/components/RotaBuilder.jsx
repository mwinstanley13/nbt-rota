import React, { useState, useMemo } from 'react'
import { BH, QUARTERS } from '../constants/quarters'
import { SLOTS } from '../constants/slots'
import { LEAVE_T } from '../constants/leaveTypes'
import { fmtISO, fmtDisp, getDayName, isWeekend, getSlotsForDay, getDatesInRange } from '../utils/dates'
import { getAvailEntry, isSlotPreferred } from '../utils/availability'
import Modal from './Modal'
import StaffStatsSidebar from './StaffStatsSidebar'

function RotaBuilder({rota,setRota,leaveEntries,setLeaveEntries,staff,dayNotes,setDayNotes,availability,addAudit,currentUser,wteConfig,staffHours,hoursCorrections,setHoursCorrections,trainingDays,staffShiftOverrides,constraintRules,sysRules,genRules,rotaPublished,setRotaPublished,quarters}) {
  const [selQ,setSelQ]=useState("Q1");
  const [assignModal,setAM]=useState(null); // {date, slotKey}
  const [leaveModal,setLM]=useState(null);  // {date}
  const [noteModal,setNM]=useState(null);
  const [noteText,setNT]=useState("");
  const [leaveForm,setLF]=useState({init:"",type:"SL",note:""});
  const today=fmtISO(new Date());

  const activeQs = quarters || QUARTERS;
  const q=activeQs.find(x=>x.id===selQ)||activeQs[0];

  const publishQuarter = (qid) => {
    const ts = new Date().toISOString();
    setRotaPublished(p=>({...p,[qid]:{ts,by:currentUser.init,byName:currentUser.name}}));
    addAudit(currentUser.init,"Rota Published",`${qid} rota published by ${currentUser.name}`);
  };
  const unpublishQuarter = (qid) => {
    setRotaPublished(p=>({...p,[qid]:null}));
    addAudit(currentUser.init,"Rota Unpublished",`${qid} rota unpublished by ${currentUser.name}`);
  };
  const quarterDates=useMemo(()=>getDatesInRange(q.start,q.end),[q.start,q.end]);
  const activeStaff=staff.filter(s=>s.role==="staff"&&s.active);
  const tdMap=useMemo(()=>Object.fromEntries((trainingDays||[]).map(t=>[t.date,t])),[trainingDays]);

  const assignSlot=(date,slotKey,init)=>{
    setRota(p=>({...p,[date]:{...(p[date]||{}),[slotKey]:init||null}}));
    addAudit(currentUser.init,"Slot Assigned",`${slotKey} on ${date} → ${init||"cleared"}`);
    setAM(null);
  };

  const addLeave=()=>{
    if(!leaveForm.init||!leaveForm.type) return;
    setLeaveEntries(p=>({...p,[leaveModal.date]:[...(p[leaveModal.date]||[]),{...leaveForm,id:Date.now()}]}));
    addAudit(currentUser.init,"Leave Added",`${leaveForm.init} ${LEAVE_T[leaveForm.type]?.label} on ${leaveModal.date}`);
    setLM(null); setLF({init:"",type:"SL",note:""});
  };
  const removeLeave=(date,id)=>{
    setLeaveEntries(p=>({...p,[date]:(p[date]||[]).filter(x=>x.id!==id)}));
  };

  const saveNote=()=>{
    noteText.trim()?setDayNotes(p=>({...p,[noteModal]:noteText.trim()})):setDayNotes(p=>{const n={...p};delete n[noteModal];return n;});
    setNM(null);
  };

  // For a given date+slot, get assigned staff
  const getAssigned=(date,slotKey)=>(rota[date]||{})[slotKey];

  // Get availability status of a staff member on a date
  const getAvail = (init, date) => getAvailEntry(availability, init, date);

  // Precompute double-booked inits per date (staff in >1 slot same day)
  const doubleBooks = useMemo(() => {
    const out = {};
    quarterDates.forEach(date => {
      const vals = Object.values(rota[date]||{}).filter(Boolean);
      const seen = {};
      vals.forEach(init => { seen[init] = (seen[init]||0) + 1; });
      const dupes = new Set(Object.entries(seen).filter(([,c])=>c>1).map(([init])=>init));
      if (dupes.size) out[date] = dupes;
    });
    return out;
  }, [quarterDates, rota]);

  // Warn: assigned staff has any system-rule conflict on a given date
  const hasConflict = (init, date) => {
    if (!init) return false;
    const av = getAvail(init, date);
    if (sysRules?.unavailConflict?.enabled !== false && (av?.base==="UNAVAILABLE"||av?.base==="SL"||av?.base==="MILITARY"||av?.base==="PHEM")) return true;
    if (sysRules?.leaveEntryClash?.enabled !== false) {
      const avBase = av?.base;
      // Only flag if availability isn't already blocking (avoids double-counting)
      if (avBase !== "UNAVAILABLE" && avBase !== "SL" && avBase !== "MILITARY" && avBase !== "PHEM") {
        if ((leaveEntries[date]||[]).some(e=>e.init===init)) return true;
      }
    }
    if (sysRules?.doubleBook?.enabled !== false && doubleBooks[date]?.has(init)) return true;
    return false;
  };

  // Check if assignment violates a constraint rule
  const hasRuleWarning = (init, date, slotKey) => {
    if (!init || !constraintRules?.length) return false;
    const sl = SLOTS.find(s=>s.key===slotKey);
    const dow = new Date(date+"T00:00:00").toLocaleDateString("en-GB",{weekday:"long"});
    return constraintRules.some(r=>r.active&&r.init===init&&(
      (r.type==="avoid_day"&&r.dayOfWeek===dow)||
      (r.type==="avoid_slot_group"&&sl&&r.slotGroup===sl.grp)
    ));
  };

  return (
    <div>

      {/* Publication status bar */}
      {setRotaPublished&&<div style={{background:"white",border:"1px solid #e2e8f0",borderRadius:10,padding:"12px 16px",marginBottom:14,display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:12,fontWeight:700,color:"#475569",marginRight:4}}>📢 Rota Publication:</span>
        {activeQs.map(qv=>{
          const pub=rotaPublished?.[qv.id];
          return (
            <div key={qv.id} style={{display:"flex",alignItems:"center",gap:6,background:pub?"#f0fdf4":"#f8fafc",border:`1px solid ${pub?"#86efac":"#e2e8f0"}`,borderRadius:7,padding:"5px 10px"}}>
              <span style={{fontSize:11,fontWeight:700,color:pub?"#166534":"#64748b"}}>{qv.id}</span>
              {pub
                ? <><span style={{fontSize:10,color:"#166534"}}>✅ Published {new Date(pub.ts).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</span>
                    <button onClick={()=>unpublishQuarter(qv.id)} style={{fontSize:10,background:"none",border:"1px solid #fca5a5",borderRadius:5,padding:"1px 7px",color:"#ef4444",cursor:"pointer",fontWeight:600}}>Unpublish</button></>
                : <><span style={{fontSize:10,color:"#94a3b8"}}>Draft</span>
                    <button onClick={()=>publishQuarter(qv.id)} style={{fontSize:10,background:"#10b981",border:"none",borderRadius:5,padding:"2px 9px",color:"white",cursor:"pointer",fontWeight:700}}>Publish</button></>
              }
            </div>
          );
        })}
      </div>}

      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:6}}>
          {activeQs.map(qv=>(
            <button key={qv.id} onClick={()=>setSelQ(qv.id)}
              className={`btn${selQ===qv.id?" bp":" bs"}`} style={{fontSize:12,padding:"5px 12px"}}>
              {qv.label}
            </button>
          ))}
        </div>
        <div className="al al-i" style={{margin:0,padding:"6px 11px",fontSize:11.5}}>
          💡 Click a slot cell to assign · Click a date to add a note · <strong style={{color:"#ef4444"}}>Red</strong> = conflict · <strong style={{color:"#f97316"}}>Orange</strong> = grade mismatch · <strong style={{color:"#f59e0b"}}>Amber</strong> = rule warning · 🟢 = preferred
        </div>
      </div>

      <div className="bld-layout">
      <div className="bld-wrap" style={{flex:1,minWidth:0,overflowY:"auto",maxHeight:"calc(100vh - 180px)"}}>
        <table className="bld-tbl">
          <thead>
            <tr>
              <th className="bld-date-col" style={{background:"#f8fafc",position:"sticky",left:0,zIndex:5}}>Date</th>
              {/* Group headers */}
              {SLOTS.map(sl=>(
                <th key={sl.key} style={{background:sl.bg,color:sl.fg,borderColor:sl.bd,padding:"4px 3px",minWidth:44}}>
                  <div style={{fontSize:8.5,fontWeight:800}}>{sl.key}</div>
                  {sl.hdr&&<div style={{fontSize:7,opacity:.8,marginTop:1}}>{sl.hdr}</div>}
                </th>
              ))}
              <th style={{background:"#fef9c3",color:"#713f12",fontSize:9,fontWeight:700,minWidth:120,padding:"4px 6px"}}>Leave / Away</th>
            </tr>
          </thead>
          <tbody>
            {quarterDates.map(date=>{
              const we=isWeekend(date),isBH=!!BH[date],isToday=date===today;
              const dateSlots=getSlotsForDay(date);
              const dayLeave=leaveEntries[date]||[];
              const note=dayNotes[date];
              const conflicts=SLOTS.map(sl=>{const init=getAssigned(date,sl.key);return init&&hasConflict(init,date)?init:null;}).filter(Boolean);
              const td=tdMap[date];
              return (
                <tr key={date} className={we?"we-row":""} style={td?{background:td.type==="SpR"?"rgba(254,240,138,.25)":"rgba(243,232,255,.25)"}:undefined}>
                  <td className={`bld-date-col${we?" we-row":""}${isBH?" bh-row":""}${isToday?" td-row":""}`}
                    style={{cursor:"pointer"}} onClick={()=>{setNM(date);setNT(dayNotes[date]||"");}}>
                    <div style={{fontSize:12,fontWeight:700,color:isToday?"#065f46":we?"#6d28d9":"#0d1b2a"}}>{getDayName(date)} {new Date(date+"T00:00:00").getDate()}</div>
                    <div style={{fontSize:9.5,color:"#94a3b8"}}>{new Date(date+"T00:00:00").toLocaleDateString("en-GB",{month:"short",year:"numeric"})}</div>
                    {isBH&&<div style={{fontSize:8,background:"#fde047",color:"#713f12",padding:"1px 4px",borderRadius:2,marginTop:2}}>{BH[date]}</div>}
                    {td&&<div style={{fontSize:8,background:td.type==="SpR"?"#fef08a":"#e9d5ff",color:td.type==="SpR"?"#713f12":"#6b21a8",padding:"1px 4px",borderRadius:2,marginTop:2,fontWeight:700}}>{td.type} Training</div>}
                    {note&&<div style={{fontSize:8,color:"#92400e",marginTop:2}}>📌 {note.slice(0,20)}</div>}
                    {conflicts.length>0&&<div style={{fontSize:8,color:"#ef4444",fontWeight:700,marginTop:2}}>⚠️ Conflict</div>}
                  </td>
                  {SLOTS.map(sl=>{
                    const applicable=dateSlots.some(s=>s.key===sl.key);
                    const init=getAssigned(date,sl.key);
                    const av = init ? getAvail(init, date) : null;
                    const staffMember = init ? activeStaff.find(s=>s.init===init) : null;
                    const conflict = init && hasConflict(init, date);
                    const gradeWarn = !conflict && init && sysRules?.gradeMismatch?.enabled !== false && staffMember && genRules?.slotGrades?.[sl.key] && !genRules.slotGrades[sl.key].includes(staffMember.grade);
                    const ruleWarn = !conflict && !gradeWarn && hasRuleWarning(init, date, sl.key);
                    const pref = init && av?.base && !conflict
                      ? isSlotPreferred(availability, init, date, sl.key, staffMember?.grade)
                      : false;
                    const availCount = applicable ? activeStaff.filter(s=>isSlotPreferred(availability,s.init,date,sl.key,s.grade)).length : 0;
                    if(!applicable) return <td key={sl.key} className="slot-cell disabled"><span style={{fontSize:9,color:"#e2e8f0"}}>—</span></td>;
                    return (
                      <td key={sl.key} className="slot-cell" style={{border:conflict?"2px solid #ef4444":gradeWarn?"2px solid #f97316":ruleWarn?"2px solid #f59e0b":"",background:init?sl.bg+"80":"white"}}
                        onClick={()=>setAM({date,slotKey:sl.key})}>
                        {init?(
                          <span className="slot-chip" style={{background:sl.bg,color:conflict?"#ef4444":sl.fg,borderColor:conflict?"#ef4444":gradeWarn?"#f97316":ruleWarn?"#f59e0b":sl.bd,border:conflict?"2px solid #ef4444":gradeWarn?"2px solid #f97316":ruleWarn?"2px solid #f59e0b":"1px solid "+sl.bd}}>
                            {init.slice(0,4)}
                            {gradeWarn && <span className="avail-dot" style={{background:"#f97316"}} title="Grade mismatch"/>}
                            {ruleWarn && !gradeWarn && <span className="avail-dot" style={{background:"#f59e0b"}} title="Rule warning"/>}
                            {pref && !ruleWarn && !gradeWarn && <span className="avail-dot" style={{ background: sl.fg || "#94a3b8" }} title="preferred" />}
                          </span>
                        ):<span className="slot-empty"/>}
                        {availCount>0&&<div style={{fontSize:8,background:"#dcfce7",color:"#14532d",borderRadius:8,padding:"0 3px",marginTop:1,lineHeight:"12px"}}>{availCount}✓</div>}
                      </td>
                    );
                  })}
                  <td style={{padding:"4px 6px",minWidth:120,verticalAlign:"top"}}>
                    {dayLeave.map(e=>{const lt=LEAVE_T[e.type];return lt?(
                      <div key={e.id} className="leave-row" style={{background:lt.bg,color:lt.fg,marginBottom:2}}>
                        <span>{e.init}</span><span style={{fontSize:8.5}}>{lt.abbr}</span>
                        <span style={{cursor:"pointer",fontSize:10,opacity:.7}} onClick={()=>removeLeave(date,e.id)}>×</span>
                      </div>
                    ):null;})}
                    <button className="btn bs bsm" style={{fontSize:9.5,padding:"2px 7px",marginTop:dayLeave.length>0?3:0}} onClick={()=>{setLM({date});setLF({init:"",type:"SL",note:""});}}>+ Leave</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <StaffStatsSidebar
        staff={activeStaff}
        rota={rota}
        wteConfig={wteConfig}
        staffHours={staffHours}
        selQ={selQ}
        leaveEntries={leaveEntries}
        hoursCorrections={hoursCorrections}
        setHoursCorrections={setHoursCorrections}
        addAudit={addAudit}
        currentUser={currentUser}
        availability={availability}
        staffShiftOverrides={staffShiftOverrides}
      />
      </div>

      {/* Assign slot modal */}
      {assignModal&&(()=>{
        const sl=SLOTS.find(s=>s.key===assignModal.slotKey);
        const cur=getAssigned(assignModal.date,assignModal.slotKey);
        const daySlots=getSlotsForDay(assignModal.date);
        const alreadyAssigned=new Set(Object.values(rota[assignModal.date]||{}).filter(Boolean));
        return (
          <Modal title={`Assign — ${sl?.label} · ${getDayName(assignModal.date)} ${fmtDisp(assignModal.date)}`} onClose={()=>setAM(null)}
            footer={<><button className="btn bs" onClick={()=>setAM(null)}>Cancel</button>{cur&&<button className="btn bd" onClick={()=>assignSlot(assignModal.date,assignModal.slotKey,null)}>Clear</button>}</>}>
            {BH[assignModal.date]&&<div className="al al-w" style={{marginBottom:12}}>🎉 Bank Holiday: {BH[assignModal.date]}</div>}
            {cur&&<div className="al al-i" style={{marginBottom:12}}>Currently: <strong>{staff.find(s=>s.init===cur)?.name||cur}</strong></div>}
            {(()=>{
              const groups={avail:[],none:[],blocked:[]};
              activeStaff.forEach(s=>{
                const av = getAvail(s.init, assignModal.date);
                const avBase = av?.base;
                const isBlocked = avBase==="UNAVAILABLE"||avBase==="SL"||avBase==="MILITARY";
                const isPreferred = !isBlocked && isSlotPreferred(availability, s.init, assignModal.date, assignModal.slotKey, s.grade);
                if(isPreferred) groups.avail.push(s);
                else if(isBlocked) groups.blocked.push(s);
                else groups.none.push(s);
              });
              const sort=arr=>[...arr].sort((a,b)=>a.name.localeCompare(b.name));
              const renderStaff=(arr,groupLabel)=>{
                if(arr.length===0) return null;
                return (
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:9,fontWeight:700,letterSpacing:.8,textTransform:"uppercase",color:"#94a3b8",marginBottom:5}}>{groupLabel}</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
                      {arr.map(s=>{
                        const av = getAvail(s.init, assignModal.date);
                        const avBase = av?.base;
                        const isBlocked = avBase==="UNAVAILABLE"||avBase==="SL"||avBase==="MILITARY";
                        const isPreferred = !isBlocked && isSlotPreferred(availability, s.init, assignModal.date, assignModal.slotKey, s.grade);
                        const busy = alreadyAssigned.has(s.init) && s.init !== cur;
                        const isSelected = s.init === cur;
                        return (
                          <button key={s.id} onClick={()=>!busy&&assignSlot(assignModal.date,assignModal.slotKey,s.init)}
                            style={{
                              padding:"8px 10px",
                              border:`2px solid ${isSelected?"#10b981":isPreferred?"#86efac":isBlocked?"#fca5a5":"#e2e8f0"}`,
                              borderLeft:`4px solid ${isSelected?"#10b981":isPreferred?"#22c55e":isBlocked?"#ef4444":"#e2e8f0"}`,
                              borderRadius:8,
                              background:isSelected?"#f0fdf4":isPreferred?"#f0fdf4":isBlocked?"#fff5f5":busy?"#f9f9f9":"white",
                              cursor:busy?"not-allowed":"pointer",
                              opacity:isBlocked?0.65:busy?0.5:1,
                              textAlign:"left",
                              transition:"all .1s"
                            }}>
                            <div style={{fontSize:11.5,fontWeight:700,color:isSelected?"#065f46":"#0d1b2a"}}>{s.name.split(" ")[0]} <span style={{opacity:.6,fontSize:10}}>{s.name.split(" ")[1]?.[0]}.</span></div>
                            <div style={{fontSize:10,color:"#64748b",marginTop:2,display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                              {s.grade}
                              {isPreferred&&<span style={{padding:"1px 4px",borderRadius:3,background:"#d1fae5",color:"#065f46",fontWeight:700,fontSize:9}}>✓ avail</span>}
                              {isBlocked&&avBase&&<span style={{padding:"1px 4px",borderRadius:3,background:"#fee2e2",color:"#7f1d1d",fontWeight:700,fontSize:9}}>{avBase}</span>}
                              {busy&&<span style={{fontSize:9,color:"#94a3b8"}}>on shift</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              };
              return (
                <div>
                  {renderStaff(sort(groups.avail),"✓ Available for this slot")}
                  {renderStaff(sort(groups.none),"No preference set")}
                  {renderStaff(sort(groups.blocked),"Unavailable / Leave")}
                </div>
              );
            })()}
          </Modal>
        );
      })()}

      {/* Leave modal */}
      {leaveModal&&(
        <Modal title={`Add Leave — ${getDayName(leaveModal.date)} ${fmtDisp(leaveModal.date)}`} onClose={()=>setLM(null)}
          footer={<><button className="btn bs" onClick={()=>setLM(null)}>Cancel</button><button className="btn bp" onClick={addLeave}>Add</button></>}>
          <div className="fg"><label className="fl">Staff Member</label>
            <select className="fi" value={leaveForm.init} onChange={e=>setLF(f=>({...f,init:e.target.value}))}>
              <option value="">Select staff...</option>{activeStaff.map(s=><option key={s.id} value={s.init}>{s.name}</option>)}
            </select>
          </div>
          <div className="fg"><label className="fl">Leave Type</label>
            <select className="fi" value={leaveForm.type} onChange={e=>setLF(f=>({...f,type:e.target.value}))}>
              {Object.entries(LEAVE_T).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="fg" style={{marginBottom:0}}><label className="fl">Note (optional)</label><input className="fi" value={leaveForm.note} onChange={e=>setLF(f=>({...f,note:e.target.value}))}/></div>
        </Modal>
      )}

      {/* Note modal */}
      {noteModal&&(
        <Modal title={`📌 Day Note — ${fmtDisp(noteModal)}`} onClose={()=>setNM(null)}
          footer={<><button className="btn bs" onClick={()=>setNM(null)}>Cancel</button><button className="btn bp" onClick={saveNote}>Save</button></>}>
          <textarea className="fta" value={noteText} onChange={e=>setNT(e.target.value)} placeholder="e.g. Short staffed — cover needed" style={{minHeight:80}}/>
        </Modal>
      )}
    </div>
  );
}

export default RotaBuilder
