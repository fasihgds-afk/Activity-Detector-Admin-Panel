// src/api.js
import axios from "axios";
import { getToken, clearAuth } from "./auth";

const BASE = process.env.REACT_APP_API_URL || "http://localhost:8080";

const api = axios.create({
  baseURL: BASE,
  timeout: 60000,
  withCredentials: false, // using Authorization header, not cookies
});

api.interceptors.request.use((config) => {
  const t = getToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      clearAuth();
    }
    return Promise.reject(err);
  }
);

export default api;
export { BASE as API_BASE };



