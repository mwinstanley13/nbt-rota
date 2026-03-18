import React, { useState } from 'react'
import { INIT_STAFF } from '../constants/staff'
import { IS_DEMO } from '../utils/storage'
import Modal from './Modal'

function StaffMgmt({staff,setStaff,addAudit,currentUser}) {
  const [modal,setModal]=useState(null); const [form,setForm]=useState({});
  const [pwModal,setPwM]=useState(null); const [newPw,setNPw]=useState("");
  const isOwner=!!(currentUser.isOwner||INIT_STAFF.find(s=>s.init===currentUser.init)?.isOwner);

  const save=()=>{
    const rec={...form,slDays:parseInt(form.slDays)||0,militaryDays:parseInt(form.militaryDays)||0};
    modal==="add"?setStaff(p=>[...p,{...rec,id:Date.now()}]):setStaff(p=>p.map(s=>s.id===modal.id?{...s,...rec}:s));
    addAudit(currentUser.init,"Staff",`${form.name} ${modal==="add"?"added":"updated"}`);setModal(null);
  };

  const promoteToAdmin = s => {
    if(!confirm(`Promote ${s.name} to Admin? They will gain full administrative access.`)) return;
    setStaff(p=>p.map(x=>x.id===s.id?{...x,role:"admin"}:x));
    addAudit(currentUser.init,"Staff Role","Promoted "+s.name+" to Admin");
  };
  const demoteToStaff = s => {
    if(!confirm(`Remove admin access from ${s.name}? They will become a regular staff member.`)) return;
    setStaff(p=>p.map(x=>x.id===s.id?{...x,role:"staff"}:x));
    addAudit(currentUser.init,"Staff Role","Demoted "+s.name+" to Staff");
  };

  // Staff table: all non-admin, plus non-owner admins if viewer is owner
  const staffMembers = staff.filter(s=>s.role==="staff");
  const adminMembers = isOwner ? staff.filter(s=>s.role==="admin"&&!s.isOwner) : [];
  const allShow = staffMembers; // main table always shows staff
  const demoLoadable = allShow.length===0&&IS_DEMO;

  const StaffRow = ({s, showRole=false}) => (
    <tr key={s.id}>
      <td style={{fontWeight:600}}>{s.name}</td>
      <td><code style={{background:"#f1f5f9",padding:"1px 5px",borderRadius:4,fontSize:11}}>{s.init}</code></td>
      <td>{s.grade}{s.military&&<span className="badge b-admin" style={{marginLeft:4,fontSize:9,padding:"1px 5px"}}>MIL</span>}</td>
      <td>{s.hrs}</td>
      {showRole&&<td><span className={`badge ${s.role==="admin"?"b-admin":"b-approved"}`}>{s.role==="admin"?"Admin":"Staff"}</span></td>}
      <td><span className={`badge ${s.active?"b-approved":"b-rejected"}`}>{s.active?"Active":"Inactive"}</span></td>
      <td><div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
        <button className="btn bs bsm" onClick={()=>{setForm({...s});setModal(s);}}>Edit</button>
        <button className="btn bs bsm" onClick={()=>{setPwM(s);setNPw("");}}>🔑</button>
        {isOwner&&s.role==="staff"&&<button className="btn bsm" style={{background:"#ede9fe",color:"#5b21b6",border:"1px solid #c4b5fd"}} onClick={()=>promoteToAdmin(s)}>Make Admin</button>}
        {isOwner&&s.role==="admin"&&<button className="btn bsm" style={{background:"#fef3c7",color:"#92400e",border:"1px solid #fcd34d"}} onClick={()=>demoteToStaff(s)}>Make Staff</button>}
        <button className={`btn bsm ${s.active?"bd":"bp"}`} onClick={()=>{setStaff(p=>p.map(x=>x.id===s.id?{...x,active:!x.active}:x));addAudit(currentUser.init,"Staff",`${s.name} ${s.active?"deactivated":"activated"}`);}}>
          {s.active?"Deactivate":"Activate"}
        </button>
      </div></td>
    </tr>
  );

  return (
    <div>
      <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        <button className="btn bp" onClick={()=>{setForm({name:"",init:"",grade:"ST4+",hrs:45.25,pw:"rota2026",role:"staff",active:true,slDays:30,militaryDays:0,nightBlockPref:"any",military:false});setModal("add");}}>＋ Add Staff</button>
        {isOwner&&<button className="btn" style={{background:"#ede9fe",color:"#5b21b6",border:"1px solid #c4b5fd"}} onClick={()=>{setForm({name:"",init:"",grade:"Admin",hrs:0,pw:"admin2026",role:"admin",active:true,slDays:0,militaryDays:0,nightBlockPref:"any",military:false});setModal("add");}}>＋ Add Admin</button>}
        {demoLoadable&&<button className="btn" style={{background:"#f0f9ff",color:"#0369a1",border:"1px solid #bae6fd"}} onClick={()=>{if(!confirm("Load all 32 default NBT staff? This will add them with password rota2026.")) return; const existing=staff.map(s=>s.init); const toAdd=INIT_STAFF.filter(s=>s.role==="staff"&&!existing.includes(s.init)); setStaff(p=>[...p,...toAdd]);}}>📋 Load Default Staff</button>}
      </div>

      {/* Main staff table */}
      <div className="card" style={{marginBottom:16}}>
        <div className="ch"><span className="ct">Staff Members</span><span style={{fontSize:12,color:"#6b7280",fontWeight:400}}>{staffMembers.length} members</span></div>
        <table className="tbl">
          <thead><tr><th>Name</th><th>Init</th><th>Grade</th><th>Hrs</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{allShow.map(s=><StaffRow key={s.id} s={s} showRole={false}/>)}</tbody>
        </table>
      </div>

      {/* Admin members table — owner only */}
      {isOwner&&(
        <div className="card">
          <div className="ch"><span className="ct">Admin Users</span><span style={{fontSize:12,color:"#6b7280",fontWeight:400}}>{adminMembers.length+1} admins (incl. you)</span></div>
          <div className="cb" style={{paddingTop:0,paddingBottom:0}}>
            {/* Owner row — read only */}
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:adminMembers.length?"1px solid #f1f5f9":"none"}}>
              <div style={{flex:1,fontWeight:600,fontSize:13.5}}>{currentUser.name}</div>
              <code style={{background:"#f1f5f9",padding:"1px 5px",borderRadius:4,fontSize:11}}>{currentUser.init}</code>
              <span className="badge b-admin" style={{fontSize:10}}>Owner</span>
              <span style={{fontSize:12,color:"#94a3b8",marginLeft:"auto"}}>Cannot be changed</span>
            </div>
            {adminMembers.map((s,i)=>(
              <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:i<adminMembers.length-1?"1px solid #f1f5f9":"none",flexWrap:"wrap"}}>
                <div style={{flex:1,fontWeight:600,fontSize:13.5}}>{s.name}</div>
                <code style={{background:"#f1f5f9",padding:"1px 5px",borderRadius:4,fontSize:11}}>{s.init}</code>
                <span className={`badge ${s.active?"b-approved":"b-rejected"}`}>{s.active?"Active":"Inactive"}</span>
                <div style={{display:"flex",gap:5,marginLeft:"auto"}}>
                  <button className="btn bs bsm" onClick={()=>{setForm({...s});setModal(s);}}>Edit</button>
                  <button className="btn bs bsm" onClick={()=>{setPwM(s);setNPw("");}}>🔑</button>
                  <button className="btn bsm" style={{background:"#fef3c7",color:"#92400e",border:"1px solid #fcd34d"}} onClick={()=>demoteToStaff(s)}>Make Staff</button>
                  <button className={`btn bsm ${s.active?"bd":"bp"}`} onClick={()=>{setStaff(p=>p.map(x=>x.id===s.id?{...x,active:!x.active}:x));addAudit(currentUser.init,"Staff",`${s.name} ${s.active?"deactivated":"activated"}`);}}>
                    {s.active?"Deactivate":"Activate"}
                  </button>
                </div>
              </div>
            ))}
            {adminMembers.length===0&&<div style={{padding:"12px 0",color:"#94a3b8",fontSize:13,fontStyle:"italic"}}>No additional admin users. Use "Add Admin" above to grant admin access.</div>}
          </div>
        </div>
      )}

      {modal&&<Modal title={modal==="add"?"Add Staff":"Edit Staff"} onClose={()=>setModal(null)}
        footer={<><button className="btn bs" onClick={()=>setModal(null)}>Cancel</button><button className="btn bp" onClick={save}>Save</button></>}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div className="fg"><label className="fl">Full Name</label><input className="fi" value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
          <div className="fg"><label className="fl">Initials</label><input className="fi" value={form.init||""} onChange={e=>setForm(f=>({...f,init:e.target.value.toUpperCase()}))}/></div>
          {form.role!=="admin"&&<><div className="fg"><label className="fl">Grade</label><select className="fi" value={form.grade||"ST4+"} onChange={e=>setForm(f=>({...f,grade:e.target.value}))}>
            <option>ST4+</option><option>ST3</option><option>ACP</option><option>tACP</option>
          </select></div>
          <div className="fg"><label className="fl">Hours/Week</label><input type="number" className="fi" value={form.hrs||45.25} onChange={e=>setForm(f=>({...f,hrs:parseFloat(e.target.value)||0}))}/></div>
          <div className="fg"><label className="fl">SL Days Entitlement / yr</label><input type="number" className="fi" value={form.slDays??30} onChange={e=>setForm(f=>({...f,slDays:e.target.value}))}/></div>
          <div className="fg"><label className="fl">Military Days / yr</label><input type="number" className="fi" value={form.militaryDays??0} onChange={e=>setForm(f=>({...f,militaryDays:e.target.value}))}/></div>
          <div className="fg"><label className="fl">Night Block Preference</label>
            <select className="fi" value={form.nightBlockPref||"any"} onChange={e=>setForm(f=>({...f,nightBlockPref:e.target.value}))}>
              <option value="any">No preference</option>
              <option value="4">4 nights (Mon–Thu)</option>
              <option value="2">2 nights</option>
            </select>
          </div>
          <div className="fg"><label className="fl">Christmas Preference</label>
            <select className="fi" value={form.xmasPref||"any"} onChange={e=>setForm(f=>({...f,xmasPref:e.target.value}))}>
              <option value="any">No preference</option>
              <option value="christmas">Prefer Christmas week</option>
              <option value="newyear">Prefer New Year week</option>
              <option value="both_ok">Happy with either</option>
            </select>
          </div>
          <div className="fg" style={{gridColumn:"1/-1"}}>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12.5,fontWeight:500,color:"#374151"}}>
              <input type="checkbox" checked={!!form.military} onChange={e=>setForm(f=>({...f,military:e.target.checked}))} style={{width:16,height:16,accentColor:"#10b981"}}/>
              Military contract — uses Military hours targets but keeps grade for shift eligibility
            </label>
          </div>
          <div className="fg" style={{gridColumn:"1/-1"}}>
            <div style={{fontSize:12,fontWeight:600,color:"#374151",marginBottom:6}}>Christmas/NY History (Previous Rota Year)</div>
            <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12.5,fontWeight:500,color:"#374151"}}>
                <input type="checkbox" checked={!!form.workedXmas2025} onChange={e=>setForm(f=>({...f,workedXmas2025:e.target.checked}))} style={{width:16,height:16,accentColor:"#10b981"}}/>
                🎄 Worked Christmas Day (25 Dec) last rota year
              </label>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12.5,fontWeight:500,color:"#374151"}}>
                <input type="checkbox" checked={!!form.workedNY2025} onChange={e=>setForm(f=>({...f,workedNY2025:e.target.checked}))} style={{width:16,height:16,accentColor:"#6366f1"}}/>
                🥂 Worked New Year's Day (1 Jan) last rota year
              </label>
            </div>
          </div></>}
          {modal==="add"&&<div className="fg"><label className="fl">Password</label><input className="fi" value={form.pw||(form.role==="admin"?"admin2026":"rota2026")} onChange={e=>setForm(f=>({...f,pw:e.target.value}))}/></div>}
        </div>
      </Modal>}
      {pwModal&&<Modal title={`Reset Password — ${pwModal.name}`} onClose={()=>setPwM(null)}
        footer={<><button className="btn bs" onClick={()=>setPwM(null)}>Cancel</button><button className="btn bp" disabled={!newPw} onClick={()=>{setStaff(p=>p.map(s=>s.id===pwModal.id?{...s,pw:newPw}:s));addAudit(currentUser.init,"Password Reset",pwModal.name);setPwM(null);}}>Reset</button></>}>
        <div className="fg" style={{marginBottom:0}}><label className="fl">New Password</label><input className="fi" value={newPw} onChange={e=>setNPw(e.target.value)} placeholder="Enter new password"/></div>
      </Modal>}
    </div>
  );
}

export default StaffMgmt
