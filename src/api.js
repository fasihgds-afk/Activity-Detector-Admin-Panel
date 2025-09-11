// src/api.js
import axios from "axios";
import { getToken } from "./auth";

export const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8080";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000, // 60s; backend also allows 120s
});

api.interceptors.request.use((config) => {
  const t = getToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

export default api;


