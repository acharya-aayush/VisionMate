import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Layout from '../components/Layout';
import { useToast } from '@/hooks/use-toast';
import { useVisionSettings } from '@/hooks/useVisionSettings';
import { SimpleSortTracker } from '@/lib/simpleSort';
import { API_BASE_URL } from '@/config/runtime';
import { getLatestMobileFrame } from '@/services/faceRecognitionService';
import {
  captureVideoFrameBase64,
  detectObjectsAccurateBase64,
} from '@/services/objectDetectionService';
import {
  CheckIcon,
  CopyIcon,
  DeviceCameraVideoIcon,
  LinkExternalIcon,
  ShieldLockIcon,
  StopIcon,
  SyncIcon,
} from '@primer/octicons-react';

declare global {
  interface HandPosePrediction {
    landmarks: Array<[number, number, number]>;
  }

  interface HandPoseModel {
    estimateHands: (input: HTMLVideoElement) => Promise<HandPosePrediction[]>;
  }

  interface CocoSsdPrediction {
    bbox: [number, number, number, number];
    score: number;
    class: string;
  }

  interface CocoSsdModel {
    detect: (
      input: HTMLVideoElement,
      maxNumBoxes?: number,
      minScore?: number
    ) => Promise<CocoSsdPrediction[]>;
  }

  interface Window {
    handpose: {
      load: () => Promise<HandPoseModel>;
    };
    cocoSsd: {
      load: (config?: { base?: string }) => Promise<CocoSsdModel>;
    };
  }
}

type CameraSourceMode = 'local' | 'mobile';

interface DetectionCandidate {
  bbox: [number, number, number, number];
  score: number;
  label: string;
}

interface QrCodeModule {
  toDataURL: (
    text: string,
    options?: {
      width?: number;
      margin?: number;
      errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    }
  ) => Promise<string>;
}

const PIXELS_PER_CM = 37.7952755906;

const buildSessionId = (): string => Math.random().toString(36).slice(2, 8);

const isLoopbackHost = (host: string): boolean =>
  host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';

const extractHostFromUrl = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

const resolveDefaultMobileHost = (): string => {
  const browserHost = window.location.hostname || 'localhost';
  if (!isLoopbackHost(browserHost)) {
    return browserHost;
  }

  const apiHost = extractHostFromUrl(API_BASE_URL);
  if (apiHost && !isLoopbackHost(apiHost)) {
    return apiHost;
  }

  return browserHost;
};

