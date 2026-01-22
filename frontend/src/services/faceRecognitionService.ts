/**
 * Face Recognition Service for Vision Mate
 * Handles communication with Python FastAPI backend
 */

// API Configuration
const API_BASE_URL = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000/ws/recognize';

// Types
export interface FaceLocation {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface RecognizedFace {
  user_id: number | null;
  user_name: string;
  confidence: number;
  is_known: boolean;
  face_location: FaceLocation | null;
}

export interface RecognitionResponse {
  success: boolean;
  faces: RecognizedFace[];
  message: string;
  timestamp: string;
}

export interface UserInfo {
  user_id: number;
  user_name: string;
}

export interface UsersListResponse {
  users: Record<string, string>;
  count: number;
}

export interface RegistrationResponse {
  success: boolean;
  user_id: number;
  user_name: string;
  message: string;
}

/**
 * Check if the backend API is available
 */
export async function checkAPIHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/`);
    return response.ok;
  } catch (error) {
    console.error('API health check failed:', error);
    console.log('Ensure Python server is running at', API_BASE_URL);
    return false;
  }
}

/**
 * Get list of all registered users
 */
export async function listUsers(): Promise<UsersListResponse> {
  const response = await fetch(`${API_BASE_URL}/users`);
  if (!response.ok) {
    throw new Error('Failed to fetch users');
  }
  return response.json();
}

/**
 * Recognize faces from a base64-encoded image
 */
export async function recognizeFaceBase64(base64Image: string): Promise<RecognitionResponse> {
  const response = await fetch(`${API_BASE_URL}/recognize-base64`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ image: base64Image }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Recognition failed (${response.status}):`, text);
    throw new Error(`Recognition request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Register a new face from a base64-encoded image
 */
export async function registerFaceBase64(
  userName: string,
  base64Image: string
): Promise<RegistrationResponse> {
  const response = await fetch(`${API_BASE_URL}/register-base64`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_name: userName,
      image: base64Image,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Registration failed');
  }

  return response.json();
}

/**
 * Trigger model retraining on the backend
 */
export async function trainModel(maxSamples: number = 50): Promise<{
  success: boolean;
  stats: { processed: number; users: number; failed: number };
  message: string;
}> {
  const response = await fetch(`${API_BASE_URL}/train?max_samples=${maxSamples}`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Training request failed');
  }

  return response.json();
}

/**
 * WebSocket connection manager for real-time recognition
 */
export class FaceRecognitionSocket {
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private onResultCallback: ((faces: RecognizedFace[]) => void) | null = null;
  private onConnectionChange: ((connected: boolean) => void) | null = null;

  /**
   * Connect to the WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(WS_URL);

        this.socket.onopen = () => {
          console.log('✅ WebSocket connected');
          this.reconnectAttempts = 0;
          this.onConnectionChange?.(true);
          resolve();
        };

        this.socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.success && data.faces) {
              this.onResultCallback?.(data.faces);
            }
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        this.socket.onclose = () => {
          console.log('❌ WebSocket disconnected');
          this.onConnectionChange?.(false);
          this.attemptReconnect();
        };

        this.socket.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Attempt to reconnect after disconnection
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Reconnecting... (attempt ${this.reconnectAttempts})`);
      setTimeout(() => this.connect(), 2000);
    }
  }

  /**
   * Send a video frame for recognition
   */
  sendFrame(base64Image: string, frameId: number = 0): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        image: base64Image,
        frame_id: frameId,
      }));
    }
  }

  /**
   * Set callback for recognition results
   */
  onResult(callback: (faces: RecognizedFace[]) => void): void {
    this.onResultCallback = callback;
  }

  /**
   * Set callback for connection state changes
   */
  onConnection(callback: (connected: boolean) => void): void {
    this.onConnectionChange = callback;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}

// Export singleton instance for convenience
export const faceRecognitionSocket = new FaceRecognitionSocket();
