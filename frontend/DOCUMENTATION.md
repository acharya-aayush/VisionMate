# VisionMate Frontend Documentation

Frontend is a React app (Vite + TypeScript) that talks to the backend for face recognition and uses TensorFlow.js in the browser for hand/object detection.

# VisionMate Frontend Documentation

Frontend is a React app (Vite + TypeScript). It does hand/object detection in the browser using TensorFlow.js, and calls the backend for face recognition.

Stack:
- React, Vite, TypeScript
- Tailwind CSS
- TensorFlow.js (hand/object detection, runs in browser)
- TanStack Query (state)
- shadcn/ui, Radix UI (components)
- React Router (routing)
- Supabase (optional, for backend integration)

How it works:
- Gets camera stream in browser
- Runs TensorFlow.js models for hand/object detection (no backend needed for this)
- For face recognition, grabs a frame and sends it to backend API, gets user prediction back
- Handles all detection and feedback logic in browser or via backend API

Frontend and backend are connected by HTTP API calls. No UI docs here, just logic and connection.