const CameraView: React.FC = () => {
  const { toast } = useToast();
  const { settings } = useVisionSettings();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const detectionLoopRef = useRef<number | null>(null);
  const mobilePollTimerRef = useRef<number | null>(null);
  const detectionActiveRef = useRef(false);
  const relayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const relayImageRef = useRef<HTMLImageElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastRelayTimestampRef = useRef<string>('');

  const backendStateRef = useRef<{
    pending: boolean;
    lastAt: number;
    objects: DetectionCandidate[];
    latencyMs: number;
  }>({
    pending: false,
    lastAt: 0,
    objects: [],
    latencyMs: 0,
  });

  const trackerRef = useRef(
    new SimpleSortTracker({ iouThreshold: 0.3, maxMisses: 8, minHits: 2, smoothing: 0.38 })
  );
  const hybridServiceRef = useRef<null | {
    scoreTrack: (video: HTMLVideoElement, bbox: [number, number, number, number]) => Promise<number | null>;
  }>(null);
  const handModelRef = useRef<HandPoseModel | null>(null);
  const objectModelRef = useRef<CocoSsdModel | null>(null);

  const [sourceMode, setSourceMode] = useState<CameraSourceMode>('local');
  const [cameraActive, setCameraActive] = useState(false);
  const [detectionStatus, setDetectionStatus] = useState('Camera is idle');
  const [objectInfo, setObjectInfo] = useState('');
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [isLoading, setIsLoading] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [mobileSessionId, setMobileSessionId] = useState(buildSessionId);
  const [mobileHost, setMobileHost] = useState(resolveDefaultMobileHost);
  const [mobileFrameTime, setMobileFrameTime] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [backendLatencyMs, setBackendLatencyMs] = useState<number | null>(null);
  const [backendError, setBackendError] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');

  const isQuietMode = settings.detectionMode === 'quiet';
  const objectScoreFloor = settings.objectConfidenceFloor / 100;

  const loadHybridService = useCallback(async () => {
    if (hybridServiceRef.current) return hybridServiceRef.current;

    try {
      const module = await import('@/services/hybridObjectService');
      hybridServiceRef.current = module.hybridObjectService;
      return hybridServiceRef.current;
    } catch (error) {
      console.warn('Hybrid ONNX stage unavailable', error);
      return null;
    }
  }, []);

  const mobileCaptureUrl = useMemo(() => {
    const cleanHostInput = mobileHost.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
    const cleanHost = cleanHostInput || window.location.hostname || 'localhost';
    const hostWithPort = cleanHost.includes(':')
      ? cleanHost
      : `${cleanHost}${window.location.port ? `:${window.location.port}` : ''}`;

    const appBase = `${window.location.protocol}//${hostWithPort}`;
    const apiBaseForPhone = API_BASE_URL
      .replace('localhost', cleanHost || window.location.hostname)
      .replace('127.0.0.1', cleanHost || window.location.hostname);

    return `${appBase}/mobile-camera?session=${encodeURIComponent(mobileSessionId)}&api=${encodeURIComponent(apiBaseForPhone)}`;
  }, [mobileHost, mobileSessionId]);

  useEffect(() => {
    let active = true;

    if (!isLoopbackHost(mobileHost.trim())) {
      return () => {
        active = false;
      };
    }

    const resolveLanHost = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/network-info`);
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { lan_ips?: string[] };
        const lanIp = (payload.lan_ips || []).find(
          (ip) => typeof ip === 'string' && ip.length > 0 && !isLoopbackHost(ip)
        );

        if (!active || !lanIp) {
          return;
        }

        setMobileHost((prev) => {
          const trimmed = prev.trim();
          return isLoopbackHost(trimmed) || trimmed === '' ? lanIp : prev;
        });
      } catch (error) {
        console.warn('LAN host auto-detect failed:', error);
      }
    };

    void resolveLanHost();

    return () => {
      active = false;
    };
  }, [mobileHost]);

  const clearDetectionLoop = useCallback(() => {
    detectionActiveRef.current = false;

    if (detectionLoopRef.current !== null) {
      window.cancelAnimationFrame(detectionLoopRef.current);
      detectionLoopRef.current = null;
    }

    if (mobilePollTimerRef.current !== null) {
      window.clearTimeout(mobilePollTimerRef.current);
      mobilePollTimerRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    clearDetectionLoop();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (videoRef.current?.srcObject) {
      const activeStream = videoRef.current.srcObject as MediaStream;
      activeStream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    trackerRef.current.reset();
    setCameraActive(false);
    setMobileFrameTime('');
    setObjectInfo('');
    setDetectionStatus('Camera is idle');
    setBackendError('');
    setBackendLatencyMs(null);
    backendStateRef.current = {
      pending: false,
      lastAt: 0,
      objects: [],
      latencyMs: 0,
    };
    window.speechSynthesis?.cancel();
  }, [clearDetectionLoop]);

  const revokeCameraAccess = useCallback(() => {
    stopCamera();
    setPermissionState('prompt');

    toast({
      title: 'Camera turned off',
      description:
        'Browsers block direct permission revocation. Open browser site settings if you want full camera revocation.',
    });
  }, [stopCamera, toast]);

  const speak = useCallback(
    (text: string) => {
      if (!settings.speakDetections || isQuietMode) return;
      if (!('speechSynthesis' in window)) return;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = settings.speechRate;
      utterance.pitch = 1.06;
      window.speechSynthesis.speak(utterance);
    },
    [isQuietMode, settings.speakDetections, settings.speechRate]
  );

  const waitForVideoReady = useCallback(async () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    if (video.readyState >= 2) return;

    await new Promise<void>((resolve) => {
      const onReady = () => {
        video.removeEventListener('loadeddata', onReady);
        resolve();
      };

      video.addEventListener('loadeddata', onReady);
    });
  }, []);

  const ensureModels = useCallback(async (needBrowserDetector: boolean) => {
    if (!window.handpose || !window.cocoSsd) {
      throw new Error('Vision model scripts not loaded in browser runtime');
    }

    if (!handModelRef.current) {
      handModelRef.current = await window.handpose.load();
    }

    if (needBrowserDetector && !objectModelRef.current) {
      objectModelRef.current = await window.cocoSsd.load({ base: 'mobilenet_v2' });
    }
  }, []);

  const requestBackendObjects = useCallback(async (video: HTMLVideoElement) => {
    const state = backendStateRef.current;
    const now = performance.now();

    if (state.pending || now - state.lastAt < 220) {
      return;
    }

    if (!captureCanvasRef.current) {
      captureCanvasRef.current = document.createElement('canvas');
    }

    const image = captureVideoFrameBase64(video, captureCanvasRef.current);
    if (!image) {
      return;
    }

    state.pending = true;
    state.lastAt = now;

    try {
      const response = await detectObjectsAccurateBase64(image, objectScoreFloor, 14);
      const parsedObjects: DetectionCandidate[] = [];

      for (const object of response.objects) {
        if (!Array.isArray(object.bbox) || object.bbox.length !== 4) {
          continue;
        }

        const x1 = Number(object.bbox[0]);
        const y1 = Number(object.bbox[1]);
        const x2 = Number(object.bbox[2]);
        const y2 = Number(object.bbox[3]);

        if (![x1, y1, x2, y2].every((value) => Number.isFinite(value))) {
          continue;
        }

        parsedObjects.push({
          label: object.label,
          score: Number(object.score),
          bbox: [x1, y1, x2, y2],
        });
      }

      state.objects = parsedObjects;
      state.latencyMs = response.latency_ms;
      setBackendLatencyMs(Math.round(response.latency_ms));
      setBackendError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Accurate mode temporarily unavailable';
      setBackendError(message);
    } finally {
      state.pending = false;
    }
  }, [objectScoreFloor]);

  const startDetectionLoop = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const usingAccurateBackend = settings.detectionEngine === 'accurate-yolo';
    await ensureModels(!usingAccurateBackend);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    detectionActiveRef.current = true;
    trackerRef.current.reset();

    let lastSpeakAt = 0;
    let frameCount = 0;
    let lastHybridScore: number | null = null;
    const speakInterval = settings.detectionMode === 'social' ? 6500 : 3800;

    const detectFrame = async () => {
      if (!detectionActiveRef.current) return;

      if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        detectionLoopRef.current = window.requestAnimationFrame(() => {
          void detectFrame();
        });
        return;
      }

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      try {
        const handPredictions = await handModelRef.current?.estimateHands(video);
        const hand = handPredictions?.[0];

        let handCenter: { x: number; y: number } | null = null;

        if (hand?.landmarks?.length) {
          const landmarks = hand.landmarks;
          const cx = landmarks.reduce((sum, point) => sum + point[0], 0) / landmarks.length;
          const cy = landmarks.reduce((sum, point) => sum + point[1], 0) / landmarks.length;
          handCenter = { x: cx, y: cy };

          ctx.fillStyle = '#f97316';
          for (const [x, y] of landmarks) {
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        let detectionCandidates: DetectionCandidate[] = [];

        if (usingAccurateBackend) {
          await requestBackendObjects(video);
          detectionCandidates = backendStateRef.current.objects.filter(
            (candidate) => candidate.score >= objectScoreFloor
          );
        } else {
          const objectPredictions = await objectModelRef.current?.detect(video, 12, objectScoreFloor);
          detectionCandidates = (objectPredictions || [])
            .filter((prediction) => prediction.score >= objectScoreFloor)
            .map((prediction) => {
              const [x, y, width, height] = prediction.bbox;
              return {
                bbox: [x, y, x + width, y + height] as [number, number, number, number],
                score: prediction.score,
                label: prediction.class,
              };
            });
        }

        const trackedObjects = trackerRef.current.update(detectionCandidates);

        for (const track of trackedObjects) {
          const [x1, y1, x2, y2] = track.bbox;
          const width = x2 - x1;
          const height = y2 - y1;

          ctx.strokeStyle = '#0ea5e9';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(x1, y1, width, height);

          ctx.fillStyle = '#082f49';
          ctx.fillRect(x1, Math.max(0, y1 - 20), 220, 20);
          ctx.fillStyle = '#f8fafc';
          ctx.font = '13px ui-sans-serif, system-ui, sans-serif';
          ctx.fillText(`#${track.trackId} ${track.label} ${Math.round(track.score * 100)}%`, x1 + 6, y1 > 18 ? y1 - 6 : 14);
        }

        const primaryTrack = trackedObjects.find((track) => track.label === 'cup') || trackedObjects[0];
        frameCount += 1;

        if (primaryTrack && frameCount % 4 === 0 && settings.detectionMode !== 'quiet') {
          const hybridService = await loadHybridService();
          if (hybridService) {
            lastHybridScore = await hybridService.scoreTrack(video, primaryTrack.bbox);
          }
        }

        if (!primaryTrack) {
          setDetectionStatus(
            handCenter
              ? 'Hand tracked, but no high-confidence object found'
              : 'No stable object detected yet'
          );
          setObjectInfo('');
        } else {
          const blendedConfidence = Math.round(
            ((primaryTrack.score * 0.75) + ((lastHybridScore ?? primaryTrack.score) * 0.25)) * 100
          );

          if (handCenter) {
            const [x1, y1, x2, y2] = primaryTrack.bbox;
            const objectCenterX = x1 + (x2 - x1) / 2;
            const objectCenterY = y1 + (y2 - y1) / 2;

            const distancePx = Math.hypot(objectCenterX - handCenter.x, objectCenterY - handCenter.y);
            const distanceCm = distancePx / PIXELS_PER_CM;

            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(handCenter.x, handCenter.y);
            ctx.lineTo(objectCenterX, objectCenterY);
            ctx.stroke();

            const leftRight = objectCenterX < handCenter.x ? 'left' : 'right';
            const upDown = objectCenterY < handCenter.y ? 'up' : 'down';
            const descriptor = `${leftRight} ${upDown}`;

            setDetectionStatus(
              `${trackedObjects.length} tracked object(s) on ${usingAccurateBackend ? 'accurate YOLO mode' : 'fast browser mode'}`
            );
            setObjectInfo(
              `${primaryTrack.label} is ${descriptor} of hand · ${distanceCm.toFixed(1)} cm · confidence ${blendedConfidence}%`
            );

            if (Date.now() - lastSpeakAt > speakInterval) {
              speak(`${primaryTrack.label} ${descriptor}`);
              lastSpeakAt = Date.now();
            }
          } else {
            setDetectionStatus(
              `${trackedObjects.length} tracked object(s) on ${usingAccurateBackend ? 'accurate YOLO mode' : 'fast browser mode'}`
            );
            setObjectInfo(
              `Top object: ${primaryTrack.label} · track #${primaryTrack.trackId} · confidence ${blendedConfidence}%`
            );

            if (Date.now() - lastSpeakAt > speakInterval) {
              speak(`${primaryTrack.label} detected`);
              lastSpeakAt = Date.now();
            }
          }
        }
      } catch (error) {
        console.error('Detection error:', error);
        setDetectionStatus('Detection temporarily unavailable');
      }

      detectionLoopRef.current = window.requestAnimationFrame(() => {
        void detectFrame();
      });
    };

    await detectFrame();
  }, [ensureModels, loadHybridService, objectScoreFloor, requestBackendObjects, settings.detectionEngine, settings.detectionMode, speak]);

  const startLocalCamera = useCallback(async () => {
    if (!videoRef.current) return;

    setIsLoading(true);

    try {
      stopCamera();

      if (navigator.permissions?.query) {
        try {
          const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
          setPermissionState(status.state as 'prompt' | 'granted' | 'denied');
        } catch {
          setPermissionState('prompt');
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: settings.cameraFacing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      localStreamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      await waitForVideoReady();

      setPermissionState('granted');
      setCameraActive(true);
      setDetectionStatus(
        `Local camera connected · ${settings.detectionEngine === 'accurate-yolo' ? 'Accurate YOLO mode' : 'Fast browser mode'}`
      );
      toast({
        title: 'Camera connected',
        description:
          settings.detectionEngine === 'accurate-yolo'
            ? 'Using backend YOLO ONNX for high-accuracy detection.'
            : 'Using fast browser detector for low latency.',
      });

      await startDetectionLoop();
    } catch (error) {
      console.error('Local camera start failed:', error);
      setDetectionStatus('Unable to start camera');
      setPermissionState('denied');
      toast({
        title: 'Camera access blocked',
        description: 'Please allow camera permission and retry.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [settings.cameraFacing, settings.detectionEngine, startDetectionLoop, stopCamera, toast, waitForVideoReady]);

  const beginRelayPolling = useCallback(() => {
    const ensureRelayObjects = () => {
      if (!relayCanvasRef.current) {
        relayCanvasRef.current = document.createElement('canvas');
        relayCanvasRef.current.width = 960;
        relayCanvasRef.current.height = 540;
      }

      if (!relayImageRef.current) {
        relayImageRef.current = new Image();
      }
    };

    ensureRelayObjects();

    const poll = async () => {
      if (!detectionActiveRef.current || sourceMode !== 'mobile') return;

      try {
        const frame = await getLatestMobileFrame(mobileSessionId);
        if (frame.has_frame && frame.image && frame.updated_at !== lastRelayTimestampRef.current) {
          lastRelayTimestampRef.current = frame.updated_at || '';
          setMobileFrameTime(frame.updated_at || '');

          const relayCanvas = relayCanvasRef.current;
          const relayImage = relayImageRef.current;
          if (relayCanvas && relayImage) {
            relayImage.onload = () => {
              const ctx = relayCanvas.getContext('2d');
              if (!ctx) return;

              if (relayCanvas.width !== relayImage.naturalWidth || relayCanvas.height !== relayImage.naturalHeight) {
                relayCanvas.width = Math.max(320, relayImage.naturalWidth);
                relayCanvas.height = Math.max(240, relayImage.naturalHeight);
              }

              ctx.drawImage(relayImage, 0, 0, relayCanvas.width, relayCanvas.height);
            };
            relayImage.src = frame.image;
          }
        }
      } catch (error) {
        console.warn('Relay polling error:', error);
      }

      mobilePollTimerRef.current = window.setTimeout(poll, 140);
    };

    mobilePollTimerRef.current = window.setTimeout(poll, 0);
  }, [mobileSessionId, sourceMode]);

  const startMobileRelay = useCallback(async () => {
    if (!videoRef.current) return;

    setIsLoading(true);

    try {
      stopCamera();

      if (!relayCanvasRef.current) {
        relayCanvasRef.current = document.createElement('canvas');
        relayCanvasRef.current.width = 960;
        relayCanvasRef.current.height = 540;
      }

      const relayStream = relayCanvasRef.current.captureStream(20);
      videoRef.current.srcObject = relayStream;
      await videoRef.current.play();
      await waitForVideoReady();

      setCameraActive(true);
      setDetectionStatus(
        `Waiting for mobile frames · ${settings.detectionEngine === 'accurate-yolo' ? 'Accurate YOLO mode' : 'Fast browser mode'}`
      );
      detectionActiveRef.current = true;
      beginRelayPolling();

      toast({
        title: 'Mobile relay enabled',
        description: 'Scan the QR code with your phone and keep that page open.',
      });

      await startDetectionLoop();
    } catch (error) {
      console.error('Mobile relay start failed:', error);
      setDetectionStatus('Mobile relay failed to initialize');
      toast({
        title: 'Relay error',
        description: 'Could not start the mobile relay stream.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [beginRelayPolling, settings.detectionEngine, startDetectionLoop, stopCamera, toast, waitForVideoReady]);

  const startSelectedSource = useCallback(async () => {
    if (!modelsLoaded) {
      toast({
        title: 'Models still loading',
        description: 'Please wait a few seconds and try again.',
      });
      return;
    }

    if (sourceMode === 'local') {
      await startLocalCamera();
      return;
    }

    await startMobileRelay();
  }, [modelsLoaded, sourceMode, startLocalCamera, startMobileRelay, toast]);

  const copyMobileUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(mobileCaptureUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ title: 'Copy failed', description: 'Copy the link manually.', variant: 'destructive' });
    }
  }, [mobileCaptureUrl, toast]);

  const refreshSessionId = useCallback(() => {
    setMobileSessionId(buildSessionId());
  }, []);

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 40;

    const checkLibraries = window.setInterval(() => {
      attempts += 1;

      if (window.handpose && window.cocoSsd) {
        window.clearInterval(checkLibraries);
        setModelsLoaded(true);
        return;
      }

      if (attempts >= maxAttempts) {
        window.clearInterval(checkLibraries);
        toast({
          title: 'Model load timeout',
          description: 'Vision models did not load. Refresh and retry.',
          variant: 'destructive',
        });
      }
    }, 250);

    return () => {
      window.clearInterval(checkLibraries);
      stopCamera();
    };
  }, [stopCamera, toast]);

  useEffect(() => {
    let active = true;

    if (sourceMode !== 'mobile') {
      setQrCodeDataUrl('');
      return () => {
        active = false;
      };
    }

    const generateQr = async () => {
      try {
        const qrModule = (await import('qrcode')) as QrCodeModule;
        const url = await qrModule.toDataURL(mobileCaptureUrl, {
          width: 220,
          margin: 1,
          errorCorrectionLevel: 'M',
        });
        if (active) {
          setQrCodeDataUrl(url);
        }
      } catch (error) {
        console.warn('QR generation failed:', error);
      }
    };

    void generateQr();

    return () => {
      active = false;
    };
  }, [mobileCaptureUrl, sourceMode]);

  return (
    <Layout title="Object Detection">
      <div className="space-y-5">
        <section className="glass-card p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Input Source</p>
              <h2 className="text-lg font-semibold">Choose Camera Mode</h2>
            </div>

            <div className="inline-flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Camera source mode">
              <button
                onClick={() => setSourceMode('local')}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${sourceMode === 'local' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                disabled={cameraActive}
              >
                Local Camera
              </button>
              <button
                onClick={() => setSourceMode('mobile')}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${sourceMode === 'mobile' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                disabled={cameraActive}
              >
                Mobile Relay
              </button>
            </div>
          </div>

          <p className="mt-2 text-sm text-slate-600">
            Current engine: {settings.detectionEngine === 'accurate-yolo' ? 'Accurate YOLO ONNX (backend)' : 'Fast Browser Detector'}
          </p>

          {sourceMode === 'mobile' && (
            <div className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Session ID
                  <div className="mt-1 flex gap-2">
                    <input
                      value={mobileSessionId}
                      onChange={(event) =>
                        setMobileSessionId(
                          event.target.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12)
                        )
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      disabled={cameraActive}
                    />
                    <button
                      onClick={refreshSessionId}
                      disabled={cameraActive}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      aria-label="Generate new session id"
                    >
                      <SyncIcon size={14} />
                    </button>
                  </div>
                </label>

                <label className="text-sm font-medium">
                  Laptop Host / IP
                  <input
                    value={mobileHost}
                    onChange={(event) => setMobileHost(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    disabled={cameraActive}
                  />
                </label>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 break-all">
                {mobileCaptureUrl}
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                {qrCodeDataUrl ? (
                  <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
                    <img
                      src={qrCodeDataUrl}
                      alt="QR code for mobile pairing"
                      className="h-24 w-24 rounded-md border border-slate-200"
                    />
                    <p className="text-sm text-slate-600">
                      Scan QR on phone to open relay page instantly.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500">
                    Generating pairing QR...
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={copyMobileUrl}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100"
                  >
                    {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
                    {copied ? 'Copied' : 'Copy Link'}
                  </button>
                  <a
                    href={mobileCaptureUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100"
                  >
                    <LinkExternalIcon size={16} />
                    Open
                  </a>
                </div>
              </div>

              <p className="text-xs text-slate-500">
                Accessibility note: mobile relay keeps your phone as a camera while processing and voice guidance stays on laptop.
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            {!cameraActive ? (
              <button
                onClick={() => {
                  void startSelectedSource();
                }}
                disabled={isLoading || !modelsLoaded}
                className="btn-primary inline-flex min-h-12 items-center gap-2"
                aria-label={sourceMode === 'local' ? 'Start local camera' : 'Start mobile relay'}
              >
                {isLoading ? <SyncIcon size={16} className="animate-spin" /> : <DeviceCameraVideoIcon size={16} />}
                {isLoading ? 'Starting...' : sourceMode === 'local' ? 'Start Local Camera' : 'Start Mobile Relay'}
              </button>
            ) : (
              <>
                <button
                  onClick={stopCamera}
                  className="inline-flex min-h-12 items-center gap-2 rounded-full bg-rose-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-rose-600"
                >
                  <StopIcon size={16} />
                  Turn Off Camera
                </button>
                <button
                  onClick={revokeCameraAccess}
                  className="inline-flex min-h-12 items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  <ShieldLockIcon size={16} />
                  Revoke Guidance
                </button>
              </>
            )}
          </div>
        </section>

        <section className="glass-card p-3 md:p-4">
          <div className="camera-container relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full rounded-xl bg-slate-900"
              aria-label="Camera feed"
            />
            <canvas ref={canvasRef} className="absolute left-0 top-0 h-full w-full" aria-hidden="true" />

            {isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-slate-950/65 text-white">
                <SyncIcon size={24} className="mb-2 animate-spin" />
                <p className="text-base font-medium">Initializing detection...</p>
              </div>
            )}
          </div>
        </section>

        <section className="glass-card p-4">
          <h3 className="text-base font-semibold">Detection Status</h3>
          <p className="mt-2 text-base text-slate-700" aria-live="assertive">
            {detectionStatus}
          </p>

          {objectInfo && (
            <p className="mt-3 rounded-lg bg-cyan-50 px-3 py-2 text-base text-cyan-900" aria-live="polite">
              {objectInfo}
            </p>
          )}

          {backendError && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800" aria-live="assertive">
              Accurate mode warning: {backendError}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600">
            <span>Permission: {permissionState}</span>
            <span>Engine: {settings.detectionEngine === 'accurate-yolo' ? 'Accurate YOLO ONNX' : 'Fast Browser Detector'}</span>
            <span>Confidence floor: {Math.round(objectScoreFloor * 100)}%</span>
            {backendLatencyMs !== null && settings.detectionEngine === 'accurate-yolo' && (
              <span>Backend latency: {backendLatencyMs} ms</span>
            )}
            {sourceMode === 'mobile' && <span>Last mobile frame: {mobileFrameTime || 'waiting'}</span>}
          </div>
        </section>

        <section className="glass-card p-4">
          <h3 className="text-base font-semibold">Minimal Accessibility Notes</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>Primary actions are large, high-contrast, and always in the same position.</li>
            <li>Status text uses plain language and live announcements for screen-reader feedback.</li>
            <li>Fast mode prioritizes low latency; Accurate mode prioritizes object quality.</li>
          </ul>
        </section>
      </div>
    </Layout>
  );
};

export default CameraView;
