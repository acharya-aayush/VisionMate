import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceCameraVideoIcon, StopIcon, SyncIcon } from '@primer/octicons-react';

const getSearchParam = (key: string): string => {
  const params = new URLSearchParams(window.location.search);
  return params.get(key) || '';
};

const MobileCameraRelay: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const [sessionId, setSessionId] = useState(getSearchParam('session') || 'visionmate');
  const [apiBase, setApiBase] = useState(
    getSearchParam('api') || `${window.location.protocol}//${window.location.hostname}:8000`
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [lastSentAt, setLastSentAt] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const stopStream = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsStreaming(false);
  }, []);

  const sendFrame = useCallback(async () => {
    if (!videoRef.current || !isStreaming) return;

    const video = videoRef.current;
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      timerRef.current = window.setTimeout(() => {
        void sendFrame();
      }, 150);
      return;
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL('image/jpeg', 0.68);

    try {
      await fetch(`${apiBase.replace(/\/+$/, '')}/mobile-stream/${encodeURIComponent(sessionId)}/frame`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image }),
      });

      setLastSentAt(new Date().toLocaleTimeString());
      setErrorMessage('');
    } catch (error) {
      console.error('Frame push failed:', error);
      setErrorMessage('Could not send frame. Check API URL and same-network access.');
    }

    timerRef.current = window.setTimeout(() => {
      void sendFrame();
    }, 130);
  }, [apiBase, isStreaming, sessionId]);

  const startStream = useCallback(async () => {
    if (!videoRef.current) return;

    setIsStarting(true);
    setErrorMessage('');

    try {
      stopStream();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      setIsStreaming(true);
    } catch (error) {
      console.error('Mobile camera start failed:', error);
      setErrorMessage('Camera access failed. Allow permissions and retry.');
      setIsStreaming(false);
    } finally {
      setIsStarting(false);
    }
  }, [stopStream]);

  useEffect(() => {
    if (isStreaming) {
      void sendFrame();
    }

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isStreaming, sendFrame]);

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 pb-8">
      <div className="mx-auto max-w-lg space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">VisionMate Mobile Camera</h1>
          <p className="text-sm text-slate-300">
            Stream your phone camera to laptop processing. Keep this page open while using Object Detection on laptop.
          </p>
        </header>

        <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 space-y-3">
          <label className="block text-sm">
            Session ID
            <input
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20))}
            />
          </label>

          <label className="block text-sm">
            API Base URL
            <input
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
              value={apiBase}
              onChange={(event) => setApiBase(event.target.value)}
            />
          </label>

          <div className="flex gap-2">
            {!isStreaming ? (
              <button
                onClick={() => {
                  void startStream();
                }}
                disabled={isStarting}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
              >
                {isStarting ? <SyncIcon size={16} className="animate-spin" /> : <DeviceCameraVideoIcon size={16} />}
                {isStarting ? 'Starting...' : 'Start Streaming'}
              </button>
            ) : (
              <button
                onClick={stopStream}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400"
              >
                <StopIcon size={16} />
                Stop Streaming
              </button>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-700 bg-black">
          <video ref={videoRef} autoPlay playsInline muted className="w-full" />
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300 space-y-1">
          <p>Status: {isStreaming ? 'Streaming frames' : 'Idle'}</p>
          <p>Last frame sent: {lastSentAt || 'none yet'}</p>
          {errorMessage && <p className="text-rose-300">{errorMessage}</p>}
        </div>
      </div>
    </div>
  );
};

export default MobileCameraRelay;
