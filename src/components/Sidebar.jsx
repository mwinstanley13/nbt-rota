import React from 'react'

function Sidebar({user,view,setView,onLogout,pendingCount,hasOpenQ,isOpen,onClose,collapsed,onToggleCollapse}) {
  const isAdmin=user.role==="admin";
  const items=[
    {id:"dashboard",icon:"📊",label:"Dashboard"},
    {id:"calendar", icon:"📅",label:"Rota Calendar"},
    ...(!isAdmin?[{id:"myshifts",icon:"👤",label:"My Shifts"},{id:"myrecords",icon:"📒",label:"My Leave Records"},{id:"preferences",icon:"⚙️",label:"My Preferences"}]:[]),
    {id:"availability",icon:"📋",label:"Availability",badge:!isAdmin&&hasOpenQ?"!":null},
    {id:"requests",icon:"📝",label:isAdmin?"Requests":"My Requests",badge:isAdmin&&pendingCount>0?pendingCount:null},
    {id:"rotarules",icon:"📜",label:"Rota Rules"},
    ...(isAdmin?[
      {id:"airota",      icon:"🤖",label:"AI Rota Builder"},
      {id:"builder",     icon:"🔧",label:"Rota Builder"},
      {id:"adjustments", icon:"⏱️",label:"Hour Adjustments"},
      {id:"staff",       icon:"👥",label:"Staff"},
      {id:"reports",     icon:"📈",label:"Reports"},
      {id:"conflicts",   icon:"⚠️",label:"Conflicts & Rules"},
      {id:"fixeddays",   icon:"📆",label:"Fixed Days Off"},
      {id:"rotaconfig",  icon:"⚙️",label:"Rota Config"},
      {id:"yearsetup",   icon:"📅",label:"Year Setup"},
      {id:"audit",       icon:"🔍",label:"Audit Log"},
    ]:[{id:"reports",icon:"📈",label:"My Summary"}]),
  ];
  return (
    <div className={`sb${isOpen?" mob-open":""}${collapsed?" sb-col":""}`} style={{transition:"width .2s"}}>
      <div className="sb-logo"><h1><span style={{width:30,height:30,borderRadius:8,overflow:"hidden",display:"inline-flex",flexShrink:0}}><img src="icons/rotaflow_icon_32.png?v=2" alt="RF" style={{width:30,height:30,display:"block"}} /></span>{!collapsed&&<span style={{marginLeft:8}}>RotaFlow</span>}</h1>{!collapsed&&<p>Rota Year 2026 / 2027</p>}</div>
      {/* Collapse toggle — floats on right edge, desktop only */}
      <button className="sb-collapse-btn" onClick={onToggleCollapse} title={collapsed?"Expand sidebar":"Collapse sidebar"}>
        {collapsed?"›":"‹"}
      </button>
      <div className="sb-sec">
        {!collapsed&&<div className="sb-lbl">Menu</div>}
        {items.map(n=>(
          <button key={n.id} className={`nav-btn${view===n.id?" act":""}`} onClick={()=>{setView(n.id);onClose&&onClose();}} title={collapsed?n.label:undefined}>
            <span className="ni">{n.icon}</span>{!collapsed&&n.label}
            {!collapsed&&n.badge&&<span className="nb">{n.badge}</span>}
          </button>
        ))}
      </div>
      <div className="sb-user">
        <div className="u-av">{user.init.slice(0,2)}</div>
        {!collapsed&&<div className="u-info"><div className="u-name">{user.name}</div><div className="u-role">{isAdmin?"Administrator":user.grade}</div></div>}
        <button className="u-logout" onClick={onLogout} title="Sign out">⏻</button>
      </div>
    </div>
  );
}

export default Sidebar
