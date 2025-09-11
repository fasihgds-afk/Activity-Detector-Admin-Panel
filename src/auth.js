// src/auth.js — tiny helpers used by pages

const KEY = "auth.v1";

export function saveAuth(payload) {
  try {
    localStorage.setItem(KEY, JSON.stringify(payload || {}));
  } catch {}
}
export function clearAuth() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
export function getAuth() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
export function getToken() {
  return getAuth().token || "";
}
export function getRole() {
  return (getAuth().user && getAuth().user.role) || "";
}
export function getSelfEmpId() {
  return (getAuth().user && getAuth().user.emp_id) || "";
}

