import { useCallback, useEffect, useMemo, useState } from "react";

export type DetectionMode = "navigation" | "social" | "quiet";
export type DetectionEngine = "fast-browser" | "accurate-yolo";

export interface VisionSettings {
  fontSize: number;
  highContrast: boolean;
  speakDetections: boolean;
  useReadAloud: boolean;
  cameraFacing: "environment" | "user";
  detectionMode: DetectionMode;
  speechRate: number;
  confidenceFloor: number;
  revealFaceNames: boolean;
  objectConfidenceFloor: number;
  detectionEngine: DetectionEngine;
}

const STORAGE_KEY = "vision.settings.v1";

const DEFAULT_SETTINGS: VisionSettings = {
  fontSize: 16,
  highContrast: false,
  speakDetections: true,
  useReadAloud: true,
  cameraFacing: "environment",
  detectionMode: "navigation",
  speechRate: 1,
  confidenceFloor: 55,
  revealFaceNames: false,
  objectConfidenceFloor: 52,
  detectionEngine: "accurate-yolo",
};

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const sanitize = (partial: Partial<VisionSettings>): VisionSettings => {
  const cameraFacing = partial.cameraFacing === "user" ? "user" : "environment";
  const detectionMode: DetectionMode =
    partial.detectionMode === "social" || partial.detectionMode === "quiet"
      ? partial.detectionMode
      : "navigation";
  const detectionEngine: DetectionEngine =
    partial.detectionEngine === "accurate-yolo" ? "accurate-yolo" : "fast-browser";

  return {
    fontSize: clamp(Number(partial.fontSize ?? DEFAULT_SETTINGS.fontSize), 12, 24),
    highContrast: Boolean(partial.highContrast),
    speakDetections:
      typeof partial.speakDetections === "boolean"
        ? partial.speakDetections
        : DEFAULT_SETTINGS.speakDetections,
    useReadAloud:
      typeof partial.useReadAloud === "boolean"
        ? partial.useReadAloud
        : DEFAULT_SETTINGS.useReadAloud,
    cameraFacing,
    detectionMode,
    speechRate: clamp(Number(partial.speechRate ?? DEFAULT_SETTINGS.speechRate), 0.7, 1.4),
    confidenceFloor: clamp(Number(partial.confidenceFloor ?? DEFAULT_SETTINGS.confidenceFloor), 35, 90),
    revealFaceNames:
      typeof partial.revealFaceNames === "boolean"
        ? partial.revealFaceNames
        : DEFAULT_SETTINGS.revealFaceNames,
    objectConfidenceFloor: clamp(
      Number(partial.objectConfidenceFloor ?? DEFAULT_SETTINGS.objectConfidenceFloor),
      35,
      90
    ),
    detectionEngine,
  };
};

const loadLegacySettings = (): Partial<VisionSettings> => {
  const fontSize = Number(localStorage.getItem("fontSize") || DEFAULT_SETTINGS.fontSize);
  const highContrast = localStorage.getItem("highContrast") === "true";
  const speakDetections = localStorage.getItem("speakDetections") !== "false";
  const useReadAloud = localStorage.getItem("useReadAloud") !== "false";
  const cameraFacing =
    localStorage.getItem("cameraFacing") === "user" ? "user" : "environment";
  const revealFaceNames = localStorage.getItem("revealFaceNames") === "true";
  const objectConfidenceFloor = Number(
    localStorage.getItem("objectConfidenceFloor") || DEFAULT_SETTINGS.objectConfidenceFloor
  );
  const storedDetectionEngine = localStorage.getItem("detectionEngine");
  const detectionEngine: DetectionEngine =
    storedDetectionEngine === "accurate-yolo" || storedDetectionEngine === "fast-browser"
      ? storedDetectionEngine
      : DEFAULT_SETTINGS.detectionEngine;

  return {
    fontSize,
    highContrast,
    speakDetections,
    useReadAloud,
    cameraFacing,
    revealFaceNames,
    objectConfidenceFloor,
    detectionEngine,
  };
};

export const loadVisionSettings = (): VisionSettings => {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS;
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return sanitize(loadLegacySettings());
  }

  try {
    return sanitize(JSON.parse(raw) as Partial<VisionSettings>);
  } catch {
    return sanitize(loadLegacySettings());
  }
};

const applyVisualSettings = (settings: VisionSettings): void => {
  document.documentElement.style.fontSize = `${settings.fontSize}px`;
  document.body.classList.toggle("high-contrast-mode", settings.highContrast);
};

const persistSettings = (settings: VisionSettings): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  localStorage.setItem("fontSize", String(settings.fontSize));
  localStorage.setItem("highContrast", String(settings.highContrast));
  localStorage.setItem("speakDetections", String(settings.speakDetections));
  localStorage.setItem("useReadAloud", String(settings.useReadAloud));
  localStorage.setItem("cameraFacing", settings.cameraFacing);
  localStorage.setItem("revealFaceNames", String(settings.revealFaceNames));
  localStorage.setItem("objectConfidenceFloor", String(settings.objectConfidenceFloor));
  localStorage.setItem("detectionEngine", settings.detectionEngine);
};

export const useVisionSettings = () => {
  const [settings, setSettings] = useState<VisionSettings>(() => loadVisionSettings());

  useEffect(() => {
    applyVisualSettings(settings);
    persistSettings(settings);
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<VisionSettings>) => {
    setSettings((prev) => sanitize({ ...prev, ...patch }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return useMemo(
    () => ({
      settings,
      updateSettings,
      resetSettings,
    }),
    [settings, updateSettings, resetSettings]
  );
};
