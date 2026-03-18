const ICON = '/icons/rotaflow_icon_192.png';
const LS_KEY = 'rhs_notif_enabled';

export const notifSupported = () => typeof Notification !== 'undefined';
export const notifPermission = () => notifSupported() ? Notification.permission : 'unsupported';
export const notifEnabled = () => localStorage.getItem(LS_KEY) !== 'false';
export const setNotifEnabled = (v) => localStorage.setItem(LS_KEY, v ? 'true' : 'false');

export async function requestNotifPermission() {
  if (!notifSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return await Notification.requestPermission();
}

export function showNotification(title, body) {
  if (!notifSupported() || Notification.permission !== 'granted' || !notifEnabled()) return;
  const n = new Notification(title, {
    body,
    icon: ICON,
    badge: ICON,
    tag: 'rotaflow-rota',
  });
  n.onclick = () => { window.focus(); n.close(); };
}
