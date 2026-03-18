import React, { useState, useMemo } from 'react'
import { QUARTERS } from '../constants/quarters'
import { fmtISO, getDatesInRange } from '../utils/dates'
import { normaliseAvailEntry } from '../utils/availability'

function Reports({user,staff,rota,leaveEntries,requests,quarters,availability,specialPeriods}) {
  const isAdmin=user.role==="admin";
  const qs=quarters||QUARTERS;
  const target=isAdmin?staff.filter(s=>s.role==="staff"&&s.active):staff.filter(s=>s.init===user.init);

  // Quarter selector — default to the current/most recent quarter
  const todayStr=fmtISO(new Date());
  const defaultQ=(qs.find(q=>todayStr>=q.start&&todayStr<=q.end)||qs.find(q=>todayStr<q.start)||qs[qs.length-1])?.id||"Q1";
  const [selQ,setSelQ]=useState(defaultQ);
  const [tab,setTab]=useState("summary");
  const selQDef=qs.find(q=>q.id===selQ)||qs[0];

  const earlySlots=["E1","E2","E3","E4","WE1","WE2","WE3"];
  const midSlots  =["M1","M2","M3"];
  const lateSlots =["L1","L2","L3","L4","WL1","WL2"];
  const nightSlots=["N1","N2","SN","AN"];
  const weekKey=d=>{const dt=new Date(d);const mon=new Date(dt);mon.setDate(dt.getDate()-((dt.getDay()+6)%7));return mon.toISOString().slice(0,10);};

  // Build leave date sets: leaveEntries + approved requests + availability entries
  const getLeaveTypeDates=(init,filterFn,types)=>{
    const dates=new Set();
    const typeSet=new Set(Array.isArray(types)?types:[types]);
    // From leaveEntries state
    Object.entries(leaveEntries).forEach(([d,es])=>{
      if(!filterFn||filterFn(d)) es.filter(e=>e.init===init&&typeSet.has(e.type)).forEach(()=>dates.add(d));
    });
    // From availability base entries (e.g. staff marked day as SL/MILITARY in availability)
    if(availability&&availability[init]){
      Object.entries(availability[init]).forEach(([d,raw])=>{
        if(!filterFn||filterFn(d)){
          const e=normaliseAvailEntry(raw);
          if(e&&typeSet.has(e.base)) dates.add(d);
        }
      });
    }
    // From approved requests (expand date range)
    (requests||[]).filter(r=>(r.staffInitials===init||r.init===init)&&typeSet.has(r.type)&&r.status==="approved").forEach(r=>{
      const ds=getDatesInRange(r.startDate,r.endDate);
      ds.forEach(d=>{if(!filterFn||filterFn(d))dates.add(d);});
    });
    return dates;
  };
  const getSLDates =(init,filterFn)=>getLeaveTypeDates(init,filterFn,"SL");
  const getMilDates=(init,filterFn)=>getLeaveTypeDates(init,filterFn,"MILITARY");

  const calcStats=(init,dateFn)=>{
    const mySlots=Object.entries(rota).filter(([d])=>!dateFn||dateFn(d)).flatMap(([d,slots])=>Object.entries(slots).filter(([,v])=>v===init).map(([sk])=>({d,sk})));
    const total=mySlots.length;
    const nights=mySlots.filter(x=>nightSlots.includes(x.sk)).length;
    const weWeeks=new Set();
    mySlots.forEach(({d,sk})=>{const day=new Date(d).getDay();if(day===6||day===0||(day===5&&nightSlots.includes(sk)))weWeeks.add(weekKey(d));});
    return{total,nights,weWorked:weWeeks.size,earlies:mySlots.filter(x=>earlySlots.includes(x.sk)).length,mids:mySlots.filter(x=>midSlots.includes(x.sk)).length,lates:mySlots.filter(x=>lateSlots.includes(x.sk)).length};
  };

  const qFilter=d=>selQDef&&d>=selQDef.start&&d<=selQDef.end;

  const stats=useMemo(()=>target.map(s=>{
    const yr=calcStats(s.init,null);
    const q=calcStats(s.init,qFilter);
    const slYr=getSLDates(s.init,null).size;
    const slQ=getSLDates(s.init,qFilter).size;
    const milYr=getMilDates(s.init,null).size;
    const milQ=getMilDates(s.init,qFilter).size;
    return{...s,yr,q,slYr,slQ,milYr,milQ,slEntitlement:s.slDays??30,milEntitlement:s.militaryDays??0};
  }),[target,rota,leaveEntries,requests,selQ]);

  const th=(label,sub)=>(
    <th style={{background:"#f8fafc",fontWeight:700,fontSize:10.5,color:"#475569",padding:"7px 8px",textAlign:"center",borderBottom:"2px solid #e2e8f0",whiteSpace:"nowrap",borderLeft:"1px solid #e2e8f0"}}>
      {label}{sub&&<div style={{fontSize:9,fontWeight:500,color:"#94a3b8",marginTop:1}}>{sub}</div>}
    </th>
  );
  const QYCell=({q,yr,bold,bg,fg})=>(
    <td style={{padding:"6px 8px",textAlign:"center",borderBottom:"1px solid #f1f5f9",borderLeft:"1px solid #f4f6fb"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
        <span style={{fontWeight:700,fontSize:12.5,color:bold?"#0f172a":fg||"#374151",background:bg,padding:bg?"1px 6px":"0",borderRadius:bg?4:0}}>{q}</span>
        <span style={{color:"#cbd5e1",fontSize:10}}>/</span>
        <span style={{fontSize:11,color:"#64748b"}}>{yr}</span>
      </div>
    </td>
  );

  const qSel = (
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:11,color:"#94a3b8"}}>Quarter:</span>
      <div className="mtog">
        {qs.map(q=>(
          <button key={q.id} className={`mtog-btn${selQ===q.id?" act":""}`} onClick={()=>setSelQ(q.id)}>{q.id}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      {isAdmin&&(
        <div style={{display:"flex",gap:6,marginBottom:16}}>
          <button className={`btn${tab==="summary"?" bp":" bs"}`} onClick={()=>setTab("summary")}>📊 Summary</button>
          <button className={`btn${tab==="christmas"?" bp":" bs"}`} onClick={()=>setTab("christmas")}>🎄 Christmas</button>
        </div>
      )}
      {tab==="summary"&&(<div className="card">
        <div className="ch">
          <span className="ct">Shift &amp; Leave Summary</span>
          {qSel}
        </div>

        {/* ── Vertical (transposed) layout — shown on mobile, and always for single-person staff view ── */}
        {!isAdmin&&stats.length===1&&stats.map(s=>(
          <div key={s.id} className="rpt-vertical">
            <div style={{padding:"12px 16px",borderBottom:"1px solid #f1f5f9",display:"flex",alignItems:"center",gap:10}}>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:"#0d1b2a"}}>{s.name}</div>
                <div style={{fontSize:11,color:"#64748b",marginTop:2}}><span style={{padding:"2px 6px",borderRadius:4,background:"#f1f5f9",color:"#475569",fontSize:11,fontWeight:600}}>{s.grade}</span></div>
              </div>
              <div style={{marginLeft:"auto",textAlign:"right",fontSize:10,color:"#94a3b8",lineHeight:1.5}}><strong style={{color:"#374151"}}>{selQ}</strong> / Year</div>
            </div>
            {[
              {label:"Total Shifts",     qv:s.q.total,    yv:s.yr.total,    bg:"#f1f5f9", fg:"#0f172a"},
              {label:"Weekends",         qv:s.q.weWorked, yv:s.yr.weWorked, bg:"#f1f5f9", fg:"#0f172a"},
              {label:"Night Shifts",     qv:s.q.nights,   yv:s.yr.nights,   bg:"#ede9fe", fg:"#4c1d95"},
              {label:"Early Shifts",     qv:s.q.earlies,  yv:s.yr.earlies,  bg:"#dcfce7", fg:"#14532d"},
              {label:"Mid Shifts",       qv:s.q.mids,     yv:s.yr.mids,     bg:"#dbeafe", fg:"#1e3a8a"},
              {label:"Late Shifts",      qv:s.q.lates,    yv:s.yr.lates,    bg:"#fef3c7", fg:"#78350f"},
            ].map(row=>(
              <div key={row.label} className="rpt-vert-row">
                <div className="rpt-vert-label">{row.label}</div>
                <div className="rpt-vert-vals">
                  <span className="rpt-vert-q" style={{background:row.bg,color:row.fg}}>{row.qv}</span>
                  <span className="rpt-vert-yr">/ {row.yv}</span>
                </div>
              </div>
            ))}
            <div className="rpt-vert-row">
              <div className="rpt-vert-label">Study Leave<div className="rpt-vert-sub">year total</div></div>
              <div className="rpt-vert-vals">
                <span className="rpt-vert-q" style={{background:s.slYr>0?"#fef3c7":"#f1f5f9",color:s.slYr>0?"#92400e":"#94a3b8"}}>{s.slYr}</span>
                {s.slEntitlement>0&&<span className="rpt-vert-yr">/ {s.slEntitlement} days</span>}
              </div>
            </div>
            {s.milEntitlement>0&&(
              <div className="rpt-vert-row">
                <div className="rpt-vert-label">Military Leave<div className="rpt-vert-sub">year total</div></div>
                <div className="rpt-vert-vals">
                  <span className="rpt-vert-q" style={{background:s.milYr>0?"#dcfce7":"#f1f5f9",color:s.milYr>0?"#166534":"#94a3b8"}}>{s.milYr}</span>
                  <span className="rpt-vert-yr">/ {s.milEntitlement} days</span>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* ── Horizontal table — shown on desktop for admin, hidden on mobile for staff ── */}
        <div className={isAdmin?"":"rpt-wide"}>
          <div style={{overflowX:"auto"}}>
            <table className="tbl" style={{minWidth:820}}>
              <thead>
                <tr>
                  <th style={{background:"#f8fafc",fontWeight:700,fontSize:10.5,color:"#475569",padding:"7px 10px",textAlign:"left",borderBottom:"2px solid #e2e8f0",whiteSpace:"nowrap"}}>Staff</th>
                  <th style={{background:"#f8fafc",fontWeight:700,fontSize:10.5,color:"#475569",padding:"7px 8px",textAlign:"center",borderBottom:"2px solid #e2e8f0",whiteSpace:"nowrap"}}>Grade</th>
                  {th("Total","shifts")}
                  {th("W/E","wknds")}
                  {th("Nights","")}
                  {th("Earlies","")}
                  {th("Mids","")}
                  {th("Lates","")}
                  {th("SL Days","year total")}
                  {th("Military","year total")}
                </tr>
              </thead>
              <tbody>{stats.map(s=>(
                <tr key={s.id} onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                  <td style={{padding:"6px 10px",fontWeight:600,fontSize:12.5,borderBottom:"1px solid #f1f5f9"}}>{s.name}</td>
                  <td style={{padding:"6px 8px",textAlign:"center",borderBottom:"1px solid #f1f5f9"}}>
                    <span style={{padding:"2px 6px",borderRadius:4,background:"#f1f5f9",color:"#475569",fontSize:10.5,fontWeight:600}}>{s.grade}</span>
                  </td>
                  <QYCell q={s.q.total} yr={s.yr.total} bold/>
                  <QYCell q={s.q.weWorked} yr={s.yr.weWorked}/>
                  <QYCell q={s.q.nights}   yr={s.yr.nights}   bg="#ede9fe" fg="#4c1d95"/>
                  <QYCell q={s.q.earlies}  yr={s.yr.earlies}  bg="#dcfce7" fg="#14532d"/>
                  <QYCell q={s.q.mids}     yr={s.yr.mids}     bg="#dbeafe" fg="#1e3a8a"/>
                  <QYCell q={s.q.lates}    yr={s.yr.lates}    bg="#fef3c7" fg="#78350f"/>
                  <td style={{padding:"6px 8px",textAlign:"center",borderBottom:"1px solid #f1f5f9",borderLeft:"1px solid #f4f6fb"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                      <span style={{fontWeight:700,fontSize:13,padding:"2px 8px",borderRadius:4,
                        background:s.slYr>0?"#fef3c7":"#f1f5f9",
                        color:s.slYr>0?"#92400e":"#94a3b8"}}>{s.slYr}</span>
                      {s.slEntitlement>0&&<span style={{fontSize:10,color:"#94a3b8"}}>/ {s.slEntitlement}</span>}
                    </div>
                  </td>
                  <td style={{padding:"6px 8px",textAlign:"center",borderBottom:"1px solid #f1f5f9",borderLeft:"1px solid #f4f6fb"}}>
                    {s.milEntitlement>0
                      ?<div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                          <span style={{fontWeight:700,fontSize:13,padding:"2px 8px",borderRadius:4,background:s.milYr>0?"#dcfce7":"#f1f5f9",color:s.milYr>0?"#166534":"#94a3b8"}}>{s.milYr}</span>
                          <span style={{fontSize:10,color:"#94a3b8"}}>/ {s.milEntitlement}</span>
                        </div>
                      :<span style={{fontSize:11,color:"#cbd5e1"}}>—</span>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{padding:"8px 18px",borderTop:"1px solid #f1f5f9",fontSize:10.5,color:"#94a3b8"}}>
            Shifts show <strong style={{color:"#374151"}}>{selQ} count</strong> / <strong style={{color:"#374151"}}>Year total</strong> · SL &amp; Military show year totals only · includes leave entries, availability entries &amp; approved requests
          </div>
        </div>
      </div>)}
      {tab==="christmas"&&isAdmin&&(()=>{
        const allStaff = staff.filter(s=>s.role==="staff"&&s.active);
        const xmasPeriods = (specialPeriods||[]);

        if (xmasPeriods.length===0) return (
          <div className="card">
            <div className="ch"><span className="ct">🎄 Christmas Summary</span></div>
            <div className="cb"><div className="al al-i">No special periods defined yet. Go to <strong>Year Setup → Special Periods</strong> to add a Christmas period.</div></div>
          </div>
        );

        return xmasPeriods.map(sp=>{
          const dates = getDatesInRange(sp.start, sp.end);
          const keyDates = dates.filter(d=>{
            const mmdd = d.slice(5);
            return ['12-24','12-25','12-26','12-31'].includes(mmdd) || d.slice(5)==='01-01' || d.slice(5)==='01-02';
          });
          const displayDates = keyDates.length ? keyDates : dates.slice(0,10);

          const dayLabel = d=>{
            const mmdd=d.slice(5);
            if(mmdd==='12-24') return 'Christmas Eve';
            if(mmdd==='12-25') return 'Christmas Day';
            if(mmdd==='12-26') return 'Boxing Day';
            if(mmdd==='12-31') return "New Year's Eve";
            if(mmdd==='01-01') return "New Year's Day";
            if(mmdd==='01-02') return '2nd Jan';
            return new Date(d+'T00:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
          };

          return (
            <div key={sp.id} className="card" style={{marginBottom:16}}>
              <div className="ch"><span className="ct">{sp.emoji} {sp.name} <span style={{fontWeight:400,fontSize:12,color:"#64748b"}}>{sp.start} – {sp.end}</span></span></div>
              <div className="cb">

                {/* Preference summary */}
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#475569",marginBottom:8,textTransform:"uppercase",letterSpacing:".5px"}}>Staff Preferences</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {allStaff.map(s=>{
                      const pref = s.xmasPref||"any";
                      const prefLabel = pref==="christmas"?"🎄 Xmas":(pref==="newyear"?"🥂 NY":(pref==="both_ok"?"✅ Either":"—"));
                      const prevXmas = s.workedXmas2025;
                      const prevNY = s.workedNY2025;
                      return (
                        <div key={s.init} style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:7,padding:"6px 10px",fontSize:11.5,minWidth:120}}>
                          <div style={{fontWeight:700,color:"#0d1b2a"}}>{s.name}</div>
                          <div style={{color:"#64748b",marginTop:1}}>Pref: <strong>{prefLabel}</strong></div>
                          {(prevXmas||prevNY)&&<div style={{fontSize:10,color:"#94a3b8",marginTop:1}}>
                            Last yr: {prevXmas?"🎄":""}  {prevNY?"🥂":""}
                          </div>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Key date assignments */}
                <div style={{fontSize:12,fontWeight:700,color:"#475569",marginBottom:8,textTransform:"uppercase",letterSpacing:".5px"}}>Key Date Assignments</div>
                {displayDates.map(d=>{
                  const slots = rota[d]||{};
                  const assigned = Object.entries(slots).filter(([,v])=>v).map(([sk,init])=>({sk,init,staff:allStaff.find(s=>s.init===init)}));
                  const empty = assigned.length===0;
                  return (
                    <div key={d} style={{marginBottom:10,padding:"10px 12px",background:empty?"#fff7ed":"#f8fafc",border:`1px solid ${empty?"#fed7aa":"#e2e8f0"}`,borderRadius:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                        <span style={{fontWeight:800,fontSize:13,color:"#0d1b2a"}}>{dayLabel(d)}</span>
                        <span style={{fontSize:11,color:"#64748b"}}>{new Date(d+'T00:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</span>
                        {empty&&<span style={{background:"#fed7aa",color:"#92400e",borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:700}}>NOT YET ASSIGNED</span>}
                      </div>
                      {!empty&&(
                        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                          {assigned.map(({sk,init,staff:s})=>{
                            const workedXmasLast = d.slice(5)==='12-25'&&s?.workedXmas2025;
                            const workedNYLast = d.slice(5)==='01-01'&&s?.workedNY2025;
                            const flagRepeat = workedXmasLast||workedNYLast;
                            return (
                              <span key={sk} style={{display:"inline-flex",alignItems:"center",gap:4,background:"white",border:`1px solid ${flagRepeat?"#fca5a5":"#e2e8f0"}`,borderRadius:6,padding:"3px 8px",fontSize:11.5}}>
                                <code style={{fontSize:10,background:"#f1f5f9",padding:"1px 4px",borderRadius:3}}>{sk}</code>
                                <span style={{fontWeight:600}}>{s?.name||init}</span>
                                {flagRepeat&&<span title="Also worked this day last year" style={{fontSize:10,color:"#ef4444"}}>⚠️ repeat</span>}
                                {s?.xmasPref==="christmas"&&d.slice(5)==='12-25'&&<span title="Requested Christmas" style={{fontSize:10}}>🎄✓</span>}
                                {s?.xmasPref==="newyear"&&d.slice(5)==='01-01'&&<span title="Requested New Year" style={{fontSize:10}}>🥂✓</span>}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Fairness summary */}
                <div style={{marginTop:16,fontSize:12,fontWeight:700,color:"#475569",marginBottom:8,textTransform:"uppercase",letterSpacing:".5px"}}>Fairness — Who Hasn't Worked Christmas/NY Yet</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {allStaff.filter(s=>!s.workedXmas2025&&!s.workedNY2025).map(s=>(
                    <span key={s.init} style={{background:"#ecfdf5",border:"1px solid #6ee7b7",borderRadius:6,padding:"3px 8px",fontSize:11.5,color:"#065f46"}}>✓ {s.name}</span>
                  ))}
                  {allStaff.filter(s=>s.workedXmas2025||s.workedNY2025).map(s=>(
                    <span key={s.init} style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:6,padding:"3px 8px",fontSize:11.5,color:"#64748b"}}>
                      {s.name} {s.workedXmas2025&&s.workedNY2025?"(did both)":s.workedXmas2025?"(did Xmas)":"(did NY)"}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        });
      })()}
    </div>
  );
}

export default Reports
