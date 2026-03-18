import React, { useState, useMemo } from 'react'
import { BH, QUARTERS } from '../constants/quarters'
import { SLOTS } from '../constants/slots'
import { LEAVE_T } from '../constants/leaveTypes'
import { fmtISO, fmtDisp, getDayName, isWeekend, getMonthDays, getDatesInRange } from '../utils/dates'
import Modal from './Modal'

// Short label for list view cells — group name only (Early / Mid / Late etc.)
const LIST_GRP_LABEL = {
  EARLY:"Early", MID:"Mid", LATE:"Late",
  WE_EARLY:"W/E Early", WE_LATE:"W/E Late",
  NIGHT1:"Night 1", NIGHT2:"Night 2",
  ST3_NIGHT:"Night ST3", ACP_NIGHT:"Night ACP"
};

const GRP_SHORT = {EARLY:"Early",MID:"Mid",LATE:"Late",WE_EARLY:"W/E Early",WE_LATE:"W/E Late",NIGHT1:"SDM Night 1",NIGHT2:"SDM Night 2",ST3_NIGHT:"ST3 Night",ACP_NIGHT:"ACP Night"};
const slotCalLabel = sl => sl.grp ? (GRP_SHORT[sl.grp] || sl.key) : sl.key;

function CalendarView({rota,leaveEntries,dayNotes,staff,viewMonth,setViewMonth,viewMode,setViewMode,trainingDays,quarters}) {
  const [fStaff,setFS]=useState(""), [dayModal,setDM]=useState(null);
  const [isList,setIsList]=useState(false);
  const [listQ,setListQ]=useState("Q1");
  const today=fmtISO(new Date()), yr=viewMonth.getFullYear(), mo=viewMonth.getMonth();
  const [selectedDate,setSelDate]=useState(today);
  const tdMap=useMemo(()=>Object.fromEntries((trainingDays||[]).map(t=>[t.date,t])),[trainingDays]);
  const days=useMemo(()=>getMonthDays(yr,mo),[yr,mo]);
  const DOW=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const activeStaff=staff.filter(s=>s.role==="staff"&&s.active);
  const activeQs = quarters || QUARTERS;
  const listQDef = activeQs.find(q=>q.id===listQ)||activeQs[0];
  const quarterDays = useMemo(()=> listQDef ? getDatesInRange(listQDef.start, listQDef.end) : [], [listQDef]);

  const getDateStaff=(d)=>{
    const result=[];
    const slots=rota[d]||{};
    Object.entries(slots).forEach(([sk,init])=>{if(init&&(!fStaff||init===fStaff)){const sl=SLOTS.find(s=>s.key===sk);if(sl)result.push({init,slot:sl});}});
    (leaveEntries[d]||[]).forEach(e=>{if(!fStaff||e.init===fStaff){const lt=LEAVE_T[e.type];if(lt)result.push({init:e.init,slot:{...lt,key:e.type,label:lt.label}});}});
    return result;
  };

  const getCell=(init,date)=>{
    const rotaDay=rota[date]||{};
    const sk=Object.entries(rotaDay).find(([,v])=>v===init)?.[0];
    if(sk){const sl=SLOTS.find(s=>s.key===sk);if(sl)return{text:fStaff?sl.label:LIST_GRP_LABEL[sl.grp]||sl.label,bg:sl.bg,fg:sl.fg,bd:sl.bd};}
    const lv=(leaveEntries[date]||[]).find(e=>e.init===init);
    if(lv){const lt=LEAVE_T[lv.type];if(lt)return{text:fStaff?lt.label:lt.abbr||lv.type,bg:lt.bg,fg:lt.fg,bd:lt.bd};}
    return null;
  };

  const nav=delta=>{const d=new Date(viewMonth);d.setMonth(d.getMonth()+delta);setViewMonth(d);};
  const label=viewMonth.toLocaleDateString("en-GB",{month:"long",year:"numeric"});
  const visStaff=fStaff?activeStaff.filter(s=>s.init===fStaff):activeStaff;
  const staffColStyle = visStaff.length <= 6 ? {minWidth:Math.max(100, Math.floor(600/visStaff.length))+"px", width:"auto"} : undefined;

  // Mobile: navigate day by day, track month changes
  const navDay = delta => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + delta);
    const next = fmtISO(d);
    setSelDate(next);
    if (d.getMonth() !== mo || d.getFullYear() !== yr) {
      setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  };

  const selItems = getDateStaff(selectedDate);
  const selDateObj = new Date(selectedDate + "T00:00:00");
  const selWeekday = selDateObj.toLocaleDateString("en-GB",{weekday:"long"});
  const selDateStr = selDateObj.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});

  return (
    <div>
      {/* Top bar */}
      <div className="cal-top">
        {!isList&&<div className="cal-nav"><button onClick={()=>nav(-1)}>‹</button><div className="cal-mo">{label}</div><button onClick={()=>nav(1)}>›</button></div>}
        {isList&&(
          <div className="mtog">
            {activeQs.map(q=><button key={q.id} className={`mtog-btn${listQ===q.id?" act":""}`} onClick={()=>setListQ(q.id)}>{q.id}</button>)}
          </div>
        )}
        <select className="fi" style={{width:160}} value={fStaff} onChange={e=>setFS(e.target.value)}>
          <option value="">All Staff</option>{activeStaff.map(s=><option key={s.id} value={s.init}>{s.name}</option>)}
        </select>
        <div className="mtog">
          <button className={`mtog-btn${!isList?" act":""}`} onClick={()=>setIsList(false)}>📅 Calendar</button>
          <button className={`mtog-btn${isList?" act":""}`} onClick={()=>setIsList(true)}>📋 List</button>
        </div>
      </div>

      {/* ── LIST VIEW ── */}
      {isList?(
        <div className="list-wrap">
          <table className="list-tbl">
            <thead>
              <tr>
                <th className="list-th-date">Date</th>
                <th className="list-th-day">Day</th>
                {visStaff.map(s=>(
                  <th key={s.init} className="list-th-staff" style={staffColStyle}>
                    <div style={{fontSize:9.5,fontWeight:600,color:"#374151",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.name.split(" ").slice(-1)[0]}</div>
                    <div style={{color:"#6366f1",fontWeight:800,fontSize:11.5}}>{s.init}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quarterDays.map(date=>{
                const isWE=isWeekend(date),isBH=!!BH[date],isToday=date===today;
                const rowBg=isToday?"#f0fdf4":isBH?"#fffbeb":isWE?"#f8f7ff":"white";
                const stickyBg=isToday?"#e8faf3":isBH?"#fef9e7":isWE?"#f4f3ff":"white";
                const dayNum=new Date(date+"T00:00:00");
                return (
                  <tr key={date} style={{background:rowBg}}>
                    <td className="list-td-date" style={{background:stickyBg}}>
                      <span style={{fontWeight:isToday?700:500,color:isToday?"#059669":"#0d1b2a",fontSize:11.5}}>
                        {dayNum.toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}
                      </span>
                      {isBH&&<span className="bh-tag" style={{marginLeft:5}}>BH</span>}
                    </td>
                    <td className="list-td-day" style={{background:stickyBg,color:isWE?"#7c3aed":isToday?"#059669":"#64748b",fontWeight:isWE||isToday?700:500}}>
                      {getDayName(date).slice(0,3)}
                    </td>
                    {visStaff.map(s=>{
                      const cell=getCell(s.init,date);
                      return (
                        <td key={s.init} className="list-td-cell" style={{background:rowBg,...staffColStyle}}>
                          {cell&&<span className="list-chip" style={{background:cell.bg,color:cell.fg,borderColor:cell.bd}}>{cell.text}</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ):(
      <>
        {/* ── DESKTOP CALENDAR VIEW ── */}
        <div className="card cal-desktop-only">
          <div className="cg">
            {DOW.map(d=><div key={d} className="cdow">{d}</div>)}
            {days.map(({date,inMonth})=>{
              const isBH=!!BH[date],isToday=date===today,we=isWeekend(date),items=getDateStaff(date),note=dayNotes[date],MAX=3;
              const td=tdMap[date];
              const tdBg=td?(td.type==="SpR"?"rgba(254,240,138,.55)":"rgba(243,232,255,.65)"):null;
              return (
                <div key={date} className={`cc${!inMonth?" om":""}${isToday?" td":""}${isBH?" bh":!inMonth?"":we?" we":""}`} onClick={()=>inMonth&&setDM(date)} style={tdBg?{background:tdBg}:undefined}>
                  <div className={`cdate${!inMonth?" om":""}`}>
                    <span className={isToday?"td-num":""}>{new Date(date+"T00:00:00").getDate()}</span>
                    {isBH&&<span className="bh-tag">BH</span>}
                    {td&&<span style={{fontSize:7.5,fontWeight:700,padding:"0px 3px",borderRadius:2,background:td.type==="SpR"?"#fef08a":"#e9d5ff",color:td.type==="SpR"?"#713f12":"#6b21a8",marginLeft:2}}>{td.type}</span>}
                  </div>
                  {note&&<div style={{fontSize:8,color:"#92400e",background:"#fef9c3",padding:"1px 3px",borderRadius:3,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📌</div>}
                  {items.slice(0,MAX).map((x,i)=><span key={i} className="chip-sm" style={{background:x.slot.bg,color:x.slot.fg,borderColor:x.slot.bd}}>{fStaff ? slotCalLabel(x.slot) : x.init}</span>)}
                  {items.length>MAX&&<div className="more">+{items.length-MAX}</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── MOBILE CALENDAR VIEW ── */}
        <div className="cal-mobile-only">
          {/* Compact month mini-grid */}
          <div className="card" style={{marginBottom:12,overflow:"hidden"}}>
            <div className="cal-mobile-grid" style={{borderBottom:"2px solid #e2e8f0",background:"#f8fafc"}}>
              {DOW.map(d=><div key={d} style={{textAlign:"center",padding:"6px 2px",fontSize:"9px",fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".5px"}}>{d.slice(0,1)}</div>)}
            </div>
            <div className="cal-mobile-grid">
              {days.map(({date,inMonth})=>{
                const isBH=!!BH[date],isToday=date===today,we=isWeekend(date),isSel=date===selectedDate;
                const items=inMonth?getDateStaff(date):[];
                const dots=items.slice(0,4).map(x=>x.slot.bg||"#94a3b8");
                let cellBg = "white";
                if(!inMonth) cellBg="#fafafa";
                else if(isSel) cellBg="#dbeafe";
                else if(isToday) cellBg="#f0fdf4";
                else if(isBH) cellBg="#fffbeb";
                else if(we) cellBg="#fafaff";
                return (
                  <div key={date}
                    className="cal-mobile-day"
                    style={{background:cellBg,borderRight:"1px solid #e8edf5",borderBottom:"1px solid #e8edf5",cursor:inMonth?"pointer":"default",borderTop:isBH&&inMonth?"2px solid #fde047":undefined}}
                    onClick={()=>{if(inMonth)setSelDate(date);}}>
                    <div className={`cal-mobile-num${isToday?" tod":""}${isSel?" sel":""}`}
                      style={{color:!inMonth?"#c0c8d0":we?"#7c3aed":"inherit"}}>
                      {new Date(date+"T00:00:00").getDate()}
                    </div>
                    {dots.length>0&&(
                      <div style={{display:"flex",gap:2,flexWrap:"wrap",justifyContent:"center",maxWidth:24}}>
                        {dots.map((bg,i)=><span key={i} className="cal-day-dot" style={{background:bg}}/>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Day detail panel */}
          <div className="cal-day-detail">
            <div className="cal-day-nav">
              <button onClick={()=>navDay(-1)}>‹</button>
              <div className="cal-day-nav-title">
                <div className="cal-day-nav-weekday">{selWeekday}</div>
                <div className="cal-day-nav-date">{selDateStr}{BH[selectedDate]&&<span style={{marginLeft:6,fontSize:9,fontWeight:700,background:"#fde047",color:"#713f12",padding:"1px 4px",borderRadius:3}}>BH</span>}</div>
                {dayNotes[selectedDate]&&<div style={{fontSize:10,color:"#92400e",background:"#fef9c3",borderRadius:4,padding:"2px 8px",marginTop:3}}>📌 {dayNotes[selectedDate]}</div>}
              </div>
              <button onClick={()=>navDay(1)}>›</button>
            </div>
            <div className="cal-day-detail-list">
              {selItems.length===0
                ? <p style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:"12px 0"}}>No shifts assigned for this day.</p>
                : selItems.map((x,i)=>{
                    const s=staff.find(st=>st.init===x.init);
                    return (
                      <div key={i} className="cal-day-detail-row">
                        <div className="cal-day-detail-who">
                          <span className="cal-day-detail-init">{x.init}</span>
                          <div style={{minWidth:0}}>
                            <div className="cal-day-detail-name">{s?.name||x.init}</div>
                          </div>
                        </div>
                        <span className="cal-day-detail-grade">{s?.grade||""}</span>
                        <span className="chip" style={{background:x.slot.bg,color:x.slot.fg,borderColor:x.slot.bd,fontSize:10.5,flexShrink:0}}>{x.slot.label}</span>
                      </div>
                    );
                  })
              }
            </div>
          </div>
        </div>
      </>
      )}

      {/* Day modal (desktop only) */}
      {dayModal&&(
        <Modal title={`${getDayName(dayModal)}, ${fmtDisp(dayModal)}${BH[dayModal]?" · "+BH[dayModal]:""}`} onClose={()=>setDM(null)} footer={<button className="btn bs" onClick={()=>setDM(null)}>Close</button>}>
          {dayNotes[dayModal]&&<div className="al al-w">📌 {dayNotes[dayModal]}</div>}
          {getDateStaff(dayModal).length===0?<p style={{color:"#94a3b8",fontSize:12}}>No shifts assigned.</p>
            :<table className="tbl"><thead><tr><th>Staff</th><th>Grade</th><th>Shift</th></tr></thead><tbody>
              {getDateStaff(dayModal).map((x,i)=>{const s=staff.find(st=>st.init===x.init);return(
                <tr key={i}><td style={{fontWeight:600}}>{s?.name||x.init}</td><td style={{color:"#64748b"}}>{s?.grade||""}</td>
                <td><span className="chip" style={{background:x.slot.bg,color:x.slot.fg,borderColor:x.slot.bd,fontSize:10.5}}>{x.slot.label}</span></td></tr>
              );})}
            </tbody></table>
          }
        </Modal>
      )}
    </div>
  );
}

export default CalendarView
