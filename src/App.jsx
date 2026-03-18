import React, { useState, useEffect, useRef, useMemo } from 'react'
import firebase from './firebase'
import { db } from './firebase'
import { IS_DEMO, LS_PFX, lsGet, lsSave } from './utils/storage'
import { INIT_STAFF, INIT_WTE_CONFIG } from './constants/staff'
import { QUARTERS, BH } from './constants/quarters'
import { SLOTS } from './constants/slots'
import { INIT_GEN_RULES, DEFAULT_SYS_RULES, DEFAULT_SHIFT_TIMES } from './constants/rules'
import { fmtISO } from './utils/dates'
import { getHoursRemaining } from './utils/rota'
import { generateDemoAvailability } from './utils/availability'
import { showNotification } from './utils/notifications'

import Modal from './components/Modal'
import Login from './components/Login'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import CalendarView from './components/CalendarView'
import AvailabilityView from './components/AvailabilityView'
import HoursCorrectModal from './components/HoursCorrectModal'
import RotaBuilder from './components/RotaBuilder'
import MyShifts from './components/MyShifts'
import MyLeaveRecords from './components/MyLeaveRecords'
import RequestsView from './components/RequestsView'
import RotaRulesView from './components/RotaRulesView'
import StaffMgmt from './components/StaffMgmt'
import ConflictsView from './components/ConflictsView'
import FixedDaysView from './components/FixedDaysView'
import Reports from './components/Reports'
import RotaConfig from './components/RotaConfig'
import AuditLog from './components/AuditLog'
import HoursAdjustView from './components/HoursAdjustView'
import YearSetupView from './components/YearSetupView'
import AIRotaView from './components/AIRotaView'
import MyPreferences from './components/MyPreferences'

const appDoc = () => db.collection("state").doc(IS_DEMO ? "demo" : "app");

