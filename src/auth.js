// src/auth.js
export function saveAuth(obj) { localStorage.setItem("auth_v2", JSON.stringify(obj)); }
export function loadAuth() {
  try { return JSON.parse(localStorage.getItem("auth_v2") || "{}"); } catch { return {}; }
}
export function getToken() { return loadAuth()?.token || ""; }
export function getRole() { return loadAuth()?.user?.role || null; }          // 'employee' | 'admin' | 'superadmin'
export function getSelfEmpId() { return loadAuth()?.user?.emp_id || null; }   // only for employee
export function clearAuth() { localStorage.removeItem("auth_v2"); }
