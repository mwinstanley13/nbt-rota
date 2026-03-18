import React, { useState, useMemo } from 'react'
import { BH, QUARTERS } from '../constants/quarters'
import { AVAIL } from '../constants/avail'
import { fmtISO, fmtDisp, getDayName, isWeekend, getMonthDays, getDatesInRange } from '../utils/dates'
import { normaliseAvailEntry, isMarkedAvailEntry, getAvailEntry } from '../utils/availability'
import Modal from './Modal'

function AvailabilityView({
  user,
  staff,
  setStaff,
  availability,
  setAvailability,
  quarterStatus,
  setQuarterStatus,
  addAudit,
  leaveEntries,
  setLeaveEntries,
  rota,
  requests,
  setRequests,
  applyCarryForward,
  quarters,
  fixedDaysOff,
  setFixedDaysOff
}) {
  const isAdmin = user.role === "admin";

  const [selQ, setSelQ] = useState("Q1");
  const [viewStaff, setViewStaff] = useState(null);
  const [pickModal, setPickModal] = useState(null); // { date }
  const [viewMonth, setVM] = useState(new Date(2026, 7, 1));
  const [modalDraft, setModalDraft] = useState({ base: "", slots: [] });
  // Fixed days off local state (lifted from IIFE to avoid hooks-in-conditional)
  const [fdDay, setFdDay] = useState("Monday");
  const [fdReason, setFdReason] = useState("Research");

  const activeQs = quarters || QUARTERS;
  const q = activeQs.find(x => x.id === selQ);
  const myAvail = availability[user.init] || {};
  const qDates = q ? getDatesInRange(q.start, q.end) : [];
  const submittedCount = qDates.filter(d => isMarkedAvailEntry(myAvail[d])).length;
  const pct = qDates.length > 0 ? Math.round((submittedCount / qDates.length) * 100) : 0;

  const yr = viewMonth.getFullYear();
  const mo = viewMonth.getMonth();
  const calDays = useMemo(() => getMonthDays(yr, mo), [yr, mo]);
  const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const dispInit = isAdmin && viewStaff ? viewStaff : user.init;

  const getEntry = (init, date) => normaliseAvailEntry((availability[init] || {})[date]);

  const setEntry = (init, date, entry) => {
    setAvailability(prev => ({
      ...prev,
      [init]: {
        ...(prev[init] || {}),
        [date]: entry
      }
    }));
  };

  const clearEntry = (init, date) => {
    setAvailability(prev => {
      const next = { ...(prev[init] || {}) };
      delete next[date];
      return {
        ...prev,
        [init]: next
      };
    });
  };

  const removeAutoSLLeave = (init, date) => {
    setLeaveEntries(prev => {
      const day = prev[date] || [];
      const filtered = day.filter(
        e => !(e.init === init && (e.type === "SL" || e.type === "MILITARY") && e.autoFromAvailability)
      );
      const out = { ...prev };
      if (filtered.length === 0) delete out[date];
      else out[date] = filtered;
      return out;
    });
  };

  const addAutoSLLeave = (init, date) => {
    setLeaveEntries(prev => {
      const day = prev[date] || [];
      const alreadyThere = day.some(
        e => e.init === init && e.type === "SL" && e.autoFromAvailability
      );
      if (alreadyThere) return prev;

      return {
        ...prev,
        [date]: [
          ...day,
          {
            id: Date.now() + Math.random(),
            init,
            type: "SL",
            note: "Auto-added from availability",
            autoFromAvailability: true
          }
        ]
      };
    });
  };

  const dateHasBuiltRota = (date) => {
    const rotaDay = rota?.[date] || {};
    const hasAssignedSlots = Object.values(rotaDay).some(Boolean);
    const hasLeaveAlready = (leaveEntries?.[date] || []).length > 0;
    return hasAssignedSlots || hasLeaveAlready;
  };

  const saveModal = () => {
    if (!pickModal) return;

    const date = pickModal.date;
    const init = dispInit;
    const existing = getEntry(init, date);
    const wasLeaveBase = existing?.base === "SL" || existing?.base === "MILITARY";
    const willBeSL  = modalDraft.base === "SL";
    const willBeMil = modalDraft.base === "MILITARY";
    const willBeLeave = willBeSL || willBeMil;
    const leaveType = willBeSL ? "SL" : "MILITARY";
    const leaveLabel = willBeSL ? "Study Leave" : "Military";

    if (!modalDraft.base) return;

    // Remove old auto-leave if switching away from a leave base
    if (wasLeaveBase && !willBeLeave) {
      removeAutoSLLeave(init, date);
    }

    // Determine if the quarter is open for this date
    const dateQuarter = activeQs.find(q => date >= q.start && date <= q.end);
    const isQOpen = dateQuarter ? quarterStatus[dateQuarter.id] === "open" : false;

    if (willBeLeave && isQOpen) {
      // Quarter is open — auto-accept leave directly
      setEntry(init, date, { base: modalDraft.base, slots: [] });
      setLeaveEntries(prev => {
        const day = prev[date] || [];
        if (day.some(e => e.init === init && e.type === leaveType && e.autoFromAvailability)) return prev;
        return {
          ...prev,
          [date]: [...day, { id: Date.now() + Math.random(), init, type: leaveType, note: "Auto-added from availability", autoFromAvailability: true }]
        };
      });
      addAudit(user.init, "Availability", `${init} marked ${date}: ${leaveType} (auto-accepted, quarter open)`);
      setPickModal(null);
      return;
    }

    if (willBeLeave && !isQOpen) {
      // Quarter is closed — create a pending request for admin approval
      const alreadyPending = (requests || []).some(
        r => r.staffInitials === init && r.type === leaveType && r.startDate === date && r.status === "pending"
      );
      if (!alreadyPending) {
        setRequests(prev => [
          ...prev,
          {
            id: Date.now(),
            staffInitials: init,
            staffName: staff.find(s => s.init === init)?.name || init,
            type: leaveType,
            startDate: date,
            endDate: date,
            reason: "Submitted from Availability (quarter closed)",
            status: "pending",
            adminNote: "",
            createdAt: fmtISO(new Date())
          }
        ]);
        addAudit(user.init, `${leaveType} Request`, `${init} submitted ${leaveType} request for ${date}`);
      }
      alert(`Availability is closed. ${leaveLabel} has been submitted for admin approval.`);
      setPickModal(null);
      return;
    }

    setEntry(init, date, { base: modalDraft.base, slots: [] });
    addAudit(user.init, "Availability", `${init} marked ${date}: ${modalDraft.base}`);
    setPickModal(null);
  };

  const clearStatus = (date) => {
    const init = dispInit;
    const existing = getEntry(init, date);

    if (existing?.base === "SL" || existing?.base === "MILITARY") {
      removeAutoSLLeave(init, date);
    }

    clearEntry(init, date);
    addAudit(user.init, "Availability", `${init} cleared ${date}`);
    setPickModal(null);
  };

  const toggleQStatus = (qid, status) => {
    setQuarterStatus(prev => ({ ...prev, [qid]: status }));
    addAudit(user.init, "Quarter Status", `${qid} set to ${status}`);
    if (status === "locked" && applyCarryForward) {
      const qs = quarters || QUARTERS;
      const nextQ = qs[qs.findIndex(q=>q.id===qid)+1];
      if (nextQ && confirm(`Apply carry-forward of unworked/overworked hours from ${qid} to ${nextQ.id}?`)) {
        applyCarryForward(qid);
      }
    }
  };

  const openDateModal = (date) => {
    const current = getEntry(dispInit, date);
    setModalDraft(
      current
        ? { base: current.base || "", slots: current.slots || [] }
        : { base: "", slots: [] }
    );
    setPickModal({ date });
  };

  const getAggregate = (date) => {
    const counts = {};
    staff
      .filter(s => s.role === "staff" && s.active)
      .forEach(s => {
        const entry = getEntry(s.init, date);
        if (entry?.base) entry.base.split(",").forEach(b => { counts[b] = (counts[b] || 0) + 1; });
      });
    return counts;
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {activeQs.map(qv => {
          const st = quarterStatus[qv.id] || "closed";
          return (
            <button
              key={qv.id}
              onClick={() => setSelQ(qv.id)}
              className={`btn${selQ === qv.id ? " bp" : " bs"}`}
            >
              {qv.id} <span className={`badge b-${st}`} style={{ marginLeft: 5 }}>{st}</span>
            </button>
          );
        })}
      </div>

      {isAdmin ? (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="ch">
              <span className="ct">Quarter Management — {q?.label}</span>
            </div>
            <div className="cb">
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, color: "#374151", fontWeight: 600 }}>Status:</span>
                <span className={`badge b-${quarterStatus[selQ] || "closed"}`} style={{ fontSize: 11 }}>
                  {quarterStatus[selQ] || "closed"}
                </span>
                <div style={{ marginLeft: 8, display: "flex", gap: 7 }}>
                  <button className="btn bp bsm" onClick={() => toggleQStatus(selQ, "open")} disabled={quarterStatus[selQ] === "open"}>Open for Staff</button>
                  <button className="btn bw bsm" onClick={() => toggleQStatus(selQ, "closed")} disabled={quarterStatus[selQ] === "closed"}>Close</button>
                  <button className="btn bd bsm" onClick={() => toggleQStatus(selQ, "locked")} disabled={quarterStatus[selQ] === "locked"}>Lock</button>
                </div>
              </div>
              {quarterStatus[selQ] === "open" && (
                <div className="al al-s" style={{ marginTop: 12, marginBottom: 0 }}>
                  ✓ Staff can currently view and submit availability for {selQ}.
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="ch">
              <span className="ct">Submission Progress — {q?.label}</span>
            </div>
            <div className="cb">
              {staff.filter(s => s.role === "staff" && s.active).map(s => {
                const av = availability[s.init] || {};
                const cnt = qDates.filter(d => isMarkedAvailEntry(av[d])).length;
                const p = qDates.length > 0 ? Math.round((cnt / qDates.length) * 100) : 0;
                return (
                  <div
                    key={s.id}
                    style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, cursor: "pointer" }}
                    onClick={() => setViewStaff(viewStaff === s.init ? null : s.init)}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, width: 170, flexShrink: 0, color: viewStaff === s.init ? "#10b981" : "#374151" }}>
                      {s.name}
                    </div>
                    <div className="prog-bar"><div className="prog-fill" style={{ width: `${p}%` }} /></div>
                    <div style={{ fontSize: 11, color: "#64748b", width: 40, textAlign: "right", flexShrink: 0 }}>
                      {cnt}/{qDates.length}
                    </div>
                    {viewStaff === s.init && <span style={{ fontSize: 10, color: "#10b981", fontWeight: 700 }}>viewing ↓</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {viewStaff && (
            <div className="al al-i" style={{ marginBottom: 12 }}>
              Viewing availability for <strong>{staff.find(s => s.init === viewStaff)?.name}</strong>. Click a date to edit on their behalf.
            </div>
          )}
        </div>
      ) : (
        quarterStatus[selQ] === "open" ? (
          <>
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="ch">
                <span className="ct">{q?.label}</span>
                <span style={{ fontSize: 11, color: "#64748b" }}>{fmtDisp(q?.start)} → {fmtDisp(q?.end)}</span>
              </div>
              <div className="cb">
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: "#374151", marginBottom: 5 }}>
                    Your progress: <strong>{submittedCount}/{qDates.length} days</strong> marked ({pct}%)
                  </div>
                  <div className="prog-bar" style={{ height: 8 }}>
                    <div className="prog-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <p style={{ margin: 0, fontSize: 13.5, color: "#374151", fontFamily:"'DM Sans',sans-serif", lineHeight: 1.7, fontWeight: 400 }}>
                  Tap any date to record your availability. Choose <strong>Any shift</strong> if you're happy to work that day, <strong>Unavailable</strong> if you cannot work, <strong>SL</strong> for study leave, or select a <strong>specific shift type</strong> (Early, Mid, Late, or Night) if you have a preference. Unmarked days are treated as no preference.
                </p>
              </div>
            </div>

            {/* Night block preference — only relevant for staff who do nights */}
            {(() => {
              const me = staff.find(s => s.init === user.init);
              if (!me || !["ST4+","ST3","ACP","tACP"].includes(me.grade)) return null;
              const pref = me.nightBlockPref || "any";
              const opts = [
                { val:"any", label:"No preference",      desc:"System will schedule you for any night block" },
                { val:"4",   label:"4 nights (Mon–Thu)", desc:"Prefer a full 4-night weekday block" },
                { val:"2",   label:"2 nights",           desc:"Prefer shorter 2-night weekday blocks" },
              ];
              const save = (val) => {
                if (setStaff) setStaff(prev => prev.map(s => s.init === user.init ? {...s, nightBlockPref: val} : s));
                addAudit(user.init, "Night Pref", `Set night block preference: ${val}`);
              };
              return (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="ch"><span className="ct">🌙 Night Block Preference</span></div>
                  <div className="cb">
                    <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                      When generating the rota, your night shifts will be scheduled as weekday blocks (Mon–Thu) or weekend blocks (Fri–Sun). Choose how you prefer weekday nights to be assigned.
                    </div>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      {opts.map(o => (
                        <button key={o.val} onClick={() => save(o.val)}
                          style={{ padding:"8px 14px", borderRadius:8, border:`2px solid ${pref===o.val?"#10b981":"#e2e8f0"}`,
                            background: pref===o.val ? "#ecfdf5" : "#f8fafc",
                            color: pref===o.val ? "#065f46" : "#374151",
                            cursor:"pointer", textAlign:"left", minWidth:160 }}>
                          <div style={{ fontWeight: pref===o.val ? 700 : 500, fontSize:13 }}>{pref===o.val ? "✓ " : ""}{o.label}</div>
                          <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>{o.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
    {/* ── Fixed Days Off — between night pref and calendar ── */}
    {!isAdmin && fixedDaysOff && setFixedDaysOff && (()=>{
      const DAY_NAMES_FD = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
      const REASONS_FD   = ["Research","Fellow Day","PHEM"];
      const FIXED_LEAVE_TYPE_FD = {"Research":"RESEARCH","Fellow Day":"FELLOW","PHEM":"PHEM"};
      const myFixed = fixedDaysOff.filter(f=>f.init===user.init);
      const addFixed = () => {
        if (myFixed.some(f=>f.dayOfWeek===fdDay&&f.reason===fdReason)) return;
        setFixedDaysOff(prev=>[...prev,{id:Date.now(),init:user.init,name:user.name,dayOfWeek:fdDay,reason:fdReason,addedDate:fmtISO(new Date())}]);
        const allDates = [];
        (quarters||QUARTERS).forEach(q => getDatesInRange(q.start,q.end).forEach(d=>{
          if (new Date(d+"T00:00:00").toLocaleDateString("en-GB",{weekday:"long"})===fdDay) allDates.push(d);
        }));
        setAvailability(prev=>{
          const next={...prev,[user.init]:{...(prev[user.init]||{})}};
          allDates.forEach(d=>{
            const ex=next[user.init][d];
            if(!ex||!ex.base||ex.base==="ANY"||ex.autoFromFixed) next[user.init][d]={base:"UNAVAILABLE",slots:[],autoFromFixed:true};
          });
          return next;
        });
        const lt=FIXED_LEAVE_TYPE_FD[fdReason];
        if(lt) setLeaveEntries(prev=>{
          const next={...prev};
          allDates.forEach(d=>{
            const day=next[d]||[];
            if(!day.some(e=>e.init===user.init&&e.type===lt&&e.autoFromFixed))
              next[d]=[...day,{id:Date.now()+Math.random(),init:user.init,type:lt,note:"Auto-added from fixed day off",autoFromFixed:true}];
          });
          return next;
        });
        addAudit(user.init,"Fixed Day Off",`${user.init} added fixed ${fdReason}: ${fdDay}`);
      };
      const removeFixed = (f) => {
        setFixedDaysOff(prev=>prev.filter(x=>x.id!==f.id));
        setAvailability(prev=>{
          const next={...prev,[f.init]:{...(prev[f.init]||{})}};
          Object.keys(next[f.init]).forEach(d=>{ if(next[f.init][d]?.autoFromFixed) delete next[f.init][d]; });
          return next;
        });
        const lt=FIXED_LEAVE_TYPE_FD[f.reason];
        if(lt) setLeaveEntries(prev=>{
          const next={};
          Object.entries(prev).forEach(([d,es])=>{ const fi=es.filter(e=>!(e.init===f.init&&e.type===lt&&e.autoFromFixed)); if(fi.length) next[d]=fi; });
          return next;
        });
        addAudit(user.init,"Fixed Day Off",`${user.init} removed fixed ${f.reason}: ${f.dayOfWeek}`);
      };
      return (
        <div className="card" style={{marginBottom:16}}>
          <div className="ch"><span className="ct">📆 Fixed Days Off</span></div>
          <div className="cb">
            <div className="al al-i" style={{marginBottom:12,fontSize:12.5}}>
              Fixed days off are only for agreed posts (e.g. Research, Fellow Day, PHEM). Please use <strong>Unavailability</strong> for LTFT arrangements and we will attempt to accommodate everyone's requests.
            </div>
            {myFixed.length===0&&<p style={{fontSize:12.5,color:"#94a3b8",margin:"8px 0"}}>No fixed days off set.</p>}
            {myFixed.map(f=>(
              <div key={f.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:"1px solid #f1f5f9"}}>
                <span style={{flex:1,fontSize:13,fontWeight:600}}>{f.dayOfWeek}</span>
                <span style={{padding:"2px 8px",borderRadius:4,background:"#eff6ff",color:"#1d4ed8",fontSize:11,fontWeight:600}}>{f.reason}</span>
                <button className="btn bs bsm" style={{color:"#ef4444",borderColor:"#ef4444"}} onClick={()=>removeFixed(f)}>Remove</button>
              </div>
            ))}
            <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap",alignItems:"flex-end"}}>
              <div className="fg" style={{margin:0}}>
                <label className="fl">Day</label>
                <select className="fi" style={{padding:"5px 8px"}} value={fdDay} onChange={e=>setFdDay(e.target.value)}>
                  {DAY_NAMES_FD.map(d=><option key={d}>{d}</option>)}
                </select>
              </div>
              <div className="fg" style={{margin:0}}>
                <label className="fl">Reason</label>
                <select className="fi" style={{padding:"5px 8px"}} value={fdReason} onChange={e=>setFdReason(e.target.value)}>
                  {REASONS_FD.map(r=><option key={r}>{r}</option>)}
                </select>
              </div>
              <button className="btn bp" style={{height:34,alignSelf:"flex-end"}} onClick={addFixed}>＋ Add</button>
            </div>
          </div>
        </div>
      );
    })()}
          </>
        ) : (
          <div className="al al-w">
            ⏳ Availability for <strong>{q?.label}</strong> is not yet open. Your admin will open it when ready.
          </div>
        )
      )}

      {(isAdmin || quarterStatus[selQ] === "open") && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div className="cal-nav">
              <button onClick={() => { const d = new Date(viewMonth); d.setMonth(d.getMonth() - 1); setVM(d); }}>‹</button>
              <div className="cal-mo">{viewMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</div>
              <button onClick={() => { const d = new Date(viewMonth); d.setMonth(d.getMonth() + 1); setVM(d); }}>›</button>
            </div>
            <span style={{ fontSize: 11.5, color: "#94a3b8" }}>Click a date to mark availability</span>
          </div>

          <div className="card">
            <div className="av-cal">
              {DOW.map(d => <div key={d} className="av-dow">{d}</div>)}
              {calDays.map(({ date, inMonth }) => {
                const isBH = !!BH[date];
                const inQ = q && date >= q.start && date <= q.end;
                const today_ = date === fmtISO(new Date());
                const entry = getEntry(dispInit, date);
                const clickable = inMonth && inQ;
                const agg = isAdmin && !viewStaff ? getAggregate(date) : null;

                const entryBases = entry?.base ? entry.base.split(",") : [];
                const bg = entryBases.length === 1 ? (AVAIL[entryBases[0]]?.bg || "#f1f5f9") : entryBases.length > 1 ? "#e0e7ff" : "";

                return (
                  <div
                    key={date}
                    className={`av-cell${!inMonth ? " om" : ""}${!inQ && inMonth ? " out-range" : ""}${isBH ? " bh" : ""}`}
                    style={{ background: bg, cursor: clickable ? "pointer" : "default" }}
                    onClick={() => clickable && openDateModal(date)}
                  >
                    <div className={`av-date${!inMonth ? " om" : ""}`}>
                      <span style={today_ ? { background: "#10b981", color: "white", borderRadius: "50%", width: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9.5 } : {}}>
                        {new Date(date + "T00:00:00").getDate()}
                      </span>
                      {isBH && <span style={{ fontSize: 7.5, background: "#fde047", color: "#713f12", padding: "0 2px", borderRadius: 2, marginLeft: 2 }}>BH</span>}
                    </div>

                    {clickable && (
                      entry ? (
                        <div>
                          {entryBases.length === 1 ? (() => {
                            const av = AVAIL[entryBases[0]] || { bg:"#f1f5f9", fg:"#334155", short: entryBases[0] };
                            return (
                              <div className="av-status" style={{ background: av.bg, color: av.fg }}>
                                {av.short}
                              </div>
                            );
                          })() : (
                            <div style={{ display:"flex", flexWrap:"wrap", gap:1, justifyContent:"center" }}>
                              {entryBases.map(b => {
                                const av = AVAIL[b] || { bg:"#f1f5f9", fg:"#334155", icon:b[0] };
                                return <span key={b} style={{ fontSize:7, background:av.bg, color:av.fg, borderRadius:2, padding:"0 2px", fontWeight:700 }}>{av.icon || av.short}</span>;
                              })}
                            </div>
                          )}
                        </div>
                      ) : isAdmin && agg && Object.keys(agg).length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                          {Object.entries(agg).map(([k, c]) => {
                            const av = AVAIL[k] || { bg:"#f1f5f9", fg:"#334155", icon:k.slice(0,1) };
                            return (
                              <span key={k} style={{ fontSize: 8, background: av.bg, color: av.fg, padding: "1px 3px", borderRadius: 3, fontWeight: 700 }}>
                                {av.icon}{c}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="av-none">{isAdmin ? "—" : "+ mark"}</div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {pickModal&&(()=>{
          const we = isWeekend(pickModal.date);
          const dispGrade = staff.find(s => s.init === dispInit)?.grade || "ST4+";
          const nightLabel =
            dispGrade === "tACP" ? "ACP Night only" :
            dispGrade === "ACP"  ? "SDM N2 + ACP Night" :
            dispGrade === "ST3"  ? "ST3 Night" :
            "SDM Night 1 & 2";

          const availOpts = [
            { key:"ANY",         label:"Any",         bg:AVAIL.ANY.bg,         fg:AVAIL.ANY.fg },
            { key:"UNAVAILABLE", label:"Unavailable", bg:AVAIL.UNAVAILABLE.bg, fg:AVAIL.UNAVAILABLE.fg },
            { key:"SL",          label:"Study Leave", bg:AVAIL.SL.bg,          fg:AVAIL.SL.fg },
            { key:"MILITARY",    label:"Military",    bg:AVAIL.MILITARY.bg,    fg:AVAIL.MILITARY.fg },
            { key:"PHEM",        label:"PHEM",        bg:AVAIL.PHEM.bg,        fg:AVAIL.PHEM.fg },
            { key:"EARLY",       label:"Early",       bg:AVAIL.EARLY.bg,       fg:AVAIL.EARLY.fg },
            ...(!we ? [{ key:"MID", label:"Mid",      bg:AVAIL.MID.bg,         fg:AVAIL.MID.fg }] : []),
            { key:"LATE",        label:"Late",        bg:AVAIL.LATE.bg,        fg:AVAIL.LATE.fg },
            { key:"NIGHT",       label:"Night",       bg:AVAIL.NIGHT.bg,       fg:AVAIL.NIGHT.fg },
          ];

          return (
            <Modal
              title={`${getDayName(pickModal.date)}, ${fmtDisp(pickModal.date)}`}
              onClose={() => setPickModal(null)}
              footer={
                <>
                  <button className="btn bs" onClick={() => clearStatus(pickModal.date)}>Clear</button>
                  <button className="btn bs" onClick={() => setPickModal(null)}>Cancel</button>
                  <button className="btn bp" onClick={saveModal} disabled={!modalDraft.base}>Save</button>
                </>
              }
            >
              <p style={{ fontSize: 12.5, color: "#64748b", marginBottom: 14 }}>
                {isAdmin && viewStaff
                  ? `Marking for: ${staff.find(s => s.init === viewStaff)?.name}`
                  : "Set your availability for this day:"}
              </p>

              {BH[pickModal.date] && (
                <div className="al al-w" style={{ marginBottom: 12 }}>🎉 {BH[pickModal.date]}</div>
              )}

              {(() => {
                const dateQuarter = activeQs.find(q => pickModal.date >= q.start && pickModal.date <= q.end);
                const isQOpen = dateQuarter ? quarterStatus[dateQuarter.id] === "open" : false;
                return !isQOpen && (
                  <div className="al al-i" style={{ marginBottom: 12 }}>
                    Availability is closed for this quarter. Study Leave or Military submitted here will require admin approval.
                  </div>
                );
              })()}

              {(() => {
                const SINGLE = ["ANY","UNAVAILABLE","SL","MILITARY","PHEM"];
                const SHIFT = ["EARLY","MID","LATE","NIGHT"];
                const draftBases = modalDraft.base ? modalDraft.base.split(",") : [];
                const handleClick = (key) => {
                  if (SINGLE.includes(key)) {
                    setModalDraft({ base: key, slots: [] });
                  } else {
                    // Toggle shift option; clear any single-select base first
                    const prev = draftBases.filter(b => SHIFT.includes(b));
                    const next = prev.includes(key) ? prev.filter(b => b !== key) : [...prev, key];
                    setModalDraft({ base: next.join(","), slots: [] });
                  }
                };
                return (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {availOpts.map(opt => {
                      const cur = draftBases.includes(opt.key);
                      return (
                        <button
                          key={opt.key}
                          onClick={() => handleClick(opt.key)}
                          style={{
                            padding: "11px 8px",
                            border: `2px solid ${cur ? opt.fg : opt.fg + "40"}`,
                            borderRadius: 9,
                            background: cur ? opt.bg : "white",
                            color: opt.fg,
                            fontWeight: 700,
                            fontSize: 12,
                            cursor: "pointer",
                            textAlign: "left",
                            boxShadow: cur ? `0 0 0 3px ${opt.fg}25` : "none",
                            transition: "all .1s"
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </Modal>
          );
        })()}


    </div>
  );
}

export default AvailabilityView
