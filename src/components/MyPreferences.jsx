import React, { useState } from 'react'
import { QUARTERS } from '../constants/quarters'
import { fmtISO } from '../utils/dates'
import { getDatesInRange } from '../utils/dates'
import { notifSupported, notifPermission, notifEnabled, setNotifEnabled, requestNotifPermission } from '../utils/notifications'

function MyPreferences({ currentUser, staff, setStaff, fixedDaysOff, setFixedDaysOff, addAudit }) {
  const [fdDay, setFdDay] = useState("Monday");
  const [fdReason, setFdReason] = useState("Research");

  const me = staff.find(s => s.init === currentUser.init);
  const pref = me?.nightBlockPref || "any";

  const nightOpts = [
    { val: "any", label: "No preference",      desc: "System will schedule you for any night block" },
    { val: "4",   label: "4 nights (Mon–Thu)", desc: "Prefer a full 4-night weekday block" },
    { val: "2",   label: "2 nights",           desc: "Prefer shorter 2-night weekday blocks" },
  ];

  const saveNightPref = (val) => {
    setStaff(prev => prev.map(s => s.init === currentUser.init ? { ...s, nightBlockPref: val } : s));
    addAudit(currentUser.init, "Night Pref", `Set night block preference: ${val}`);
  };

  const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const REASONS   = ["Research", "Fellow Day", "PHEM"];

  const myFixed = fixedDaysOff.filter(f => f.init === currentUser.init);

  const addFixed = () => {
    if (myFixed.some(f => f.dayOfWeek === fdDay && f.reason === fdReason)) return;
    setFixedDaysOff(prev => [...prev, {
      id: Date.now(),
      init: currentUser.init,
      name: currentUser.name,
      dayOfWeek: fdDay,
      reason: fdReason,
      addedDate: fmtISO(new Date())
    }]);
    addAudit(currentUser.init, "Fixed Day Off", `${currentUser.init} added fixed ${fdReason}: ${fdDay}`);
  };

  const removeFixed = (f) => {
    setFixedDaysOff(prev => prev.filter(x => x.id !== f.id));
    addAudit(currentUser.init, "Fixed Day Off", `${currentUser.init} removed fixed ${f.reason}: ${f.dayOfWeek}`);
  };

  const showNightPref = me && ["ST4+", "ST3", "ACP", "tACP"].includes(me.grade);

  // Notifications state
  const [notifState, setNotifState] = useState({
    perm: notifPermission(),
    enabled: notifEnabled(),
  });
  const handleEnableNotifs = async () => {
    const result = await requestNotifPermission();
    const granted = result === 'granted';
    setNotifEnabled(granted);
    setNotifState({ perm: notifPermission(), enabled: granted });
  };
  const handleToggleNotifs = () => {
    const next = !notifState.enabled;
    setNotifEnabled(next);
    setNotifState(s => ({ ...s, enabled: next }));
  };

  return (
    <div>
      {showNightPref && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="ch"><span className="ct">Night Block Preference</span></div>
          <div className="cb">
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
              When generating the rota, your night shifts will be scheduled as weekday blocks (Mon–Thu) or weekend blocks (Fri–Sun). Choose how you prefer weekday nights to be assigned.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {nightOpts.map(o => (
                <button
                  key={o.val}
                  onClick={() => saveNightPref(o.val)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: `2px solid ${pref === o.val ? "#10b981" : "#e2e8f0"}`,
                    background: pref === o.val ? "#ecfdf5" : "#f8fafc",
                    color: pref === o.val ? "#065f46" : "#374151",
                    cursor: "pointer",
                    textAlign: "left",
                    minWidth: 160
                  }}
                >
                  <div style={{ fontWeight: pref === o.val ? 700 : 500, fontSize: 13 }}>
                    {pref === o.val ? "✓ " : ""}{o.label}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{o.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="ch"><span className="ct">Fixed Days Off</span></div>
        <div className="cb">
          <div className="al al-i" style={{ marginBottom: 12, fontSize: 12.5 }}>
            Fixed days off are only for agreed posts (e.g. Research, Fellow Day, PHEM). Please use <strong>Unavailability</strong> for LTFT arrangements and we will attempt to accommodate everyone's requests.
          </div>
          {myFixed.length === 0 && (
            <p style={{ fontSize: 12.5, color: "#94a3b8", margin: "8px 0" }}>No fixed days off set.</p>
          )}
          {myFixed.map(f => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{f.dayOfWeek}</span>
              <span style={{ padding: "2px 8px", borderRadius: 4, background: "#eff6ff", color: "#1d4ed8", fontSize: 11, fontWeight: 600 }}>{f.reason}</span>
              <button className="btn bs bsm" style={{ color: "#ef4444", borderColor: "#ef4444" }} onClick={() => removeFixed(f)}>Remove</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="fg" style={{ margin: 0 }}>
              <label className="fl">Day</label>
              <select className="fi" style={{ padding: "5px 8px" }} value={fdDay} onChange={e => setFdDay(e.target.value)}>
                {DAY_NAMES.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div className="fg" style={{ margin: 0 }}>
              <label className="fl">Reason</label>
              <select className="fi" style={{ padding: "5px 8px" }} value={fdReason} onChange={e => setFdReason(e.target.value)}>
                {REASONS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <button className="btn bp" style={{ height: 34, alignSelf: "flex-end" }} onClick={addFixed}>+ Add</button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="card">
        <div className="ch"><span className="ct">🔔 Notifications</span></div>
        <div className="cb">
          {!notifSupported() ? (
            <p style={{fontSize:12.5,color:"#94a3b8"}}>Browser notifications are not supported on this device.</p>
          ) : notifState.perm === 'denied' ? (
            <div className="al al-w" style={{fontSize:12.5}}>
              Notifications have been blocked by your browser. To enable them, go to your browser's site settings and allow notifications for this site, then reload.
            </div>
          ) : notifState.perm !== 'granted' ? (
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <p style={{fontSize:12.5,color:"#64748b",margin:0}}>
                Get a browser notification when your rota is published or a request is approved. You can turn this off at any time.
              </p>
              <button className="btn bp" style={{alignSelf:"flex-start"}} onClick={handleEnableNotifs}>
                🔔 Enable notifications
              </button>
            </div>
          ) : (
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:"#0d1b2a"}}>Notifications {notifState.enabled ? "enabled" : "paused"}</div>
                <div style={{fontSize:11.5,color:"#64748b",marginTop:2}}>
                  {notifState.enabled
                    ? "You'll be notified when your rota is published or requests are updated."
                    : "Notifications are paused — you won't receive any alerts."}
                </div>
              </div>
              <button
                onClick={handleToggleNotifs}
                style={{
                  flexShrink:0, padding:"7px 16px", borderRadius:8, fontWeight:700, fontSize:12.5,
                  border:"none", cursor:"pointer",
                  background: notifState.enabled ? "#fee2e2" : "#ecfdf5",
                  color: notifState.enabled ? "#ef4444" : "#10b981",
                }}
              >
                {notifState.enabled ? "Pause" : "Resume"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MyPreferences
