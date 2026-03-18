import React, { useState, useEffect } from 'react'
import { SLOTS } from '../constants/slots.js'
import { QUARTERS } from '../constants/quarters.js'
import { INIT_GEN_RULES, DEFAULT_SHIFT_TIMES } from '../constants/rules.js'
import { normaliseAvailEntry } from '../utils/availability.js'
import { lsGet, lsSave, LS_PFX } from '../utils/storage.js'

function AIRotaView({user,staff,rota,setRota,availability,leaveEntries,quarterStatus,wteConfig,staffHours,genRules,setGenRules,shiftTimes,addAudit,quarters,activeYearId}) {
  const [tab,setTab]           = useState("rules");
  const [selQ,setSelQ]         = useState("Q1");
  const [slotFilter,setSF]     = useState("all");
  const [overwrite,setOW]      = useState("fill");
  const [generating,setGen]    = useState(false);
  const [genError,setErr]      = useState(null);
  const [rotaDraft,setDraft]   = useState(()=>lsGet('rotaDraft_'+activeYearId,null));
  const [conflicts,setCfls]    = useState(()=>lsGet('rotaDraftCfls_'+activeYearId,[]));
  const [accepted,setAccepted] = useState(false);
  useEffect(()=>{ rotaDraft ? lsSave('rotaDraft_'+activeYearId,rotaDraft) : localStorage.removeItem(LS_PFX+'rotaDraft_'+activeYearId); },[rotaDraft]);
  useEffect(()=>{ lsSave('rotaDraftCfls_'+activeYearId,conflicts); },[conflicts]);

  const activeStaff = staff.filter(s=>s.role==="staff"&&s.active);
  const GRADES = ["ST4+","ST3","ACP","tACP","Military"];
  const ALL_SLOTS = ["E1","E2","E3","E4","M1","M2","M3","L1","L2","L3","L4","WE1","WE2","WE3","WL1","WL2","N1","N2","SN","AN"];
  const DAYS_OF_WEEK = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

  const fmtDate = d => { const dt=new Date(d); return dt.toLocaleDateString("en-GB",{weekday:"short",day:"2-digit",month:"short"}); };
  const isNightSl = sk => ["N1","N2","SN","AN"].includes(sk);
  const isWESl    = sk => ["WE1","WE2","WE3","WL1","WL2"].includes(sk);
  const dayTypeFn = d => {
    const dow = new Date(d).getDay();
    if (dow===0||dow===6) return "weekend";
    if (dow===1) return "monday";
    if (dow===5) return "friday";
    return "weekday_other";
  };

  const rules = genRules || INIT_GEN_RULES;

  const setSlotGrade = (slot, grade, checked) => {
    const current = (rules.slotGrades||{})[slot]||[];
    const updated  = checked ? [...new Set([...current,grade])] : current.filter(g=>g!==grade);
    setGenRules(prev=>({...prev, slotGrades:{...(prev.slotGrades||{}),[slot]:updated}}));
  };

  const setMinStaff = (dayType, slot, checked) => {
    const current = (rules.minStaffing||{})[dayType]||[];
    const updated  = checked ? [...new Set([...current,slot])] : current.filter(s=>s!==slot);
    setGenRules(prev=>({...prev, minStaffing:{...(prev.minStaffing||{}),[dayType]:updated}}));
  };

  const setRule = (field, val) => setGenRules(prev=>({...prev,[field]:val}));

  const generate = async () => {
    setGen(true); setErr(null); setDraft(null); setCfls([]); setAccepted(false);
    try {
      const q = (quarters||QUARTERS).find(x=>x.id===selQ) || (quarters||QUARTERS)[0];
      if (!q) throw new Error("Quarter not found");

      const dates = [];
      let cur = new Date(q.start);
      const end = new Date(q.end);
      while (cur <= end) { dates.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }

      const filteredDates = slotFilter==="all" ? dates :
        slotFilter==="nights" ? dates :
        dates.filter(d=>{ const dow=new Date(d).getDay(); return dow===0||dow===5||dow===6; });

      const avMap = {};
      activeStaff.forEach(s=>{
        const blocked=[],earlyOnly=[],midOnly=[],lateOnly=[],nightOnly=[];
        filteredDates.forEach(d=>{
          const raw = (availability[s.init]||{})[d];
          const e = normaliseAvailEntry(raw);
          const base = e?.base;
          if(!base||base==="ANY") return;
          if(["UNAVAILABLE","SL","MILITARY","PHEM"].includes(base)) blocked.push(d);
          else if(base==="EARLY") earlyOnly.push(d);
          else if(base==="MID")   midOnly.push(d);
          else if(base==="LATE")  lateOnly.push(d);
          else if(base==="NIGHT") nightOnly.push(d);
        });
        avMap[s.init]={blocked,earlyOnly,midOnly,lateOnly,nightOnly};
      });

      const targets = {};
      activeStaff.forEach(s=>{
        const cfg = wteConfig[s.grade] || wteConfig["ST4+"] || {};
        const fullHrs = cfg.hoursPerQuarter || Math.round((cfg.hoursPerWeek||45.25) * 13 * 10) / 10;
        const storedHrs = ((staffHours||{})[s.init]||{})[selQ];
        const wte = (storedHrs != null && fullHrs > 0) ? Math.min(2, Math.max(0, storedHrs / fullHrs)) : 1.0;
        targets[s.init]={
          nights:         Math.round((cfg.nights||0)*wte),
          weekends:       Math.round((cfg.weekends||0)*wte),
          earlies:        Math.round((cfg.earlies||0)*wte),
          mids:           Math.round((cfg.mids||0)*wte),
          lates:          Math.round((cfg.lates||0)*wte),
          hoursPerQuarter:Math.round(fullHrs * wte),
        };
      });

      const payload = {
        dates: filteredDates,
        dayTypes: Object.fromEntries(filteredDates.map(d=>[d,dayTypeFn(d)])),
        slots: rules.slotGrades||{},
        minStaffing: rules.minStaffing||{},
        staff: activeStaff.map(s=>({init:s.init,name:s.name,grade:s.grade,nightBlockPref:s.nightBlockPref||"any"})),
        availability: avMap,
        targets,
        contractRules: {
          maxShiftHours:         rules.maxShiftHours||13,
          minRestHours:          rules.minRestHours||11,
          maxConsecNights:       rules.maxConsecNights||4,
          maxConsecLongDays:     rules.maxConsecLongDays||5,
          maxConsecWorkingDays:  rules.maxConsecWorkingDays||7,
          postNightRestHours:    rules.postNightRestHours||46,
          maxConsecWeekends:     rules.maxConsecWeekends||4,
        },
        shiftTimes: shiftTimes||DEFAULT_SHIFT_TIMES,
        slotFilter,
      };

      const resp = await fetch("/.netlify/functions/generate-rota",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(payload),
      });
      if(!resp.ok) {
        const errData = await resp.json().catch(()=>({error:`HTTP ${resp.status}`}));
        const dbg = errData.debug ? ` | HTTP ${errData.debug.httpStatus} | type: ${errData.debug.errorType} | key: ${errData.debug.keyPrefix}` : "";
        throw new Error((errData.error||`HTTP ${resp.status}`) + dbg);
      }
      const {rota:draft,conflicts:cfls} = await resp.json();
      setDraft(draft||{}); setCfls(cfls||[]); setTab("draft");
    } catch(e) {
      setErr(e.message);
    } finally {
      setGen(false);
    }
  };

  const clearQuarter = () => {
    const q = (quarters||QUARTERS).find(x=>x.id===selQ);
    if (!q) return;
    if (!window.confirm(`Clear ALL existing rota assignments for ${selQ} (${q.label})? This cannot be undone.`)) return;
    const dates = [];
    let cur = new Date(q.start); const end = new Date(q.end);
    while (cur <= end) { dates.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }
    setRota(prev=>{ const next={...prev}; dates.forEach(d=>{ delete next[d]; }); return next; });
    addAudit(user.init,"Rota Cleared",`All assignments cleared for ${selQ}`);
  };

  const acceptDraft = () => {
    if(!rotaDraft) return;
    setRota(prev=>{
      const next={...prev};
      if(overwrite==="replace"){
        const q=(quarters||QUARTERS).find(x=>x.id===selQ);
        if(q){let c=new Date(q.start);const e=new Date(q.end);while(c<=e){delete next[c.toISOString().slice(0,10)];c.setDate(c.getDate()+1);}}
      }
      Object.entries(rotaDraft).forEach(([date,slots])=>{
        const existing = overwrite==="replace" ? {} : (prev[date]||{});
        if(overwrite==="overwrite"){
          const merged={...existing};
          Object.entries(slots).forEach(([sk,init])=>{
            if(!init) return;
            Object.keys(merged).forEach(other=>{ if(merged[other]===init) delete merged[other]; });
            merged[sk]=init;
          });
          next[date]=merged;
        } else {
          const existingInits=new Set(Object.values(existing).filter(Boolean));
          const merged={...existing};
          Object.entries(slots).forEach(([sk,init])=>{
            if(!init||merged[sk]||existingInits.has(init)) return;
            merged[sk]=init;
            existingInits.add(init);
          });
          next[date]=merged;
        }
      });
      return next;
    });
    const filled=Object.values(rotaDraft).reduce((s,sl)=>s+Object.keys(sl).length,0);
    addAudit(user.init,"AI Rota",`Draft accepted: ${selQ}, ${Object.keys(rotaDraft).length} days, ${filled} assignments, ${conflicts.length} conflicts`);
    setDraft(null); setCfls([]); setAccepted(true); setTab("generate");
    localStorage.removeItem(LS_PFX+'rotaDraft_'+activeYearId); localStorage.removeItem(LS_PFX+'rotaDraftCfls_'+activeYearId);
  };

  const errCount   = conflicts.filter(c=>c.severity==="error").length;
  const warnCount  = conflicts.filter(c=>c.severity==="warning").length;

  return (
    <div>
      <div className="card" style={{marginBottom:18}}>
        <div className="ch">
          <span className="ct">⚙️ Auto Rota Builder</span>
          <span style={{fontSize:11,color:"#94a3b8",marginLeft:8}}>Generates a draft rota from availability + your rules using the deterministic scheduler</span>
        </div>
        <div className="cb" style={{paddingBottom:0}}>
          <div className="ai-tab-bar">
            {[["rules","⚙️ Rules"],["generate","▶ Generate"],["draft",`📋 Draft${rotaDraft?` (${Object.keys(rotaDraft).length}d)`:""}`]].map(([k,lbl])=>(
              <button key={k} className={`ai-tab${tab===k?" act":""}`} onClick={()=>setTab(k)}>{lbl}</button>
            ))}
          </div>
        </div>
      </div>

      {tab==="rules"&&(
        <div>
          <div className="card" style={{marginBottom:14}}>
            <div className="ch">
              <span className="ct">Slot Grade Requirements</span>
              <span style={{fontSize:11,color:"#94a3b8",marginLeft:8}}>Which grades may be assigned to each slot</span>
              <button className="btn bsm" style={{marginLeft:"auto",fontSize:11,padding:"3px 10px"}}
                onClick={()=>{if(window.confirm("Reset all slot grades back to the system defaults?"))setGenRules(prev=>({...prev,slotGrades:{...INIT_GEN_RULES.slotGrades}}));}}>
                ↺ Reset to defaults
              </button>
            </div>
            <div className="cb" style={{overflowX:"auto"}}>
              <table className="tbl" style={{minWidth:520}}>
                <thead><tr><th style={{textAlign:"left"}}>Slot</th><th style={{textAlign:"left"}}>Group</th>{GRADES.map(g=><th key={g}>{g}</th>)}</tr></thead>
                <tbody>{ALL_SLOTS.map(sk=>{
                  const grp=SLOTS.find(s=>s.key===sk)?.grp||"";
                  const allowed=(rules.slotGrades||{})[sk]||[];
                  return (
                    <tr key={sk}>
                      <td style={{fontWeight:700,color:"#334155"}}>{sk}</td>
                      <td style={{fontSize:11,color:"#94a3b8"}}>{grp}</td>
                      {GRADES.map(g=>(
                        <td key={g} style={{textAlign:"center"}}>
                          <input type="checkbox" checked={allowed.includes(g)} onChange={e=>setSlotGrade(sk,g,e.target.checked)}/>
                        </td>
                      ))}
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{marginBottom:14}}>
            <div className="ch"><span className="ct">Minimum Daily Staffing</span><span style={{fontSize:11,color:"#94a3b8",marginLeft:8}}>Slots that must be filled each day (AI prioritises these)</span></div>
            <div className="cb">
              {[["monday","Monday"],["weekday_other","Tue – Thu"],["friday","Friday"],["weekend","Weekend / BH"]].map(([dt,lbl])=>{
                const req=(rules.minStaffing||{})[dt]||[];
                const relevant=dt==="weekend"?["WE1","WE2","WE3","WL1","WL2","N1","N2","SN","AN"]:["E1","E2","E3","E4","M1","M2","M3","L1","L2","L3","L4","N1","N2","SN","AN"];
                return (
                  <div key={dt} style={{marginBottom:12}}>
                    <div style={{fontWeight:700,fontSize:12.5,color:"#334151",marginBottom:6}}>{lbl}</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {relevant.map(sk=>(
                        <label key={sk} style={{display:"flex",alignItems:"center",gap:4,fontSize:12,cursor:"pointer",padding:"3px 8px",borderRadius:5,background:req.includes(sk)?"#dcfce7":"#f8fafc",border:`1px solid ${req.includes(sk)?"#86efac":"#e2e8f0"}`}}>
                          <input type="checkbox" checked={req.includes(sk)} onChange={e=>setMinStaff(dt,sk,e.target.checked)} style={{marginRight:2}}/>{sk}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="ch"><span className="ct">JD Contract Rules</span><span style={{fontSize:11,color:"#94a3b8",marginLeft:8}}>Junior Doctors contract — used by AI and validation layer</span></div>
            <div className="cb">
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10}}>
                {[
                  ["maxShiftHours","Max shift length (hrs)",1,24],
                  ["minRestHours","Min rest between shifts (hrs)",1,24],
                  ["maxConsecNights","Max consecutive nights",1,7],
                  ["postNightRestHours","Post-night rest required (hrs)",24,96],
                  ["maxConsecLongDays","Max consec long days (>10h)",1,10],
                  ["maxConsecWorkingDays","Max consecutive working days",1,14],
                  ["maxConsecWeekends","Max consecutive weekends",1,8],
                ].map(([field,label,mn,mx])=>(
                  <div key={field} className="fg" style={{margin:0}}>
                    <label className="fl">{label}</label>
                    <input type="number" className="fi" style={{padding:"5px 8px"}}
                      value={rules[field]??""} min={mn} max={mx} step="1"
                      onChange={e=>setRule(field,parseInt(e.target.value)||0)}/>
                  </div>
                ))}
              </div>
              <div style={{marginTop:14,padding:10,background:"#f8fafc",borderRadius:7,fontSize:11.5,color:"#64748b"}}>
                <strong>Fixed rules always applied:</strong> Each person works at most one slot per day. Night slots are grade-restricted (N1/N2: ST4+; SN: ST3; AN: ACP/tACP). Blocked days (SL, Military, PHEM, Unavailable) are never scheduled.
              </div>
            </div>
          </div>
        </div>
      )}

      {tab==="generate"&&(
        <div className="card">
          <div className="ch"><span className="ct">Generate Rota Draft</span></div>
          <div className="cb">
            {accepted&&<div className="al al-ok" style={{marginBottom:14}}>✓ Draft accepted and applied to the rota for {selQ}.</div>}
            {genError&&<div className="al al-e" style={{marginBottom:14}}>Error: {genError}</div>}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14,marginBottom:18}}>
              <div className="fg" style={{margin:0}}>
                <label className="fl">Quarter</label>
                <select className="fi" style={{padding:"6px 10px"}} value={selQ} onChange={e=>{setSelQ(e.target.value);setAccepted(false);}}>
                  {(quarters||QUARTERS).map(q=><option key={q.id} value={q.id}>{q.label}</option>)}
                </select>
              </div>
              <div className="fg" style={{margin:0}}>
                <label className="fl">Slots to fill</label>
                <select className="fi" style={{padding:"6px 10px"}} value={slotFilter} onChange={e=>setSF(e.target.value)}>
                  <option value="all">All slots (Early, Mid, Late, Night, W/E)</option>
                  <option value="weekends">Weekends + Nights only</option>
                  <option value="nights">Nights only (N1, N2, SN, AN)</option>
                </select>
              </div>
              <div className="fg" style={{margin:0}}>
                <label className="fl">When accepting draft</label>
                <select className="fi" style={{padding:"6px 10px"}} value={overwrite} onChange={e=>setOW(e.target.value)}>
                  <option value="fill">Fill empty slots only (keep existing)</option>
                  <option value="overwrite">Overwrite — draft replaces conflicts</option>
                  <option value="replace">Replace all — clear quarter first</option>
                </select>
              </div>
            </div>

            <div style={{background:"#f8fafc",borderRadius:8,padding:14,marginBottom:14,fontSize:12.5,color:"#64748b"}}>
              <strong>How it works:</strong> The scheduler reads all staff availability for {selQ}, assigns night blocks first (hard-capped to individual WTE targets), then fills day shifts to balance hours. Review the Draft tab — conflicts are highlighted — then Accept to apply.
              {overwrite==="fill"&&<span> Existing slot assignments are preserved; AI only fills empty slots.</span>}
              {overwrite==="overwrite"&&<span style={{color:"#d97706"}}> ⚠ Draft takes priority over any existing assignments on the same slot.</span>}
              {overwrite==="replace"&&<span style={{color:"#dc2626"}}> ⛔ Replace mode: ALL existing {selQ} assignments are wiped before applying the draft.</span>}
            </div>

            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:8}}>
              <button className="btn bp" style={{padding:"10px 24px",fontSize:14}} onClick={generate} disabled={generating}>
                {generating?<><span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>⟳</span> Generating…</>:"⚙️ Generate Draft"}
              </button>
              <button className="btn bs" style={{padding:"10px 16px",color:"#ef4444",borderColor:"#fca5a5"}} onClick={clearQuarter}
                title={`Clear all existing ${selQ} rota assignments`}>
                🗑 Clear {selQ} rota
              </button>
            </div>
            {generating&&<p style={{marginTop:10,fontSize:12,color:"#64748b"}}>Running deterministic scheduler — this usually takes a few seconds.</p>}
          </div>
        </div>
      )}

      {tab==="draft"&&rotaDraft&&(
        <div>
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            <div style={{flex:1,padding:12,borderRadius:8,background:errCount>0?"#fee2e2":"#dcfce7",border:`1px solid ${errCount>0?"#fca5a5":"#86efac"}`}}>
              <div style={{fontWeight:700,fontSize:13,color:errCount>0?"#7f1d1d":"#14532d"}}>{errCount>0?`⛔ ${errCount} Error${errCount>1?"s":""}`:warnCount>0?`⚠️ ${warnCount} Warning${warnCount>1?"s":""}`:errCount===0&&warnCount===0?"✅ No conflicts found":""}</div>
              <div style={{fontSize:11.5,color:errCount>0?"#991b1b":"#166534",marginTop:2}}>{errCount>0?"Review errors before accepting.":warnCount>0?"Warnings are preference mismatches — safe to accept.":"All assignments pass grade, availability, and contract checks."}</div>
            </div>
            <div style={{padding:12,borderRadius:8,background:"#f1f5f9",border:"1px solid #e2e8f0",minWidth:140}}>
              <div style={{fontWeight:700,fontSize:13,color:"#334155"}}>{Object.keys(rotaDraft).length} days</div>
              <div style={{fontSize:11.5,color:"#64748b"}}>{Object.values(rotaDraft).reduce((s,sl)=>s+Object.keys(sl).length,0)} total assignments</div>
            </div>
          </div>

          {conflicts.length>0&&(
            <div className="card" style={{marginBottom:14}}>
              <div className="ch"><span className="ct">Conflicts</span></div>
              <div className="cb" style={{overflowX:"auto"}}>
                <table className="tbl">
                  <thead><tr><th>Date</th><th>Slot</th><th>Person</th><th>Rule</th><th>Severity</th></tr></thead>
                  <tbody>{conflicts.map((c,i)=>(
                    <tr key={i}>
                      <td style={{fontWeight:600,whiteSpace:"nowrap"}}>{fmtDate(c.date)}</td>
                      <td><span style={{fontWeight:700}}>{c.slot}</span></td>
                      <td><span style={{background:"#e0e7ff",color:"#3730a3",padding:"1px 6px",borderRadius:4,fontWeight:700,fontSize:11}}>{c.init}</span></td>
                      <td style={{fontSize:12,color:"#64748b"}}>{c.rule}</td>
                      <td><span style={{padding:"2px 7px",borderRadius:4,fontWeight:700,fontSize:11,background:c.severity==="error"?"#fee2e2":"#fef3c7",color:c.severity==="error"?"#7f1d1d":"#78350f"}}>{c.severity}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card" style={{marginBottom:14}}>
            <div className="ch"><span className="ct">Draft Rota Preview</span>
              <div style={{display:"flex",gap:8,fontSize:11}}>
                <span style={{padding:"1px 6px",borderRadius:3,background:"#dcfce7",color:"#166534"}}>■</span><span style={{color:"#64748b"}}>New</span>
                <span style={{padding:"1px 6px",borderRadius:3,background:"#dbeafe",color:"#1e40af"}}>■</span><span style={{color:"#64748b"}}>Existing</span>
                <span style={{padding:"1px 6px",borderRadius:3,background:"#fee2e2",color:"#7f1d1d"}}>■</span><span style={{color:"#64748b"}}>Conflict</span>
              </div>
            </div>
            <div className="cb" style={{overflowX:"auto",maxHeight:520,overflowY:"auto"}}>
              <table style={{borderCollapse:"collapse",minWidth:600,fontSize:11.5}}>
                <thead style={{position:"sticky",top:0,zIndex:2,background:"#f8fafc"}}>
                  <tr>
                    <th style={{padding:"6px 10px",textAlign:"left",border:"1px solid #e2e8f0",fontWeight:700,fontSize:11,color:"#475569",minWidth:90}}>Date</th>
                    {ALL_SLOTS.map(sk=><th key={sk} style={{padding:"4px 6px",border:"1px solid #e2e8f0",fontWeight:700,fontSize:10,color:"#94a3b8",minWidth:36,textAlign:"center"}}>{sk}</th>)}
                  </tr>
                </thead>
                <tbody>{Object.keys(rotaDraft).sort().map(date=>{
                  const daySlots=rotaDraft[date]||{};
                  const existSlots=rota[date]||{};
                  const conflictSlots=new Set(conflicts.filter(c=>c.date===date).map(c=>c.slot));
                  return (
                    <tr key={date} style={{background:"white"}}>
                      <td style={{padding:"4px 8px",border:"1px solid #f1f5f9",fontWeight:600,fontSize:11,whiteSpace:"nowrap",color:"#374151"}}>{fmtDate(date)}</td>
                      {ALL_SLOTS.map(sk=>{
                        const init=daySlots[sk];
                        const wasExisting=existSlots[sk]&&overwrite==="fill";
                        const isCfl=conflictSlots.has(sk);
                        return (
                          <td key={sk} style={{padding:"3px 4px",border:"1px solid #f1f5f9",textAlign:"center"}}>
                            {init&&<span className={isCfl?"draft-cell-conflict":wasExisting?"draft-cell-exist":"draft-cell-new"}>{init}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </div>

          <div style={{display:"flex",gap:10}}>
            <button className="btn bp" style={{padding:"10px 22px"}} onClick={acceptDraft}>✓ Accept Draft</button>
            <button className="btn bs" style={{padding:"10px 22px"}} onClick={()=>{setDraft(null);setCfls([]);setTab("generate");}}>✗ Discard</button>
            {errCount>0&&<span style={{fontSize:12,color:"#94a3b8",alignSelf:"center"}}>You can still accept with errors — review and fix in Rota Builder after.</span>}
          </div>
        </div>
      )}

      {tab==="draft"&&!rotaDraft&&(
        <div className="card"><div className="cb" style={{textAlign:"center",padding:40,color:"#94a3b8"}}>No draft generated yet. Go to the Generate tab to create one.</div></div>
      )}
    </div>
  );
}

export default AIRotaView
