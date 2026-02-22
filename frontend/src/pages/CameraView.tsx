import React, { useEffect, useRef, useState } from 'react';
import Layout from '../components/Layout';
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from 'lucide-react';
import { useVisionSettings } from '@/hooks/useVisionSettings';
import { SimpleSortTracker } from '@/lib/simpleSort';
import { hybridObjectService } from '@/services/hybridObjectService';

// Import our library scripts
declare global {
  interface Window {
    handpose: any;
    cocoSsd: any;
  }
}

const CameraView: React.FC = () => {
  const { toast } = useToast();
  const { settings } = useVisionSettings();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackerRef = useRef(new SimpleSortTracker({ iouThreshold: 0.28, maxMisses: 6, minHits: 1 }));
  const [cameraActive, setCameraActive] = useState(false);
  const [permissionState, setPermissionState] = useState<string>('prompt');
  const [detectionStatus, setDetectionStatus] = useState<string>('No hand detected');
  const [cupInfo, setCupInfo] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const isQuietMode = settings.detectionMode === 'quiet';
  
  // Check if TensorFlow model globals are ready (loaded from index.html)
  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 30;

    const checkLibraries = setInterval(() => {
      attempts += 1;

      if (window.handpose && window.cocoSsd) {
        clearInterval(checkLibraries);
        setModelsLoaded(true);
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(checkLibraries);
        toast({
          title: 'Model Load Timeout',
          description: 'Could not load vision models. Please refresh and try again.',
          variant: 'destructive',
        });
      }
    }, 250);

    return () => {
      clearInterval(checkLibraries);
    };
  }, [toast]);
  
  // Function to convert text to speech
  const speak = (text: string) => {
    if (!settings.speakDetections || isQuietMode) return;
    if (!('speechSynthesis' in window)) return;
    
    const utterance = new SpeechSynthesisUtterance(text);
    // Get the available voices only after the voices have been loaded
    setTimeout(() => {
      const voices = window.speechSynthesis.getVoices();
      const femaleVoice = voices.find(voice => 
        voice.name.includes('Google UK English Female') || 
        voice.name.includes('Microsoft Zira') || 
        (voice as any).gender === 'female'
      );
      
      if (femaleVoice) {
        utterance.voice = femaleVoice;
      }
      utterance.pitch = 1.5;
      utterance.rate = settings.speechRate;
      window.speechSynthesis.speak(utterance);
    }, 100);
  };

  const initializeCamera = async () => {
    try {
      // Simulate connecting to glasses
      setIsConnecting(true);
      toast({
        title: "Establishing connection with glasses...",
        description: "Please wait while we connect to your device.",
      });
      
      // Wait for 3 seconds to simulate connection
      await new Promise(resolve => setTimeout(resolve, 3000));
      setIsConnecting(false);
      
      // Check camera permission state
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const permissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
          setPermissionState(permissionStatus.state);
          
          permissionStatus.onchange = () => {
            setPermissionState(permissionStatus.state);
            if (permissionStatus.state === 'granted') {
              setupDetection();
            }
          };
          
          if (permissionStatus.state === 'granted') {
            setupDetection();
          } else {
            // If permission is not granted yet, try to request it
            setupDetection();
          }
        } catch (error) {
          console.error("Error checking camera permissions:", error);
          setupDetection(); // Try anyway
        }
      } else {
        // Fallback for browsers that don't support permission API
        setupDetection();
      }
    } catch (err) {
      console.error("Error initializing camera:", err);
      setIsConnecting(false);
      toast({
        title: "Connection Failed",
        description: "Could not establish connection with glasses. Please try again.",
        variant: "destructive",
      });
    }
  };

  const setupDetection = async () => {
    if (!videoRef.current || !canvasRef.current) {
      console.error("Video or canvas element not found");
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      console.error("Could not get canvas context");
      return;
    }

    try {
      setIsLoading(true);
      trackerRef.current.reset();

      // Start webcam
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: settings.cameraFacing }
      });
      
      video.srcObject = stream;
      
      // Wait for video to be loaded and play it
      video.onloadedmetadata = () => {
        video.play().catch(err => {
          console.error("Error playing video:", err);
          setIsLoading(false);
          toast({
            title: "Video Playback Error",
            description: "Could not start video playback. Please refresh and try again.",
            variant: "destructive",
          });
        });
      };
      
      // Set canvas dimensions to match video after video is playing
      video.onplaying = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        setCameraActive(true);
        setIsLoading(false);
        toast({
          title: "Connection Established",
          description: "Hand and object detection initialized",
        });
      };
      
      // Load both models
      const handposeModel = await window.handpose.load();
      const cocoSsdModel = await window.cocoSsd.load();
      
      console.log("Handpose and COCO-SSD models loaded");
      
      // Variables for tracking
      let handCenter: { x: number, y: number } | null = null;
      let lastHandPosition: { x: number, y: number } | null = null;
      const PIXELS_PER_CM = 37.7952755906;
      let lastSpeakTime = 0;
      let frameCount = 0;
      let lastHybridScore: number | null = null;
      const SPEAK_INTERVAL = settings.detectionMode === 'social' ? 7000 : 4000;
      
      // Unified detection loop that handles both hand and object detection
      const runDetection = async () => {
        if (!video.readyState || video.readyState < 2) {
          requestAnimationFrame(runDetection);
          return;
        }
        
        // Clear the canvas before drawing
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        try {
          // Hand detection
          const handPredictions = await handposeModel.estimateHands(video);
          console.log("Hand predictions:", handPredictions);
          
          if (handPredictions.length > 0) {
            const landmarks = handPredictions[0].landmarks;
            
            // Draw hand landmarks (red circles) - FIX: No more mirroring
            for (let i = 0; i < landmarks.length; i++) {
              const [x, y] = landmarks[i];
              ctx.beginPath();
              ctx.arc(x, y, 5, 0, 2 * Math.PI);
              ctx.fillStyle = 'red';
              ctx.fill();
            }
            
            // Draw lines connecting the landmarks to form a mesh (green lines) - FIX: No more mirroring
            const connections = [
              [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
              [0, 5], [5, 6], [6, 7], [7, 8], // Index finger
              [5, 9], [9, 10], [10, 11], [11, 12], // Middle finger
              [9, 13], [13, 14], [14, 15], [15, 16], // Ring finger
              [13, 17], [17, 18], [18, 19], [19, 20], // Pinky finger
              [0, 17] // Palm base
            ];
            
            ctx.strokeStyle = 'green';
            ctx.lineWidth = 2;
            connections.forEach(([start, end]) => {
              const [startX, startY] = landmarks[start];
              const [endX, endY] = landmarks[end];
              ctx.beginPath();
              ctx.moveTo(startX, startY);
              ctx.lineTo(endX, endY);
              ctx.stroke();
            });
            
            // Calculate the center of the hand - FIX: No more mirroring
            const centerX = landmarks.reduce((sum, point) => sum + point[0], 0) / landmarks.length;
            const centerY = landmarks.reduce((sum, point) => sum + point[1], 0) / landmarks.length;
            handCenter = { x: centerX, y: centerY };
            
            if (lastHandPosition) {
              const distance = Math.sqrt(
                Math.pow(centerX - lastHandPosition.x, 2) +
                Math.pow(centerY - lastHandPosition.y, 2)
              );
              setDetectionStatus(`Movement detected! Distance: ${distance.toFixed(2)}px`);
            }
            lastHandPosition = { x: centerX, y: centerY };
          } else {
            setDetectionStatus('No hand detected.');
            handCenter = null;
          }
          
          // Object detection - FIX: No more mirroring
          const objectPredictions = await cocoSsdModel.detect(video);
          const trackedObjects = trackerRef.current.update(
            objectPredictions
              .filter((prediction: any) => prediction.score >= 0.42)
              .map((prediction: any) => {
                const [x, y, width, height] = prediction.bbox;
                return {
                  bbox: [x, y, x + width, y + height] as [number, number, number, number],
                  score: prediction.score,
                  label: prediction.class,
                };
              })
          );

          trackedObjects.forEach((track) => {
            const [x1, y1, x2, y2] = track.bbox;
            const width = x2 - x1;
            const height = y2 - y1;

            ctx.strokeStyle = 'blue';
            ctx.lineWidth = 2;
            ctx.strokeRect(x1, y1, width, height);

            ctx.fillStyle = 'blue';
            ctx.font = '16px Arial';
            ctx.fillText(
              `#${track.trackId} ${track.label} (${Math.round(track.score * 100)}%)`,
              x1,
              y1 > 12 ? y1 - 5 : 12
            );
          });

          const primaryTrack = trackedObjects.find((track) => track.label === 'cup') || trackedObjects[0];

          frameCount += 1;

          if (primaryTrack && frameCount % 5 === 0) {
            lastHybridScore = await hybridObjectService.scoreTrack(video, primaryTrack.bbox);
          }

          const blendedConfidence = primaryTrack
            ? Math.round(
                ((primaryTrack.score * 0.75) + ((lastHybridScore ?? primaryTrack.score) * 0.25)) * 100
              )
            : 0;

          if (primaryTrack && handCenter) {
            const [x1, y1, x2, y2] = primaryTrack.bbox;

            // Calculate the center of the object - FIX: No more mirroring
            const objectCenterX = x1 + (x2 - x1) / 2;
            const objectCenterY = y1 + (y2 - y1) / 2;
            
            // Calculate the distance between the hand center and the object center
            const distancePx = Math.sqrt(
              Math.pow(objectCenterX - handCenter.x, 2) +
              Math.pow(objectCenterY - handCenter.y, 2)
            );
            const distanceCm = distancePx / PIXELS_PER_CM;
            
            // Draw a line between the hand center and the object center
            ctx.strokeStyle = 'yellow';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(handCenter.x, handCenter.y);
            ctx.lineTo(objectCenterX, objectCenterY);
            ctx.stroke();
            
            // Determine the relative position of the cup with respect to the hand
            let relativePosition = '';
            if (Math.abs(objectCenterX - handCenter.x) < 10 && Math.abs(objectCenterY - handCenter.y) < 10) {
              relativePosition = 'front';
            } else if (objectCenterX < handCenter.x && Math.abs(objectCenterY - handCenter.y) < 10) {
              relativePosition = 'left';
            } else if (objectCenterX > handCenter.x && Math.abs(objectCenterY - handCenter.y) < 10) {
              relativePosition = 'right';
            } else {
              if (objectCenterX < handCenter.x) {
                relativePosition += 'left ';
              } else if (objectCenterX > handCenter.x) {
                relativePosition += 'right ';
              }
              if (objectCenterY < handCenter.y) {
                relativePosition += 'up';
              } else if (objectCenterY > handCenter.y) {
                relativePosition += 'down';
              }
            }
            
            // Display the relative position information
            setCupInfo(`${primaryTrack.label} is ${relativePosition.trim()} of the hand. Distance: ${distanceCm.toFixed(2)} cm. Hybrid confidence: ${blendedConfidence}%`);
            
            // Use text-to-speech to announce the position if the interval has passed
            const currentTime = Date.now();
            if (currentTime - lastSpeakTime > SPEAK_INTERVAL) {
              speak(`${primaryTrack.label} is ${relativePosition.trim()} of the hand`);
              lastSpeakTime = currentTime;
            }
            
            console.log(`Distance between hand and ${primaryTrack.label}: ${distanceCm.toFixed(2)} cm, Position: ${relativePosition.trim()}`);
          } else if (primaryTrack) {
            setCupInfo(`${primaryTrack.label} detected as track #${primaryTrack.trackId} (Hybrid confidence: ${blendedConfidence}%)`);
          } else {
            setCupInfo('');
          }
        } catch (error) {
          console.error("Detection error:", error);
        }
        
        // Continue the detection loop
        requestAnimationFrame(runDetection);
      };
      
      // Start the detection loop
      runDetection();
      
    } catch (err) {
      console.error("Error accessing webcam:", err);
      setIsLoading(false);
      toast({
        title: "Camera Access Denied",
        description: "Please allow access to your camera to use this feature.",
        variant: "destructive",
      });
    }
  };
  
  return (
    <Layout title="Camera View">
      <div className="space-y-6">
        <div className="glass-card p-4 animate-fade-in">
          <div className="camera-container relative">
            <video 
              ref={videoRef} 
              id="video" 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-auto rounded-lg"
              aria-label="Camera feed"
            ></video>
            <canvas 
              ref={canvasRef} 
              id="canvas" 
              className="absolute top-0 left-0 w-full h-full"
              aria-hidden="true"
            ></canvas>
            
            {(isLoading || isConnecting) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded-lg text-white">
                <Loader2 className="h-10 w-10 animate-spin mb-4" />
                <p className="text-xl font-medium">
                  {isConnecting ? 'Establishing connection with glasses...' : 'Initializing camera...'}
                </p>
              </div>
            )}
          </div>
        </div>
        
        {!cameraActive && !isLoading && !isConnecting && (
          <div className="flex justify-center animate-fade-in">
            <button
              onClick={initializeCamera}
              disabled={!modelsLoaded}
              className={`btn-primary flex items-center gap-2 ${!modelsLoaded ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-label="Establish connection with glasses"
            >
              {!modelsLoaded && <Loader2 className="h-4 w-4 animate-spin" />}
              Establish Connection with Glasses
            </button>
          </div>
        )}
        
        <div className="glass-card p-4 animate-fade-in">
          <h2 className="font-semibold mb-2">Detection Status</h2>
          <p id="movement" className="text-sm" aria-live="polite">{detectionStatus}</p>
          
          {cupInfo && (
            <div id="cup-info" className="mt-4 bg-babyBlue/10 p-3 rounded-lg text-sm" aria-live="polite">
              {cupInfo}
            </div>
          )}
        </div>
        
        <div className="glass-card p-4 animate-fade-in">
          <h2 className="font-semibold mb-2">Instructions</h2>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
            <li>Click "Establish Connection with Glasses" to start</li>
            <li>Move your hand in front of the camera to see hand tracking</li>
            <li>Point the camera at cups and other objects for detection</li>
            <li>Audio descriptions will play when objects are detected</li>
            <li>For best results, ensure good lighting</li>
          </ul>
        </div>
      </div>
    </Layout>
  );
};

export default CameraView;
