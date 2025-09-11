// src/auth.js
const KEY = "auth/v1";

export function saveAuth({ token, user }) {
  localStorage.setItem(KEY, JSON.stringify({ token, user, ts: Date.now() }));
}

export function getAuth() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

export function getToken() {
  return getAuth().token || "";
}

export function getUser() {
  return getAuth().user || {};
}

export function getRole() {
  return getUser().role || "employee";
}

export function getSelfEmpId() {
  return getUser().emp_id || null;
}

export function clearAuth() {
  localStorage.removeItem(KEY);
}


