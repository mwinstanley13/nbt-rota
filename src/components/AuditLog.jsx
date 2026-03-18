import React from 'react'

function AuditLog({log}) {
  return (
    <div className="card">
      <div className="ch"><span className="ct">Audit Log</span><span style={{fontSize:11,color:"#94a3b8"}}>{log.length} entries</span></div>
      <div className="cb" style={{maxHeight:600,overflowY:"auto"}}>
        {[...log].reverse().map(e=><div key={e.id} className="arow"><div className="at">{e.ts}</div><div className="au">{e.user}</div><div className="aa"><strong>{e.action}</strong> — {e.details}</div></div>)}
      </div>
    </div>
  );
}

export default AuditLog