function App() {
  // fsReady: true once Firestore has returned the first snapshot (or errored)
  const [fsReady,setFsReady]   = useState(false);
  const [user,setUser]         = useState(()=>lsGet('session',null));
  const [view,setView]         = useState("dashboard");
  const [viewMonth,setVM]      = useState(new Date(2026,7,1));
  const [menuOpen,setMenuOpen] = useState(false);
  const [sbCollapsed,setSbCollapsed] = useState(false);

  // Global (shared across all years)
  const ADMIN_ONLY = INIT_STAFF.filter(s=>s.role==="admin");
  const [staff,setStaff]           = useState(()=>lsGet('staff',ADMIN_ONLY));
  const [wteConfig,setWteConfig]   = useState(()=>lsGet('wteConfig',INIT_WTE_CONFIG));
  const [auditLog,setAudit]        = useState(()=>lsGet('audit',[{id:1,ts:"2026-08-05 09:00",user:"ADM",action:"System Init",details:"RotaFlow 2026/27 initialised"}]));
  const [fixedDaysOff,setFixedDaysOff] = useState(()=>lsGet('fixedDaysOff',[]));
  const [genRules,setGenRules]             = useState(()=>lsGet('genRules',INIT_GEN_RULES));
  const [shiftTimes,setShiftTimes]         = useState(()=>lsGet('shiftTimes',DEFAULT_SHIFT_TIMES));
  const [staffShiftTimes,setSST]           = useState(()=>lsGet('staffShiftTimes',{}));
  const [trainingDays,setTrainingDays]     = useState(()=>lsGet('trainingDays',[])); // [{id,date,type:"SpR"|"ACP",note}]
  const [demoMode,setDemoMode]             = useState(()=>lsGet('demoMode',false));
  const [constraintRules,setConstraintRules] = useState(()=>lsGet('constraintRules',[])); // global, not per-year
  const [sysRules,setSysRules]               = useState(()=>lsGet('sysRules',DEFAULT_SYS_RULES)); // global toggleable system rules
  const [rotaRulesText,setRotaRulesText]     = useState(()=>lsGet('rotaRulesText',''));

  // Year management
  const [years,setYears]           = useState(()=>lsGet('years',[{id:"2026-27",label:"2026/27",quarters:QUARTERS,active:true,archived:false}]));
  const [activeYearId,setActiveYearId] = useState(()=>lsGet('activeYearId',"2026-27"));

  // Per-year data (keyed by year id)
  const [rotaByYear,setRotaByYear]         = useState(()=>lsGet('rotaByYear',{}));
  const [leaveByYear,setLeaveByYear]       = useState(()=>lsGet('leaveByYear',{}));
  const [availByYear,setAvailByYear]       = useState(()=>lsGet('availByYear',{}));
  const [qStatusByYear,setQStatusByYear]   = useState(()=>lsGet('qstatusByYear',{}));
  const [requestsByYear,setReqsByYear]     = useState(()=>lsGet('requestsByYear',{}));
  const [notesByYear,setNotesByYear]       = useState(()=>lsGet('notesByYear',{}));
  const [corrsByYear,setCorrsByYear]       = useState(()=>lsGet('corrsByYear',{}));
  const [staffHoursByYear,setSHByYear]     = useState(()=>lsGet('staffHoursByYear',{}));
  const [swapsByYear,setSwapsByYear]       = useState(()=>lsGet('swapsByYear',{}));
  const [shiftOverridesByYear,setSOByYear] = useState(()=>lsGet('shiftOverridesByYear',{}));

  // Active-year flat accessors (derived from above)
  const activeYearQuarters = useMemo(()=>(years.find(y=>y.id===activeYearId)||years[0])?.quarters||QUARTERS,[years,activeYearId]);
  const rota          = rotaByYear[activeYearId]           || {};
  const leaveEntries  = leaveByYear[activeYearId]          || {};
  const availability  = availByYear[activeYearId]          || {};
  const quarterStatus = qStatusByYear[activeYearId]        || {Q1:"open",Q2:"closed",Q3:"closed",Q4:"closed"};
  const requests      = requestsByYear[activeYearId]       || [];
  const dayNotes      = notesByYear[activeYearId]          || {};
  const hoursCorrections = corrsByYear[activeYearId]       || [];
  const staffHours    = staffHoursByYear[activeYearId]     || {};
  const swaps              = swapsByYear[activeYearId]          || [];
  const staffShiftOverrides = shiftOverridesByYear[activeYearId] || {};

  // Year-aware setters (same interface as the old flat setters)
  const yw = (setter, key) => v => setter(p=>({...p,[activeYearId]:typeof v==="function"?v(p[activeYearId]||(key==="arr"?[]:{})):v}));
  const setRota        = yw(setRotaByYear);
  const setLE          = yw(setLeaveByYear);
  const setAvail       = yw(setAvailByYear);
  const setQS          = yw(setQStatusByYear);
  const setReqs        = yw(setReqsByYear,"arr");
  const setNotes       = yw(setNotesByYear);
  const setHoursCorrections = yw(setCorrsByYear,"arr");
  const setStaffHours    = yw(setSHByYear);
  const setSwaps         = yw(setSwapsByYear,"arr");
  const setShiftOverrides = yw(setSOByYear);

  // Rota publication — per quarter flag: {Q1: {ts, by} | null, ...}
  const [rotaPublishedByYear, setRPByYear] = useState(()=>lsGet('rotaPublishedByYear',{}));
  const rotaPublished = rotaPublishedByYear[activeYearId] || {};
  const setRotaPublished = yw(setRPByYear);

  // ── Subscribe to Firestore on mount (gated behind Anonymous Auth) ────────────
  // onAuthStateChanged fires immediately; if no user, we sign in anonymously.
  // Once authenticated, the Firestore onSnapshot listener is set up.
  // upd() only calls the setter when the value has actually changed (avoids
  // write→snapshot→write loops by keeping the same object reference when equal).
  useEffect(() => {
    const upd = setter => val => {
      if (val !== undefined) setter(prev => JSON.stringify(prev) === JSON.stringify(val) ? prev : val);
    };
    let unsubFirestore = null;
    const unsubAuth = firebase.auth().onAuthStateChanged(firebaseUser => {
      if (firebaseUser) {
        // If a reset was requested (flag set in localStorage), write clean state first
        const RESET_KEY = LS_PFX + 'pendingReset';
        const pendingReset = localStorage.getItem(RESET_KEY) === 'true';
        if (pendingReset) {
          localStorage.removeItem(RESET_KEY);
          const freshPayload = {staff:INIT_STAFF.filter(s=>s.role==="admin"),auditLog:[],wteConfig:INIT_WTE_CONFIG,years:[{id:"2026-27",label:"2026/27",quarters:QUARTERS,active:true,archived:false}],activeYearId:"2026-27",rotaByYear:{},leaveByYear:{},availByYear:{},qStatusByYear:{},requestsByYear:{},notesByYear:{},corrsByYear:{},staffHoursByYear:{},swapsByYear:{},fixedDaysOff:[],genRules:INIT_GEN_RULES,shiftTimes:DEFAULT_SHIFT_TIMES,staffShiftTimes:{},trainingDays:[],demoMode:false};
          appDoc().set(freshPayload).catch(console.error);
        }
        // Authenticated — connect to Firestore
        unsubFirestore = appDoc().onSnapshot(snap => {
          if (!snap.exists && IS_DEMO) {
            // Demo doc doesn't exist yet — seed it with all staff + demo availability
            const demoStaff = INIT_STAFF.map(s=>({...s,pw:s.role==='admin'?'demo2026':'rota2026'}));
            const demoAvail = generateDemoAvailability(demoStaff,[...QUARTERS]);
            const seed={staff:demoStaff,auditLog:[],wteConfig:INIT_WTE_CONFIG,years:[{id:"2026-27",label:"2026/27",quarters:QUARTERS,active:true,archived:false}],activeYearId:"2026-27",rotaByYear:{},leaveByYear:{},availByYear:{"2026-27":demoAvail},qStatusByYear:{"2026-27":{Q1:"open",Q2:"closed",Q3:"closed",Q4:"closed"}},requestsByYear:{},notesByYear:{},corrsByYear:{},staffHoursByYear:{},swapsByYear:{},fixedDaysOff:[],genRules:INIT_GEN_RULES,shiftTimes:DEFAULT_SHIFT_TIMES,staffShiftTimes:{},trainingDays:[],demoMode:true};
            appDoc().set(seed).catch(console.error);
            // Set state directly so login works immediately (don't wait for snapshot round-trip)
            setStaff(demoStaff);
            setWteConfig(INIT_WTE_CONFIG);
            setYears([{id:"2026-27",label:"2026/27",quarters:QUARTERS,active:true,archived:false}]);
            setActiveYearId("2026-27");
            setAvailByYear({"2026-27":demoAvail});
            setQStatusByYear({"2026-27":{Q1:"open",Q2:"closed",Q3:"closed",Q4:"closed"}});
            setFsReady(true); return;
          }
          if (snap.exists) {
            const d = snap.data();
            // Migration: if old flat data exists but no year-namespaced data, migrate to "2026-27"
            const patchStaffPw = arr => Array.isArray(arr) ? arr.map(s=>{
              if(IS_DEMO) return {...s,pw:s.role==='admin'?'demo2026':'rota2026'};
              if(s.pw) return s; const def=INIT_STAFF.find(i=>i.init===s.init); return {...s,pw:def?.pw||(s.role==='admin'?'admin2026':'rota2026')};}) : arr;
            // Re-validate & refresh the in-memory session user from the loaded staff list
            setUser(prev => {
              if (!prev) return prev;
              const fresh = (IS_DEMO
                ? (d.staff||[]).map(s=>({...s,pw:s.role==='admin'?'demo2026':'rota2026'}))
                : (d.staff||[])
              ).find(s=>s.init===prev.init);
              if (!fresh) return prev; // keep old session if not found yet (still loading)
              const updated = {...fresh};
              lsSave('session', updated);
              return updated;
            });
            if (d.rota && !d.rotaByYear) {
              const yid = "2026-27";
              upd(setStaff)(patchStaffPw(d.staff));
              upd(setWteConfig)(d.wteConfig);
              upd(setAudit)(d.auditLog);
              upd(setYears)([{id:yid,label:"2026/27",quarters:QUARTERS,active:true,archived:false}]);
              upd(setActiveYearId)(yid);
              upd(setRotaByYear)({[yid]:d.rota||{}});
              upd(setLeaveByYear)({[yid]:d.leaveEntries||{}});
              upd(setAvailByYear)({[yid]:d.availability||{}});
              upd(setQStatusByYear)({[yid]:d.quarterStatus||{Q1:"open",Q2:"closed",Q3:"closed",Q4:"closed"}});
              upd(setReqsByYear)({[yid]:d.requests||[]});
              upd(setNotesByYear)({[yid]:d.dayNotes||{}});
              upd(setCorrsByYear)({[yid]:d.hoursCorrections||[]});
              upd(setSHByYear)({[yid]:d.staffHours||{}});
            } else {
              // Normal multi-year load
              upd(setStaff)(patchStaffPw(d.staff));
              upd(setWteConfig)(d.wteConfig);
              upd(setAudit)(d.auditLog);
              upd(setYears)(d.years);
              upd(setActiveYearId)(d.activeYearId);
              upd(setRotaByYear)(d.rotaByYear);
              upd(setLeaveByYear)(d.leaveByYear);
              upd(setAvailByYear)(d.availByYear);
              upd(setQStatusByYear)(d.qStatusByYear);
              upd(setReqsByYear)(d.requestsByYearV2 || {});
              upd(setNotesByYear)(d.notesByYear);
              upd(setCorrsByYear)(d.corrsByYear);
              upd(setSHByYear)(d.staffHoursByYear);
              upd(setSwapsByYear)(d.swapsByYearV2 || {});
              upd(setSOByYear)(d.shiftOverridesByYear || {});
              upd(setRPByYear)(d.rotaPublishedByYear || {});
              upd(setFixedDaysOff)(d.fixedDaysOff);
              upd(setGenRules)(d.genRules);
              upd(setShiftTimes)(d.shiftTimes);
              upd(setSST)(d.staffShiftTimes);
              upd(setTrainingDays)(d.trainingDays);
              upd(setConstraintRules)(d.constraintRules || []);
              if (d.sysRules) upd(setSysRules)({...DEFAULT_SYS_RULES, ...d.sysRules});
              upd(setRotaRulesText)(d.rotaRulesText || '');
            }
          }
          setFsReady(true);
        }, err => { console.error('Firestore:', err); setFsReady(true); });
      } else {
        // Not signed in — sign in anonymously (triggers onAuthStateChanged again)
        firebase.auth().signInAnonymously().catch(err => {
          console.error('Anonymous auth failed:', err);
          setFsReady(true); // fall back so the app still loads
        });
      }
    });
    return () => { unsubAuth(); if (unsubFirestore) unsubFirestore(); };
  }, []);

  // ── Write all state to Firestore whenever anything changes (after load) ──────
  // Also mirrors to localStorage as an offline / fast-reload cache
  useEffect(() => {
    if (!fsReady) return;
    const payload = {staff,auditLog,wteConfig,years,activeYearId,rotaByYear,leaveByYear:leaveByYear,availByYear,qStatusByYear,requestsByYear,notesByYear,corrsByYear,staffHoursByYear,swapsByYear,shiftOverridesByYear,rotaPublishedByYear,fixedDaysOff,genRules,shiftTimes,staffShiftTimes,trainingDays,constraintRules,sysRules,demoMode,rotaRulesText};
    appDoc().set(payload).catch(console.error);
    Object.entries({staff:staff,audit:auditLog,wteConfig:wteConfig,years:years,activeYearId:activeYearId,rotaByYear:rotaByYear,leaveByYear:leaveByYear,availByYear:availByYear,qstatusByYear:qStatusByYear,requestsByYear:requestsByYear,notesByYear:notesByYear,corrsByYear:corrsByYear,staffHoursByYear:staffHoursByYear,swapsByYear:swapsByYear,shiftOverridesByYear:shiftOverridesByYear,rotaPublishedByYear:rotaPublishedByYear,fixedDaysOff:fixedDaysOff,genRules:genRules,shiftTimes:shiftTimes,staffShiftTimes:staffShiftTimes,trainingDays:trainingDays,constraintRules:constraintRules,sysRules:sysRules,demoMode:demoMode,rotaRulesText:rotaRulesText})
      .forEach(([k,v])=>lsSave(k,v));
  },[fsReady,staff,auditLog,wteConfig,years,activeYearId,rotaByYear,leaveByYear,availByYear,qStatusByYear,requestsByYear,notesByYear,corrsByYear,staffHoursByYear,swapsByYear,shiftOverridesByYear,rotaPublishedByYear,fixedDaysOff,genRules,shiftTimes,staffShiftTimes,trainingDays,constraintRules,sysRules,demoMode,rotaRulesText]);

  const addAudit=(u,action,details)=>{
    const now=new Date(), ts=`${now.toLocaleDateString("en-GB")} ${now.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}`;
    setAudit(p=>[...p,{id:Date.now(),ts,user:u,action,details}]);
  };

  // ── Push notification: fire when a quarter is newly published ─────────────
  const prevPublishedRef = useRef({});
  useEffect(() => {
    if (!user || user.role === 'admin' || !fsReady) return;
    const prev = prevPublishedRef.current;
    const cur  = rotaPublished;
    Object.entries(cur).forEach(([qid, pub]) => {
      if (pub && !prev[qid]) {
        const q = activeYearQuarters.find(x => x.id === qid);
        showNotification(
          `${qid} Rota Published ✅`,
          `The ${q?.label || qid} rota has been finalised — tap to check your shifts.`
        );
      }
    });
    prevPublishedRef.current = { ...cur };
  }, [rotaPublished]);

  const loadDemoData = () => {
    if (!confirm("Load demo data? This loads all default staff and realistic Q1 availability so you can test the AI rota builder. Any existing staff or Q1 availability will be overwritten.")) return;
    const baseStaff = (staff.length && staff.some(s=>s.role==="staff")) ? staff : INIT_STAFF;
    if (!staff.length || staff.every(s=>s.role==="admin")) setStaff(INIT_STAFF);
    const demoAvail = generateDemoAvailability(baseStaff, activeYearQuarters);
    setAvail(demoAvail);
    setDemoMode(true);
    addAudit("ADM","Demo Mode","Demo availability loaded");
  };

  const resetToFresh = () => {
    if (!confirm("Reset to Fresh Start?\n\nThis will:\n• Remove ALL staff\n• Clear ALL rota, availability, leave, requests and corrections\n• Keep year/quarter structure and all config\n\nThis cannot be undone. Continue?")) return;
    // Set flag so clean state is written to Firestore on next load (before snapshot)
    localStorage.setItem(LS_PFX+'pendingReset','true');
    ['staff','audit','wteConfig','years','activeYearId','rotaByYear','leaveByYear','availByYear','qstatusByYear','requestsByYear','notesByYear','corrsByYear','staffHoursByYear','swapsByYear','fixedDaysOff','genRules','shiftTimes','staffShiftTimes','trainingDays','demoMode']
      .forEach(k=>localStorage.removeItem(LS_PFX+k));
    window.location.reload();
  };

  const applyCarryForward = (closingQid) => {
    const qIdx = activeYearQuarters.findIndex(q=>q.id===closingQid);
    const nextQ = activeYearQuarters[qIdx+1];
    if (!nextQ) return;
    const activeStaff = staff.filter(s=>s.role==="staff"&&s.active);
    const newCorr = [];
    activeStaff.forEach(s => {
      const hrs = getHoursRemaining(s.init, s.grade, closingQid, wteConfig, staffHours, rota, leaveEntries, hoursCorrections);
      if (hrs===null || hrs===0) return;
      newCorr.push({id:Date.now()+Math.random(),init:s.init,qid:nextQ.id,amount:Math.round(hrs*10)/10,reason:`Carry-forward from ${closingQid} (${hrs>0?"unworked":"overworked"} hours)`,createdBy:user.init,createdAt:fmtISO(new Date()),carryForward:true,sourceQid:closingQid});
    });
    if (newCorr.length) {
      setHoursCorrections(prev=>[...prev,...newCorr]);
      addAudit(user.init,"Carry-Forward Applied",`${closingQid}→${nextQ.id}: ${newCorr.length} staff`);
    }
  };

  const pendingCount=requests.filter(r=>r.status==="pending").length;
  const hasOpenQ=activeYearQuarters.some(q=>quarterStatus[q.id]==="open");
  const isAdmin=user?.role==="admin";

  const titles={dashboard:"Dashboard",calendar:"Rota Calendar",myshifts:"My Shifts",myrecords:"My Leave Records",preferences:"My Preferences",availability:"Availability",requests:isAdmin?"Leave Requests":"My Requests",builder:"Rota Builder",adjustments:"Hour Adjustments",staff:"Staff Management",reports:isAdmin?"Reports":"My Summary",rotaconfig:"Rota Config",audit:"Audit Log",yearsetup:"Year Setup",airota:"AI Rota Builder",fixeddays:"Fixed Days Off",conflicts:"Conflicts & Rules",rotarules:"Rota Rules"};

  if(!fsReady) return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",gap:14,background:"#f0f4f8"}}>
      <div className="fs-spinner"/>
      <p style={{color:"#64748b",fontSize:14,fontFamily:"'Inter',sans-serif",margin:0}}>Loading rota data…</p>
    </div>
  );

  const handleLogin = u => { setUser(u); lsSave('session', u); };
  const handleLogout = () => { setUser(null); localStorage.removeItem(LS_PFX+'session'); };

  if(!user) return <Login staff={staff} onLogin={handleLogin}/>;

  return (
    <div className="app">
      <Sidebar user={user} view={view} setView={setView} onLogout={handleLogout} pendingCount={pendingCount} hasOpenQ={hasOpenQ} isOpen={menuOpen} onClose={()=>setMenuOpen(false)} collapsed={sbCollapsed} onToggleCollapse={()=>setSbCollapsed(c=>!c)}/>
      {menuOpen&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:499}} onClick={()=>setMenuOpen(false)}/>}
      <div className="main">
        <div className="hdr" style={{position:"relative"}}>
          <button className="mob-hbg" onClick={()=>setMenuOpen(m=>!m)}>☰</button>
          <h2>{titles[view]||""}</h2>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {isAdmin&&<span className="badge b-admin">Admin</span>}
            <select value={activeYearId}
              onChange={e=>e.target.value==="__new"?setView("yearsetup"):setActiveYearId(e.target.value)}
              style={{fontSize:12.5,padding:"3px 8px",borderRadius:6,border:"1px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>
              {years.filter(y=>!y.archived).map(y=><option key={y.id} value={y.id}>{y.label}</option>)}
              {isAdmin&&<option value="__new">+ New Year</option>}
            </select>
          </div>
        </div>
        {isAdmin&&demoMode&&(
          <div style={{background:"#fef08a",borderBottom:"2px solid #facc15",padding:"7px 20px",fontSize:12.5,fontWeight:600,color:"#713f12",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
            <span>⚠️ DEMO MODE — Sample availability loaded. The AI Rota Builder is ready to test.</span>
            <button onClick={()=>setDemoMode(false)} style={{background:"none",border:"1px solid #ca8a04",borderRadius:5,padding:"2px 10px",fontSize:11,color:"#713f12",cursor:"pointer",fontWeight:600}}>Dismiss</button>
          </div>
        )}
        <div className="body">
          {view==="dashboard"  &&<Dashboard user={user} staff={staff} rota={rota} requests={requests} dayNotes={dayNotes} availability={availability} quarterStatus={quarterStatus} quarters={activeYearQuarters} demoMode={demoMode} loadDemoData={loadDemoData} resetToFresh={resetToFresh} isAdmin={isAdmin} swaps={swaps} setView={setView} rotaPublished={rotaPublished}/>}
          {view==="calendar"   &&<CalendarView rota={rota} leaveEntries={leaveEntries} dayNotes={dayNotes} staff={staff} viewMonth={viewMonth} setViewMonth={setVM} viewMode="month" setViewMode={()=>{}} trainingDays={trainingDays} quarters={activeYearQuarters}/>}
          {view==="myshifts"   &&!isAdmin&&<MyShifts user={user} rota={rota} leaveEntries={leaveEntries} dayNotes={dayNotes} shiftTimes={shiftTimes} staffShiftTimes={staffShiftTimes} staff={staff}/>}
          {view==="myrecords"  &&!isAdmin&&<MyLeaveRecords user={user} leaveEntries={leaveEntries} requests={requests} availability={availability}/>}
          {view==="preferences"&&!isAdmin&&<MyPreferences currentUser={user} staff={staff} setStaff={setStaff} fixedDaysOff={fixedDaysOff} setFixedDaysOff={setFixedDaysOff} addAudit={addAudit}/>}
          {view==="availability"&&(<AvailabilityView
                user={user}
                staff={staff}
                setStaff={setStaff}
                availability={availability}
                setAvailability={setAvail}
                quarterStatus={quarterStatus}
                setQuarterStatus={setQS}
                addAudit={addAudit}
                leaveEntries={leaveEntries}
                setLeaveEntries={setLE}
                rota={rota}
                requests={requests}
                setRequests={setReqs}
                applyCarryForward={applyCarryForward}
                quarters={activeYearQuarters}
                fixedDaysOff={fixedDaysOff}
                setFixedDaysOff={setFixedDaysOff}
              />
            )}
          {view==="requests"   &&<RequestsView user={user} requests={requests} setRequests={setReqs} addAudit={addAudit} swaps={swaps} setSwaps={setSwaps} rota={rota} setRota={setRota} staff={staff}/>}
          {view==="builder"    &&isAdmin&&<RotaBuilder rota={rota} setRota={setRota} leaveEntries={leaveEntries} setLeaveEntries={setLE} staff={staff} dayNotes={dayNotes} setDayNotes={setNotes} availability={availability} addAudit={addAudit} currentUser={user} wteConfig={wteConfig} staffHours={staffHours} hoursCorrections={hoursCorrections} setHoursCorrections={setHoursCorrections} trainingDays={trainingDays} staffShiftOverrides={staffShiftOverrides} constraintRules={constraintRules} sysRules={sysRules} genRules={genRules} rotaPublished={rotaPublished} setRotaPublished={setRotaPublished} quarters={activeYearQuarters}/>}
          {view==="staff"      &&isAdmin&&<StaffMgmt staff={staff} setStaff={setStaff} addAudit={addAudit} currentUser={user}/>}
          {view==="reports"    &&<Reports user={user} staff={staff} rota={rota} leaveEntries={leaveEntries} requests={requests} quarters={activeYearQuarters} availability={availability}/>}
          {view==="conflicts"  &&isAdmin&&<ConflictsView rota={rota} leaveEntries={leaveEntries} availability={availability} staff={staff} quarters={activeYearQuarters} addAudit={addAudit} currentUser={user} constraintRules={constraintRules} setConstraintRules={setConstraintRules} sysRules={sysRules} setSysRules={setSysRules} genRules={genRules}/>}
          {view==="fixeddays"  &&isAdmin&&<FixedDaysView fixedDaysOff={fixedDaysOff} setFixedDaysOff={setFixedDaysOff} staff={staff} addAudit={addAudit} currentUser={user}/>}
          {view==="rotaconfig" &&isAdmin&&<RotaConfig wteConfig={wteConfig} setWteConfig={setWteConfig} staffHours={staffHours} setStaffHours={setStaffHours} staff={staff} addAudit={addAudit} shiftTimes={shiftTimes} setShiftTimes={setShiftTimes} staffShiftTimes={staffShiftTimes} setStaffShiftTimes={setSST} trainingDays={trainingDays} setTrainingDays={setTrainingDays} staffShiftOverrides={staffShiftOverrides} setShiftOverrides={setShiftOverrides}/>}
          {view==="airota"     &&isAdmin&&<AIRotaView user={user} staff={staff} rota={rota} setRota={setRota} availability={availability} leaveEntries={leaveEntries} quarterStatus={quarterStatus} wteConfig={wteConfig} staffHours={staffHours} genRules={genRules} setGenRules={setGenRules} shiftTimes={shiftTimes} addAudit={addAudit} quarters={activeYearQuarters} activeYearId={activeYearId}/>}
          {view==="adjustments"&&isAdmin&&<HoursAdjustView staff={staff} hoursCorrections={hoursCorrections} setHoursCorrections={setHoursCorrections} addAudit={addAudit} currentUser={user} wteConfig={wteConfig} staffHours={staffHours} rota={rota} leaveEntries={leaveEntries}/>}
          {view==="rotarules"  &&<RotaRulesView rotaRulesText={rotaRulesText} setRotaRulesText={setRotaRulesText} addAudit={addAudit} currentUser={user} isAdmin={isAdmin}/>}
          {view==="audit"      &&isAdmin&&<AuditLog log={auditLog}/>}
          {view==="yearsetup"  &&isAdmin&&<YearSetupView years={years} setYears={setYears} activeYearId={activeYearId} setActiveYearId={setActiveYearId} staff={staff} rotaByYear={rotaByYear} leaveByYear={leaveByYear} availByYear={availByYear} qStatusByYear={qStatusByYear} requestsByYear={requestsByYear} notesByYear={notesByYear} corrsByYear={corrsByYear} staffHoursByYear={staffHoursByYear} swapsByYear={swapsByYear} fixedDaysOff={fixedDaysOff} wteConfig={wteConfig} setQStatusByYear={setQStatusByYear} addAudit={addAudit} currentUser={user}/>}
        </div>
        <div style={{flexShrink:0,padding:"8px 28px",borderTop:"1px solid #edf0f7",background:"white",fontSize:11,color:"#94a3b8",textAlign:"center",letterSpacing:".2px"}}>
          © 2026 RotaFlow Ltd. All rights reserved.
        </div>
      </div>
    </div>
  );
}

export default App
