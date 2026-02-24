# Changelog

All notable changes to VisionMate are documented in this file.

## 1.0.3.4
- Added changelog documentation for release history.
- Fixed `.gitignore` to allow tracking docs content.

## 1.0.3.3
- Removed external GPT runtime script from production HTML.
- Cleaned up unused scaffold page and reduced shipped surface area.

## 1.0.3.2
- Lazy-loaded ONNX hybrid inference stage to reduce initial bundle pressure.
- Split heavy `onnxruntime-web` code into a dedicated chunk for faster mobile startup.

## 1.0.3.1
- Added hybrid MobileNetV3/ONNX scoring for object confidence blending.
- Integrated ONNX-based score feedback into the camera guidance path.

## 1.0.3.0
- Added lightweight SORT-inspired object tracking for stable guidance.
- Tracked objects across frames to reduce jitter and improve navigation cues.

## 1.0.2.3
- Wired runtime vision settings into camera and recognition flows.
- Added user-selected detection modes, speech rate, and confidence floor.

## 1.0.2.2
- Introduced shared `useVisionSettings` hook for persistent accessibility preferences.
- Migrated settings page to centralized persistent configuration.

## 1.0.2.1
- Added navigation profile controls and sensitivity tuning for speech output.
- Added detection mode selection for navigation, social, and quiet experiences.

## 1.0.2.0
- Added shared persistent vision settings model.
- Implemented accessible settings storage and visual mode handling.

## 1.0.1.3
- Added backend API contract tests and dev requirements.
- Implemented GitHub Actions workflow for backend API validation.

## 1.0.1.2
- Added benchmark script for recognition latency measurement.
- Documented benchmark usage in backend documentation.

## 1.0.1.1
- Strengthened backend model endpoint validation with typed request schemas.
- Added stricter error handling for base64 image payloads.

## 1.0.1.0
- Unified frontend endpoint configuration through runtime variables.
- Added `.env.example` for environment-driven API/WS base URLs.

## 1.0.0.2
- Tightened CORS policy and aligned Vite startup ports.
- Fixed frontend startup docs/modes to reflect actual port 8080.

## 1.0.0.1
- Added deterministic model readiness checks to the camera page.
- Removed duplicate runtime TensorFlow injection and added load timeout handling.
