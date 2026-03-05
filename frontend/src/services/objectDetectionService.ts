import { API_BASE_URL } from '@/config/runtime';

export interface BackendObjectDetection {
  label: string;
  score: number;
  bbox: [number, number, number, number];
}

export interface BackendObjectDetectionResponse {
  success: boolean;
  engine: string;
  objects: BackendObjectDetection[];
  latency_ms: number;
  message: string;
}

export async function detectObjectsAccurateBase64(
  base64Image: string,
  confidence: number,
  maxResults: number = 12
): Promise<BackendObjectDetectionResponse> {
  const response = await fetch(`${API_BASE_URL}/object-detect-base64`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image: base64Image,
      confidence,
      max_results: maxResults,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Object detection failed: ${text}`);
  }

  return response.json();
}

export const captureVideoFrameBase64 = (
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): string | null => {
  if (video.videoWidth <= 0 || video.videoHeight <= 0) {
    return null;
  }

  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.72);
};
