import React, { useState } from 'react'
import { IS_DEMO } from '../utils/storage'
import { INIT_STAFF } from '../constants/staff'

function Login({staff,onLogin}) {
  const [u,setU]=useState(IS_DEMO?"ADM":""); const [p,setP]=useState(IS_DEMO?"demo2026":""); const [err,setErr]=useState("");
  const go=()=>{const uTrim=u.toLowerCase().trim(),pTrim=p.trim();const f=staff.find(s=>s.init.toLowerCase()===uTrim);const pw=f?.pw||(INIT_STAFF.find(s=>s.init.toLowerCase()===uTrim)?.pw);(f&&pw===pTrim)?onLogin(f):setErr("Invalid username or password.");};
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-hed">
          <img src="icons/icon-192.png?v=2" alt="RotaFlow" style={{width:68,height:68,borderRadius:16,display:"block",margin:"0 auto",boxShadow:"0 6px 24px rgba(13,27,42,.25)"}} />
          <h1>RotaFlow</h1>
          <p>Emergency Medicine · North Bristol Trust</p>
        </div>
        {IS_DEMO&&<div style={{background:"#fef9c3",border:"1px solid #fde68a",borderRadius:9,padding:"10px 14px",marginBottom:14,fontSize:12.5,color:"#92400e",textAlign:"center"}}>
          <strong>Demo Environment</strong><br/>Use <strong>ADM</strong> / <strong>demo2026</strong> — or any staff initials with <strong>rota2026</strong>
        </div>}
        {err&&<div className="login-err">⚠️ {err}</div>}
        <div className="fg"><label className="fl">Initials</label><input className="fi" placeholder="e.g. MC" value={u} onChange={e=>setU(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} autoFocus/></div>
        <div className="fg" style={{marginBottom:18}}><label className="fl">Password</label><input type="password" className="fi" placeholder="••••••••" value={p} onChange={e=>setP(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()}/></div>
        <button className="btn bp" style={{width:"100%",justifyContent:"center",padding:"12px",fontSize:15,borderRadius:10}} onClick={go}>{IS_DEMO?"Enter Demo →":"Sign In →"}</button>
      </div>
    </div>
  );
}

export default Login
