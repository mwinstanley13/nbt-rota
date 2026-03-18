import React, { useState, useMemo } from 'react'
import { QUARTERS } from '../constants/quarters'
import { SLOTS } from '../constants/slots'
import { LEAVE_T } from '../constants/leaveTypes'
import { DEFAULT_SYS_RULES } from '../constants/rules'
import { fmtISO, fmtShort, getDayName, getDatesInRange } from '../utils/dates'
import { getAvailEntry } from '../utils/availability'
import Modal from './Modal'

const DOW_FULL = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const GRP_LABELS = {EARLY:"Early",MID:"Mid",LATE:"Late",WE_EARLY:"W/E Early",WE_LATE:"W/E Late",NIGHT1:"Night (N1)",NIGHT2:"Night (N2)",ST3_NIGHT:"Night (ST3)",ACP_NIGHT:"Night (ACP)"};

function ConflictsView({rota, leaveEntries, availability, staff, quarters, addAudit, currentUser, constraintRules, setConstraintRules, sysRules, setSysRules, genRules}) {
  const [tab, setTab] = useState("conflicts");
  const [addForm, setAddForm] = useState(null); // null | "new"
  const [form, setForm] = useState({init:"",type:"avoid_day",dayOfWeek:"Monday",slotGroup:"EARLY",note:"",severity:"warn"});
  const [selQ, setSelQ] = useState("Q1");

  const qs = quarters || QUARTERS;
  const activeStaff = staff.filter(s=>s.role==="staff"&&s.active);
  const selQDef = qs.find(q=>q.id===selQ)||qs[0];
  const rotaDates = selQDef ? getDatesInRange(selQDef.start, selQDef.end) : [];

  // Detect live conflicts across all enabled system rules
  const conflicts = useMemo(() => {
    const out = [];
    // Precompute double books per date
    const doubleBookMap = {};
    rotaDates.forEach(date => {
      const vals = Object.values(rota[date]||{}).filter(Boolean);
      const seen = {};
      vals.forEach(init => { seen[init] = (seen[init]||0) + 1; });
      const dupes = new Set(Object.entries(seen).filter(([,c])=>c>1).map(([i])=>i));
      if (dupes.size) doubleBookMap[date] = dupes;
    });

    rotaDates.forEach(date => {
      const dayRota = rota[date] || {};
      Object.entries(dayRota).forEach(([slotKey, init]) => {
        if (!init) return;
        const avEntry = getAvailEntry(availability, init, date);
        const base = avEntry?.base;
        const lv = (leaveEntries[date]||[]).find(e=>e.init===init);
        const sm = activeStaff.find(s=>s.init===init);
        const sl = SLOTS.find(s=>s.key===slotKey);

        const addConflict = (reason, severity) => {
          out.push({date, slotKey, init, name:sm?.name||init, grade:sm?.grade||"", slotLabel:sl?.label||slotKey, bg:sl?.bg||"#f1f5f9", fg:sl?.fg||"#374151", reason, severity:severity||"error"});
        };

        if (sysRules?.unavailConflict?.enabled !== false) {
          if (base === "UNAVAILABLE") addConflict("Marked unavailable");
          else if (base === "SL") addConflict("Availability: Study Leave");
          else if (base === "MILITARY") addConflict("Availability: Military");
          else if (base === "PHEM") addConflict("Availability: PHEM");
        }
        const availBlocked = base==="UNAVAILABLE"||base==="SL"||base==="MILITARY"||base==="PHEM";
        if (sysRules?.leaveEntryClash?.enabled !== false && lv && !availBlocked) {
          addConflict(`Leave entry: ${LEAVE_T[lv.type]?.label || lv.type}`, "warn");
        }
        if (sysRules?.gradeMismatch?.enabled !== false && sm && genRules?.slotGrades?.[slotKey] && !genRules.slotGrades[slotKey].includes(sm.grade)) {
          addConflict(`Grade mismatch: ${sm.grade} in ${sl?.label||slotKey}`, "warn");
        }
        if (sysRules?.doubleBook?.enabled !== false && doubleBookMap[date]?.has(init)) {
          addConflict("Double booked (multiple slots same day)");
        }
      });
    });
    out.sort((a,b)=>a.date.localeCompare(b.date)||a.slotKey.localeCompare(b.slotKey));
    return out;
  }, [rotaDates, rota, leaveEntries, availability, sysRules, genRules]);

  // Rule violations: constraint rule + actual assignment
  const ruleViolations = useMemo(() => {
    const out = [];
    rotaDates.forEach(date => {
      const dayRota = rota[date] || {};
      const dow = new Date(date+"T00:00:00").toLocaleDateString("en-GB",{weekday:"long"});
      Object.entries(dayRota).forEach(([slotKey, init]) => {
        if (!init) return;
        const sl = SLOTS.find(s=>s.key===slotKey);
        constraintRules.filter(r=>r.active&&r.init===init).forEach(r => {
          let triggered = false;
          if (r.type==="avoid_day" && r.dayOfWeek===dow) triggered=true;
          if (r.type==="avoid_slot_group" && sl && r.slotGroup===sl.grp) triggered=true;
          if (triggered) {
            const sm = activeStaff.find(s=>s.init===init);
            out.push({date, slotKey, init, name:sm?.name||init, rule:r, slotLabel:sl?.label||slotKey, bg:sl?.bg||"#f1f5f9", fg:sl?.fg||"#374151"});
          }
        });
      });
    });
    out.sort((a,b)=>a.date.localeCompare(b.date));
    return out;
  }, [rotaDates, rota, constraintRules]);

  const addRule = () => {
    if (!form.init || !form.note.trim()) return;
    const sm = activeStaff.find(s=>s.init===form.init);
    const rule = {...form, id:Date.now(), name:sm?.name||form.init, active:true, createdDate:fmtISO(new Date()), createdBy:currentUser.init};
    setConstraintRules(p=>[...p, rule]);
    addAudit(currentUser.init,"Constraint Added",`${rule.name}: ${rule.note}`);
    setAddForm(null);
    setForm({init:"",type:"avoid_day",dayOfWeek:"Monday",slotGroup:"EARLY",note:"",severity:"warn"});
  };

  const toggleRule = id => setConstraintRules(p=>p.map(r=>r.id===id?{...r,active:!r.active}:r));
  const deleteRule = id => { setConstraintRules(p=>p.filter(r=>r.id!==id)); addAudit(currentUser.init,"Constraint Removed","Rule deleted"); };

  const CONF_SEVERITY = {warn:{bg:"#fef3c7",fg:"#92400e",label:"Warning"},info:{bg:"#eff6ff",fg:"#1d4ed8",label:"Info"}};

  return (
    <div>
      <div style={{display:"flex",gap:7,marginBottom:16}}>
        <button className={`btn${tab==="conflicts"?" bp":" bs"}`} onClick={()=>setTab("conflicts")}>⚠️ Active Conflicts</button>
        <button className={`btn${tab==="rules"?" bp":" bs"}`} onClick={()=>setTab("rules")}>📏 Rules & Constraints</button>
      </div>

      {tab==="conflicts"&&(
        <div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            <span style={{fontSize:12.5,color:"#64748b",fontWeight:500}}>Quarter:</span>
            <div className="mtog">
              {qs.map(q=><button key={q.id} className={`mtog-btn${selQ===q.id?" act":""}`} onClick={()=>setSelQ(q.id)}>{q.id}</button>)}
            </div>
            {conflicts.length===0&&ruleViolations.length===0
              ?<span style={{fontSize:12,color:"#10b981",fontWeight:600,marginLeft:4}}>✓ No conflicts in {selQ}</span>
              :<span style={{fontSize:12,color:"#ef4444",fontWeight:600,marginLeft:4}}>{conflicts.length+ruleViolations.length} issue{conflicts.length+ruleViolations.length!==1?"s":""} in {selQ}</span>}
          </div>

          {conflicts.length>0&&(
            <div className="card" style={{marginBottom:14}}>
              <div className="ch"><span className="ct">Availability / Leave Conflicts</span><span style={{fontSize:11.5,color:"#ef4444",fontWeight:700}}>{conflicts.length}</span></div>
              <div style={{overflowX:"auto"}}>
                <table className="tbl">
                  <thead><tr><th>Date</th><th>Day</th><th>Slot</th><th>Staff</th><th>Grade</th><th>Reason</th></tr></thead>
                  <tbody>{conflicts.map((c,i)=>(
                    <tr key={i}>
                      <td style={{fontWeight:600,whiteSpace:"nowrap"}}>{fmtShort(c.date)}</td>
                      <td style={{color:"#64748b"}}>{getDayName(c.date)}</td>
                      <td><span style={{background:c.bg,color:c.fg,padding:"2px 7px",borderRadius:4,fontSize:10.5,fontWeight:700,whiteSpace:"nowrap"}}>{c.slotLabel}</span></td>
                      <td style={{fontWeight:600}}>{c.name}</td>
                      <td style={{color:"#64748b",fontSize:11}}>{c.grade}</td>
                      <td><span style={{background:c.severity==="warn"?"#fff7ed":"#fee2e2",color:c.severity==="warn"?"#92400e":"#7f1d1d",padding:"2px 7px",borderRadius:4,fontSize:10.5,fontWeight:600}}>{c.reason}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          {ruleViolations.length>0&&(
            <div className="card">
              <div className="ch"><span className="ct">Rule Violations</span><span style={{fontSize:11.5,color:"#f59e0b",fontWeight:700}}>{ruleViolations.length}</span></div>
              <div style={{overflowX:"auto"}}>
                <table className="tbl">
                  <thead><tr><th>Date</th><th>Day</th><th>Slot</th><th>Staff</th><th>Rule</th></tr></thead>
                  <tbody>{ruleViolations.map((v,i)=>{
                    const sev=CONF_SEVERITY[v.rule.severity]||CONF_SEVERITY.warn;
                    return (
                      <tr key={i}>
                        <td style={{fontWeight:600,whiteSpace:"nowrap"}}>{fmtShort(v.date)}</td>
                        <td style={{color:"#64748b"}}>{getDayName(v.date)}</td>
                        <td><span style={{background:v.bg,color:v.fg,padding:"2px 7px",borderRadius:4,fontSize:10.5,fontWeight:700,whiteSpace:"nowrap"}}>{v.slotLabel}</span></td>
                        <td style={{fontWeight:600}}>{v.name}</td>
                        <td><span style={{background:sev.bg,color:sev.fg,padding:"2px 7px",borderRadius:4,fontSize:10.5,fontWeight:600}}>{v.rule.note}</span></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            </div>
          )}

          {conflicts.length===0&&ruleViolations.length===0&&(
            <div className="card"><div className="cb" style={{textAlign:"center",padding:40}}>
              <div style={{fontSize:32,marginBottom:8}}>✅</div>
              <div style={{fontSize:14,fontWeight:600,color:"#374151"}}>No conflicts found in {selQ}</div>
              <div style={{fontSize:12,color:"#94a3b8",marginTop:4}}>All assigned staff are available on their scheduled dates.</div>
            </div></div>
          )}
        </div>
      )}

      {tab==="rules"&&(
        <div>
          {/* ── System Rules ── */}
          <div className="card" style={{marginBottom:16}}>
            <div className="ch">
              <span className="ct">System Rules</span>
              <span style={{fontSize:11.5,color:"#64748b"}}>Built-in checks — disable to suppress a category</span>
            </div>
            <div style={{overflowX:"auto"}}>
              <table className="tbl">
                <thead><tr><th>Check</th><th>Description</th><th>Severity</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>{Object.entries(sysRules||DEFAULT_SYS_RULES).map(([key,rule])=>{
                  const sevBg = rule.severity==="error"?"#fee2e2":rule.severity==="warn"?"#fff7ed":"#eff6ff";
                  const sevFg = rule.severity==="error"?"#7f1d1d":rule.severity==="warn"?"#92400e":"#1d4ed8";
                  return (
                    <tr key={key} style={{opacity:rule.enabled?1:.45}}>
                      <td style={{fontWeight:600,whiteSpace:"nowrap"}}>{rule.label}</td>
                      <td style={{fontSize:12,color:"#64748b"}}>{rule.desc}</td>
                      <td><span style={{background:sevBg,color:sevFg,padding:"2px 7px",borderRadius:4,fontSize:10.5,fontWeight:600,textTransform:"capitalize"}}>{rule.severity}</span></td>
                      <td><span className={`badge ${rule.enabled?"b-approved":"b-rejected"}`}>{rule.enabled?"Active":"Disabled"}</span></td>
                      <td><button className="btn bs bsm" onClick={()=>setSysRules(p=>({...p,[key]:{...p[key],enabled:!p[key].enabled}}))}>{rule.enabled?"Disable":"Enable"}</button></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </div>

          {/* ── Custom Rules ── */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
            <div style={{fontSize:13,fontWeight:700,color:"#374151"}}>Custom per-staff rules</div>
            <button className="btn bp" onClick={()=>setAddForm("new")}>＋ Add Rule</button>
          </div>

          <div className="card">
            {constraintRules.length===0&&!addForm&&(
              <div className="cb" style={{textAlign:"center",padding:32,color:"#94a3b8"}}>
                <div style={{fontSize:28,marginBottom:6}}>📏</div>
                <div style={{fontSize:13,fontWeight:600,color:"#374151"}}>No custom rules yet</div>
                <div style={{fontSize:12,marginTop:4}}>Add per-staff rules such as "MW should not do Monday nights". Violations show as amber warnings in the Rota Builder.</div>
              </div>
            )}
            {constraintRules.length>0&&(
              <div style={{overflowX:"auto"}}>
                <table className="tbl">
                  <thead><tr><th>Staff</th><th>Grade</th><th>Rule</th><th>Note</th><th>Severity</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>{constraintRules.map(r=>{
                    const sm=activeStaff.find(s=>s.init===r.init);
                    const sev=CONF_SEVERITY[r.severity]||CONF_SEVERITY.warn;
                    const ruleDesc = r.type==="avoid_day"
                      ? `Avoid ${r.dayOfWeek}s`
                      : r.type==="avoid_slot_group"
                      ? `Avoid ${GRP_LABELS[r.slotGroup]||r.slotGroup} shifts`
                      : "Note";
                    return (
                      <tr key={r.id} style={{opacity:r.active?1:.5}}>
                        <td style={{fontWeight:600}}>{r.name||r.init}</td>
                        <td style={{color:"#64748b",fontSize:11}}>{sm?.grade||"—"}</td>
                        <td><span style={{background:"#f1f5f9",color:"#475569",padding:"2px 7px",borderRadius:4,fontSize:10.5,fontWeight:600}}>{ruleDesc}</span></td>
                        <td style={{color:"#374151",fontSize:12}}>{r.note}</td>
                        <td><span style={{background:sev.bg,color:sev.fg,padding:"2px 7px",borderRadius:4,fontSize:10.5,fontWeight:600}}>{sev.label}</span></td>
                        <td><span className={`badge ${r.active?"b-approved":"b-rejected"}`}>{r.active?"Active":"Inactive"}</span></td>
                        <td>
                          <div style={{display:"flex",gap:5}}>
                            <button className="btn bs bsm" onClick={()=>toggleRule(r.id)}>{r.active?"Disable":"Enable"}</button>
                            <button className="btn bsm" style={{color:"#ef4444",border:"1px solid #fca5a5"}} onClick={()=>deleteRule(r.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </div>

          {addForm&&(
            <Modal title="Add Constraint Rule" onClose={()=>setAddForm(null)}
              footer={<><button className="btn bs" onClick={()=>setAddForm(null)}>Cancel</button><button className="btn bp" disabled={!form.init||!form.note.trim()} onClick={addRule}>Add Rule</button></>}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div className="fg" style={{gridColumn:"1/-1"}}>
                  <label className="fl">Staff Member</label>
                  <select className="fi" value={form.init} onChange={e=>setForm(f=>({...f,init:e.target.value}))}>
                    <option value="">Select staff…</option>
                    {activeStaff.sort((a,b)=>a.name.localeCompare(b.name)).map(s=><option key={s.id} value={s.init}>{s.name} ({s.grade})</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Rule Type</label>
                  <select className="fi" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                    <option value="avoid_day">Avoid day of week</option>
                    <option value="avoid_slot_group">Avoid shift type</option>
                    <option value="note">Note only</option>
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Severity</label>
                  <select className="fi" value={form.severity} onChange={e=>setForm(f=>({...f,severity:e.target.value}))}>
                    <option value="warn">Warning</option>
                    <option value="info">Info</option>
                  </select>
                </div>
                {form.type==="avoid_day"&&(
                  <div className="fg" style={{gridColumn:"1/-1"}}>
                    <label className="fl">Day of Week</label>
                    <select className="fi" value={form.dayOfWeek} onChange={e=>setForm(f=>({...f,dayOfWeek:e.target.value}))}>
                      {DOW_FULL.map(d=><option key={d}>{d}</option>)}
                    </select>
                  </div>
                )}
                {form.type==="avoid_slot_group"&&(
                  <div className="fg" style={{gridColumn:"1/-1"}}>
                    <label className="fl">Shift Type</label>
                    <select className="fi" value={form.slotGroup} onChange={e=>setForm(f=>({...f,slotGroup:e.target.value}))}>
                      {Object.entries(GRP_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                )}
                <div className="fg" style={{gridColumn:"1/-1"}}>
                  <label className="fl">Note / Reason</label>
                  <input className="fi" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="e.g. Childcare on Mondays, cannot do night shifts…"/>
                </div>
              </div>
            </Modal>
          )}
        </div>
      )}
    </div>
  );
}

export default ConflictsView
