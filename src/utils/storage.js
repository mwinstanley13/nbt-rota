export const IS_DEMO = new URLSearchParams(window.location.search).has('demo')
export const LS_PFX = IS_DEMO ? 'rhsd_' : 'rhs_'
export const lsGet = (key, fallback) => { try { const v = localStorage.getItem(LS_PFX + key); return v != null ? JSON.parse(v) : fallback } catch { return fallback } }
export const lsSave = (key, val) => { try { localStorage.setItem(LS_PFX + key, JSON.stringify(val)) } catch {} }
