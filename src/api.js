// Shared axios client that always adds the Bearer token
import axios from "axios";
import { getToken } from "./auth";

export const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:3000";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
});

// attach Authorization on every request
api.interceptors.request.use((config) => {
  const t = getToken?.();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

// optional: surface 401s nicely
api.interceptors.response.use(
  (res) => res,
  (err) => Promise.reject(err)
);

export default api;
