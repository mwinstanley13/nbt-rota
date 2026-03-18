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

  // For list view: get a single cell value for one staff member on one date
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
  const monthDays=days.filter(d=>d.inMonth);
  const staffColStyle = visStaff.length <= 6 ? {minWidth:Math.max(100, Math.floor(600/visStaff.length))+"px", width:"auto"} : undefined;

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
      /* ── CALENDAR VIEW ── */
      <div className="card">
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
      )}

      {/* Day modal (calendar view only) */}
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
