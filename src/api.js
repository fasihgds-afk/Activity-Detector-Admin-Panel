// src/api.js
import axios from "axios";
import { getToken } from "./auth";

export const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:3000";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const t = getToken(); // ✅ Always fresh, never stale
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

export default api;
