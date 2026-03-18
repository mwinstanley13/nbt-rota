import React, { useState, useMemo } from 'react'

function AuditLog({log}) {
  const [filterUser, setFilterUser] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const uniqueUsers = useMemo(() => {
    const users = [...new Set(log.map(e => e.user))].sort();
    return users;
  }, [log]);

  const filtered = useMemo(() => {
    return [...log].reverse().filter(e => {
      if (filterUser && e.user !== filterUser) return false;
      if (filterAction && !e.action.toLowerCase().includes(filterAction.toLowerCase())) return false;
      if (filterFrom || filterTo) {
        // ts format: "DD/MM/YYYY HH:MM" — parse date portion
        const parts = e.ts.split(" ")[0].split("/");
        if (parts.length === 3) {
          const entryDate = `${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`;
          if (filterFrom && entryDate < filterFrom) return false;
          if (filterTo && entryDate > filterTo) return false;
        }
      }
      return true;
    });
  }, [log, filterUser, filterAction, filterFrom, filterTo]);

  const hasFilters = filterUser || filterAction || filterFrom || filterTo;

  const clearFilters = () => {
    setFilterUser("");
    setFilterAction("");
    setFilterFrom("");
    setFilterTo("");
  };

  return (
    <div className="card">
      <div className="ch">
        <span className="ct">Audit Log</span>
        <span style={{fontSize:11,color:"#94a3b8"}}>{filtered.length}{hasFilters ? ` of ${log.length}` : ""} entries</span>
      </div>
      <div className="cb">
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14,alignItems:"flex-end"}}>
          <div className="fg" style={{margin:0,minWidth:140}}>
            <label className="fl">User</label>
            <select className="fi" style={{padding:"5px 8px"}} value={filterUser} onChange={e=>setFilterUser(e.target.value)}>
              <option value="">All users</option>
              {uniqueUsers.map(u=><option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="fg" style={{margin:0,minWidth:160}}>
            <label className="fl">Action contains</label>
            <input className="fi" style={{padding:"5px 8px"}} type="text" placeholder="e.g. Leave" value={filterAction} onChange={e=>setFilterAction(e.target.value)}/>
          </div>
          <div className="fg" style={{margin:0}}>
            <label className="fl">From date</label>
            <input className="fi" style={{padding:"5px 8px"}} type="date" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)}/>
          </div>
          <div className="fg" style={{margin:0}}>
            <label className="fl">To date</label>
            <input className="fi" style={{padding:"5px 8px"}} type="date" value={filterTo} onChange={e=>setFilterTo(e.target.value)}/>
          </div>
          {hasFilters && (
            <button className="btn bs bsm" style={{alignSelf:"flex-end",height:32}} onClick={clearFilters}>Clear filters</button>
          )}
        </div>
        <div style={{maxHeight:540,overflowY:"auto"}}>
          {filtered.length === 0
            ? <p style={{fontSize:12.5,color:"#94a3b8",margin:"8px 0"}}>No entries match the current filters.</p>
            : filtered.map(e=><div key={e.id} className="arow"><div className="at">{e.ts}</div><div className="au">{e.user}</div><div className="aa"><strong>{e.action}</strong> — {e.details}</div></div>)
          }
        </div>
      </div>
    </div>
  );
}

export default AuditLog
