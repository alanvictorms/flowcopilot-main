import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("mfa_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("mfa_token");
      localStorage.removeItem("mfa_user");
      if (!window.location.pathname.startsWith("/login") && !window.location.pathname.startsWith("/register")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export function formatApiError(detail) {
  if (detail == null) return "Algo deu errado. Tente novamente.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  // Meta-friendly translated message
  if (detail?.error?.friendly_pt) return detail.error.friendly_pt;
  if (detail?.meta_error?.error?.error_user_msg) return detail.meta_error.error.error_user_msg;
  if (detail?.error?.error_user_msg) return detail.error.error_user_msg;
  if (detail?.error?.message) return detail.error.message;
  if (detail && typeof detail.msg === "string") return detail.msg;
  if (detail && typeof detail.message === "string") return detail.message;
  return JSON.stringify(detail);
}

export default api;
