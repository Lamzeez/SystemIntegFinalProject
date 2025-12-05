// src/api.ts
import axios from "axios";

export const BASE_URL = "http://localhost:4000"; // or your ngrok URL

export const api = axios.create({
  baseURL: BASE_URL,
});

// Attach Authorization header if token exists
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("bao_token");
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

