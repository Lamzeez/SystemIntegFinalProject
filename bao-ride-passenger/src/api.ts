// @suggested_answers/passenger_app_api.ts.txt
// This file is for the new passenger app: bao-ride-passenger/src/api.ts

import axios from "axios";

// NOTE: Remember to change this to your actual backend URL when deploying
// or if you are using ngrok for local development.
export const BASE_URL = "http://localhost:4000";

// Internal token storage
let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

export const api = axios.create({
  baseURL: BASE_URL,
});

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});
