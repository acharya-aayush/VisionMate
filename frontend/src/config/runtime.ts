const DEFAULT_API_BASE_URL = "http://localhost:8000";

const normalizeBaseUrl = (raw: string): string => raw.replace(/\/+$/, "");

export const API_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
);

export const WS_URL =
  import.meta.env.VITE_WS_URL ||
  API_BASE_URL.replace(/^http/i, "ws") + "/ws/recognize";
