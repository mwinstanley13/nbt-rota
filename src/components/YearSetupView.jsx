import React, { useState } from 'react'
import { QUARTERS } from '../constants/quarters.js'
import { SLOTS } from '../constants/slots.js'
import { LEAVE_T } from '../constants/leaveTypes.js'
import { BH } from '../constants/quarters.js'
import { fmtISO, getDatesInRange } from '../utils/dates.js'
import { normaliseAvailEntry } from '../utils/availability.js'
import { INIT_WTE_CONFIG } from '../constants/staff.js'

function YearSetupView({years,setYears,activeYearId,setActiveYearId,staff,
  rotaByYear,leaveByYear,availByYear,qStatusByYear,requestsByYear,notesByYear,corrsByYear,staffHoursByYear,
  swapsByYear,fixedDaysOff,wteConfig,
  setQStatusByYear,addAudit,currentUser}) {

  const addWeeks = (dateStr, weeks) => {
    const d = new Date(dateStr); d.setDate(d.getDate()+weeks*7); return fmtISO(d);
  };
  const addDays = (dateStr, n) => {
    const d = new Date(dateStr); d.setDate(d.getDate()+n); return fmtISO(d);
  };

  const latestYear = years.reduce((a,b)=>a.id>b.id?a:b, years[0]);
  const latestQ4End = latestYear?.quarters?.find(q=>q.id==="Q4")?.end || "2027-08-03";
  const defQ1Start = addDays(latestQ4End, 1);

  const defQuarters = (q1s) => [
    {id:"Q1",label:`Q1`,start:q1s,end:addDays(addWeeks(q1s,13),-1)},
    {id:"Q2",label:`Q2`,start:addWeeks(q1s,13),end:addDays(addWeeks(q1s,26),-1)},
    {id:"Q3",label:`Q3`,start:addWeeks(q1s,26),end:addDays(addWeeks(q1s,39),-1)},
    {id:"Q4",label:`Q4`,start:addWeeks(q1s,39),end:addDays(addWeeks(q1s,52),-1)},
  ];

  const [newLabel, setNewLabel] = useState("");
  const [newQ1Start, setNewQ1Start] = useState(defQ1Start);
  const [qs, setQs] = useState(() => defQuarters(defQ1Start));

  const updateQ1Start = (val) => {
    setNewQ1Start(val);
    if (val) setQs(defQuarters(val));
  };

  const createYear = () => {
    if (!newLabel.trim()) return;
    const yid = newLabel.trim().replace(/\s+/g,"-").replace(/[^a-zA-Z0-9\-]/g,"");
    if (years.find(y=>y.id===yid)) { alert("A year with this ID already exists."); return; }
    const newYear = {id:yid,label:newLabel.trim(),quarters:qs,active:true,archived:false};
    setYears(p=>[...p,newYear]);
    setQStatusByYear(p=>({...p,[yid]:{Q1:"open",Q2:"closed",Q3:"closed",Q4:"closed"}}));
    addAudit(currentUser.init,"Year Created",yid);
    setActiveYearId(yid);
    setNewLabel("");
    setNewQ1Start(defQ1Start);
  };

  const archiveYear = (yid) => {
    if (!window.confirm(`Archive "${yid}"? It will be read-only. You can still view and download it.`)) return;
    setYears(p=>p.map(y=>y.id===yid?{...y,archived:true}:y));
    if (activeYearId===yid) {
      const other = years.find(y=>y.id!==yid&&!y.archived);
      if (other) setActiveYearId(other.id);
    }
    addAudit(currentUser.init,"Year Archived",yid);
  };

  const downloadYear = (yid) => {
    const XLSX = window.XLSX;
    if (!XLSX) { alert("Excel library not loaded yet — please wait a moment and try again."); return; }

    const yr       = years.find(y=>y.id===yid);
    const rota     = rotaByYear[yid]||{};
    const leave    = leaveByYear[yid]||{};
    const avail    = availByYear[yid]||{};
    const qStatus  = qStatusByYear[yid]||{};
    const reqs     = requestsByYear[yid]||[];
    const swaps    = swapsByYear?.[yid]||[];
    const qsList   = yr?.quarters||QUARTERS;
    const allDates = Object.keys(rota).sort();
    const activeStaff = staff.filter(s=>s.role==="staff"&&s.active).sort((a,b)=>a.name.localeCompare(b.name));
    const allStaff    = staff.filter(s=>s.role==="staff").sort((a,b)=>a.name.localeCompare(b.name));
    const wte         = wteConfig||INIT_WTE_CONFIG;
    const sHours      = staffHoursByYear?.[yid]||{};
    const genDate     = new Date().toLocaleDateString("en-GB");
    const wb = XLSX.utils.book_new();
    const addSheet = (name,rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);

    const dow = d => new Date(d+"T00:00:00").toLocaleDateString("en-GB",{weekday:"short"});
    const GRP = {EARLY:"Early",MID:"Mid",LATE:"Late",WE_EARLY:"W/E Early",WE_LATE:"W/E Late",NIGHT1:"Night 1",NIGHT2:"Night 2",ST3_NIGHT:"Night ST3",ACP_NIGHT:"Night ACP"};
    const cellForStaff = (init,date) => {
      const sk = Object.entries(rota[date]||{}).find(([,v])=>v===init)?.[0];
      if(sk){const sl=SLOTS.find(x=>x.key===sk);return GRP[sl?.grp]||sk;}
      const lv=(leave[date]||[]).find(e=>e.init===init);
      return lv ? (LEAVE_T[lv.type]?.abbr||lv.type) : "";
    };
    const usedSlots = SLOTS.filter(sl=>allDates.some(d=>rota[d]?.[sl.key]));

    addSheet("Rota",[
      [`RotaFlow Export — ${yr?.label||yid}`,`Generated: ${genDate}`],
      [],
      ["Date","Day","BH",...usedSlots.map(s=>s.key)],
      ...allDates.map(d=>[d,dow(d),BH[d]||"",...usedSlots.map(s=>rota[d]?.[s.key]||"")]),
    ]);

    addSheet("Staff View",[
      [`RotaFlow — Staff View — ${yr?.label||yid}`],
      [],
      ["Date","Day",...activeStaff.map(s=>s.name)],
      ["","Grade",...activeStaff.map(s=>s.grade)],
      ["","Init",...activeStaff.map(s=>s.init)],
      ...allDates.map(d=>[d,dow(d),...activeStaff.map(s=>cellForStaff(s.init,d))]),
    ]);

    const grpKeys = Object.keys(GRP);
    addSheet("Shift Summary",[
      [`RotaFlow — Shift Summary — ${yr?.label||yid}`],
      [],
      ["Name","Initials","Grade","Total",...grpKeys.map(g=>GRP[g])],
      ...activeStaff.map(s=>{
        const counts={};grpKeys.forEach(g=>{counts[g]=0;});
        allDates.forEach(d=>{const sk=Object.entries(rota[d]||{}).find(([,v])=>v===s.init)?.[0];if(sk){const sl=SLOTS.find(x=>x.key===sk);if(sl?.grp)counts[sl.grp]=(counts[sl.grp]||0)+1;}});
        const tot=Object.values(counts).reduce((a,b)=>a+b,0);
        return [s.name,s.init,s.grade,tot,...grpKeys.map(g=>counts[g]||"")];
      }),
    ]);

    addSheet("Staff",[
      [`RotaFlow — Staff List — ${yr?.label||yid}`],
      [],
      ["Name","Initials","Grade","Role","Active","Q1 WTE","Q2 WTE","Q3 WTE","Q4 WTE"],
      ...allStaff.map(s=>[s.name,s.init,s.grade||"",s.role,s.active?"Yes":"No",
        sHours[s.init]?.Q1??1.0,sHours[s.init]?.Q2??1.0,sHours[s.init]?.Q3??1.0,sHours[s.init]?.Q4??1.0]),
    ]);

    const leaveRows=[["Date","Day","Name","Initials","Grade","Type","Note"]];
    Object.entries(leave).sort(([a],[b])=>a.localeCompare(b)).forEach(([date,entries])=>{
      (entries||[]).forEach(e=>{const s=staff.find(x=>x.init===e.init);leaveRows.push([date,dow(date),s?.name||e.init,e.init,s?.grade||"",e.type,e.note||""]);});
    });
    addSheet("Leave",[[`RotaFlow — Leave — ${yr?.label||yid}`],[],[...leaveRows[0]],...leaveRows.slice(1)]);

    const reqRows=[["Name","Initials","Type","From","To","Days","Reason","Status","Submitted"]];
    [...reqs].sort((a,b)=>(a.startDate||"").localeCompare(b.startDate||"")).forEach(r=>{
      reqRows.push([r.staffName||"",r.init||"",r.type||"",r.startDate||"",r.endDate||"",r.days||1,r.reason||"",r.status||"",r.createdAt||""]);
    });
    addSheet("Leave Requests",[[`RotaFlow — Leave Requests — ${yr?.label||yid}`],[],[...reqRows[0]],...reqRows.slice(1)]);

    const swapRows=[["Date","Slot","From Init","From Name","To Init","To Name","Status","Requested"]];
    [...swaps].sort((a,b)=>(a.date||"").localeCompare(b.date||"")).forEach(sw=>{
      const fS=staff.find(s=>s.init===sw.fromInit),tS=staff.find(s=>s.init===sw.toInit);
      swapRows.push([sw.date||"",sw.slotKey||"",sw.fromInit||"",fS?.name||"",sw.toInit||"",tS?.name||"",sw.status||"",sw.createdAt||""]);
    });
    addSheet("Swaps",[[`RotaFlow — Shift Swaps — ${yr?.label||yid}`],[],[...swapRows[0]],...swapRows.slice(1)]);

    const fdRows=[["Name","Initials","Day of Week","Reason"]];
    (fixedDaysOff||[]).forEach(f=>{fdRows.push([f.name||"",f.init||"",f.dayOfWeek||"",f.reason||""]);});
    addSheet("Fixed Days Off",[[`RotaFlow — Fixed Days Off`],[],[...fdRows[0]],...fdRows.slice(1)]);

    const qDates=qsList.flatMap(q=>getDatesInRange(q.start,q.end));
    addSheet("Availability",[
      [`RotaFlow — Availability — ${yr?.label||yid}`],
      [],
      ["Date","Day","Quarter",...activeStaff.map(s=>s.name)],
      ["","","Init",...activeStaff.map(s=>s.init)],
      ...qDates.map(d=>{
        const q=qsList.find(q=>d>=q.start&&d<=q.end);
        return [d,dow(d),q?.id||"",...activeStaff.map(s=>{
          const e=normaliseAvailEntry((avail[s.init]||{})[d]);
          return (e&&e.base&&e.base!=="ANY")?e.base:"";
        })];
      }),
    ]);

    const corrections = corrsByYear?.[yid]||[];
    const corrRows=[["Quarter","Name","Initials","Amount (hrs)","Reason","Carry Forward","Created By","Date"]];
    [...corrections].sort((a,b)=>(a.qid||"").localeCompare(b.qid||"")).forEach(c=>{
      const s=staff.find(x=>x.init===c.init);
      corrRows.push([c.qid||"",s?.name||c.init||"",c.init||"",c.amount||0,c.reason||"",c.carryForward?"Yes":"No",c.createdBy||"",c.createdAt||""]);
    });
    addSheet("Hour Adjustments",[[`RotaFlow — Hour Adjustments — ${yr?.label||yid}`],[],[...corrRows[0]],...corrRows.slice(1)]);

    const notesData = notesByYear?.[yid]||{};
    const noteRows=[["Date","Day","Note"]];
    Object.entries(notesData).sort(([a],[b])=>a.localeCompare(b)).forEach(([date,note])=>{
      if(note) noteRows.push([date,dow(date),note]);
    });
    addSheet("Day Notes",[[`RotaFlow — Day Notes — ${yr?.label||yid}`],[],[...noteRows[0]],...noteRows.slice(1)]);

    addSheet("Config",[
      ["RotaFlow Configuration","",`Year: ${yr?.label||yid}`,"",`Generated: ${genDate}`],
      [],
      ["=== QUARTERS ==="],
      ["Quarter","Start","End","Status"],
      ...qsList.map(q=>[q.id,q.start,q.end,qStatus[q.id]||"open"]),
      [],
      ["=== WTE REFERENCE TARGETS (per quarter at 1.0 WTE) ==="],
      ["Grade","Nights","Weekends","Earlies","Mids","Lates","Hours/Q"],
      ...Object.entries(wte).map(([grade,cfg])=>[grade,cfg.nights||"",cfg.weekends||"",cfg.earlies||"",cfg.mids||"",cfg.lates||"",cfg.hoursPerQuarter||""]),
      [],
      ["=== SHIFT SLOTS ==="],
      ["Key","Label","Group","Weekday","Weekend"],
      ...SLOTS.map(s=>[s.key,s.label,s.grp,s.wd?"Yes":"No",s.we?"Yes":"No"]),
      [],
      ["=== LEAVE TYPES ==="],
      ["Code","Label"],
      ...Object.entries(LEAVE_T).map(([k,v])=>[k,v.label]),
    ]);

    XLSX.writeFile(wb,`RotaFlow-${yid}-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div style={{maxWidth:780,margin:"0 auto"}}>
      <div className="card" style={{marginBottom:20}}>
        <div className="ch"><span className="ct">All Years</span></div>
        <div className="cb">
          {years.length===0?<p style={{color:"#94a3b8",fontSize:12}}>No years configured.</p>
          :years.map(y=>(
            <div key={y.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid #f1f5f9"}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13}}>{y.label} <span style={{fontSize:11,color:"#94a3b8",fontWeight:400}}>({y.id})</span></div>
                <div style={{fontSize:11,color:"#64748b",marginTop:2}}>
                  {y.quarters?.map(q=>`${q.id}: ${q.start}→${q.end}`).join(" · ")}
                </div>
              </div>
              {y.archived
                ? <span className="badge" style={{background:"#f1f5f9",color:"#64748b"}}>Archived</span>
                : <span className="badge b-open">{y.id===activeYearId?"Active":"Inactive"}</span>}
              {!y.archived&&y.id!==activeYearId&&<button className="btn bp bsm" onClick={()=>setActiveYearId(y.id)}>Switch to</button>}
              {!y.archived&&<button className="btn bw bsm" onClick={()=>archiveYear(y.id)}>Archive</button>}
              <button className="btn bd bsm" onClick={()=>downloadYear(y.id)}>⬇ Download</button>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="ch"><span className="ct">Create New Year</span></div>
        <div className="cb">
          <div className="al al-i" style={{marginBottom:16}}>
            Create a new rota year. Staff are shared across all years. Enter a label (e.g. "2027/28") and the Q1 start date — quarters will be calculated automatically at 13-week intervals.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
            <div className="fg" style={{marginBottom:0}}>
              <label className="fl">Year label</label>
              <input className="fi" value={newLabel} onChange={e=>setNewLabel(e.target.value)} placeholder="e.g. 2027/28"/>
            </div>
            <div className="fg" style={{marginBottom:0}}>
              <label className="fl">Q1 start date</label>
              <input type="date" className="fi" value={newQ1Start} onChange={e=>updateQ1Start(e.target.value)}/>
            </div>
          </div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:600,color:"#374151",marginBottom:8}}>Calculated quarters (edit Q1 start to adjust all):</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
              {qs.map((q)=>(
                <div key={q.id} style={{background:"#f8fafc",borderRadius:8,padding:"8px 10px",fontSize:11}}>
                  <div style={{fontWeight:700,marginBottom:3}}>{q.id}</div>
                  <div style={{color:"#64748b"}}>{q.start}</div>
                  <div style={{color:"#94a3b8"}}>→ {q.end}</div>
                </div>
              ))}
            </div>
          </div>
          <button className="btn bp" onClick={createYear} disabled={!newLabel.trim()}>Create Year</button>
        </div>
      </div>
    </div>
  );
}

export default YearSetupView
