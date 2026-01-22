import React, { useEffect, useRef, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import { useToast } from "@/hooks/use-toast";
import { Loader2, Camera, UserPlus, Users, Volume2, RefreshCw } from 'lucide-react';
import {
    checkAPIHealth,
    listUsers,
    recognizeFaceBase64,
    registerFaceBase64,
    RecognizedFace,
    faceRecognitionSocket,
} from '../services/faceRecognitionService';

const FaceRecognition: React.FC = () => {
    const { toast } = useToast();
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);

    // State
    const [cameraActive, setCameraActive] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [apiConnected, setApiConnected] = useState(false);
    const [recognizedFaces, setRecognizedFaces] = useState<RecognizedFace[]>([]);
    const [registeredUsers, setRegisteredUsers] = useState<Record<string, string>>({});
    const [isRegistering, setIsRegistering] = useState(false);
    const [newUserName, setNewUserName] = useState('');
    const [lastAnnounced, setLastAnnounced] = useState<string>('');
    const [showRegistration, setShowRegistration] = useState(false);

    // Camera selection state
    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

    // Speak function using Web Speech API
    const speak = useCallback((text: string) => {
        if (!('speechSynthesis' in window)) return;

        // Don't repeat the same announcement within 5 seconds
        if (text === lastAnnounced) return;

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);

        // Try to find a pleasant voice
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(voice =>
            voice.name.includes('Google UK English Female') ||
            voice.name.includes('Microsoft Zira') ||
            voice.lang.startsWith('en')
        );

        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }

        utterance.pitch = 1.1;
        utterance.rate = 1.0;

        window.speechSynthesis.speak(utterance);
        setLastAnnounced(text);

        // Clear announcement after 5 seconds
        setTimeout(() => setLastAnnounced(''), 5000);
    }, [lastAnnounced]);

    // Check API health on mount
    useEffect(() => {
        const checkAPI = async () => {
            const healthy = await checkAPIHealth();
            setApiConnected(healthy);

            if (healthy) {
                // Fetch registered users
                try {
                    const usersData = await listUsers();
                    setRegisteredUsers(usersData.users);
                } catch (error) {
                    console.error('Failed to fetch users:', error);
                }
            }
        };

        checkAPI();


        if ('speechSynthesis' in window) {
            window.speechSynthesis.getVoices();
        }

        // Enumerate video devices
        const getDevices = async () => {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoInputs = devices.filter(device => device.kind === 'videoinput');
                setVideoDevices(videoInputs);

                // Select back camera by default if available (likely "environment" facing)
                // or just the first one if not specified
                if (videoInputs.length > 0) {
                    // Try to find back camera
                    const backCamera = videoInputs.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
                    if (backCamera) {
                        setSelectedDeviceId(backCamera.deviceId);
                    } else {
                        setSelectedDeviceId(videoInputs[0].deviceId);
                    }
                }
            } catch (error) {
                console.error('Error fetching devices:', error);
            }
        };

        getDevices();

        // Cleanup on unmount
        return () => {
            if (videoRef.current && videoRef.current.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    // Handle face recognition results
    useEffect(() => {
        if (recognizedFaces.length > 0) {
            const knownFaces = recognizedFaces.filter(f => f.is_known);
            if (knownFaces.length > 0) {
                const names = knownFaces.map(f => f.user_name).join(' and ');
                speak(`I see ${names}`);
            }
        }
    }, [recognizedFaces, speak]);

    // Start camera
    const startCamera = async () => {
        if (!apiConnected) {
            toast({
                title: "API Not Connected",
                description: "Please ensure the Python backend is running on port 8000",
                variant: "destructive",
            });
            return;
        }

        try {
            setIsLoading(true);

            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
                    width: 640,
                    height: 480
                }
            });

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
                setCameraActive(true);

                toast({
                    title: "Camera Active",
                    description: "Face recognition is now running",
                });

                // Start recognition loop
                startRecognitionLoop();
            }

        } catch (error) {
            console.error('Camera error:', error);
            toast({
                title: "Camera Error",
                description: "Could not access camera. Please check permissions.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    // Stop camera
    const stopCamera = () => {
        if (videoRef.current?.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
        setCameraActive(false);
        setRecognizedFaces([]);
    };

    // Capture frame as base64 using off-screen canvas
    const captureFrame = useCallback((): string | null => {
        if (!videoRef.current) return null;

        const video = videoRef.current;

        // Initialize capture canvas if needed
        if (!captureCanvasRef.current) {
            captureCanvasRef.current = document.createElement('canvas');
        }

        const canvas = captureCanvasRef.current;
        const ctx = canvas.getContext('2d');

        if (!ctx) return null;

        // Ensure canvas matches video size
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }

        ctx.drawImage(video, 0, 0);

        return canvas.toDataURL('image/jpeg', 0.8);
    }, []);

    // Recognition loop
    const startRecognitionLoop = useCallback(() => {
        const recognize = async () => {
            if (!cameraActive) return;

            const frame = captureFrame();
            if (frame) {
                try {
                    const result = await recognizeFaceBase64(frame);
                    if (result.success) {
                        setRecognizedFaces(result.faces);
                    }
                } catch (error) {
                    console.error('Recognition error:', error);
                }
            }

            // Continue loop (every 500ms to avoid overwhelming the API)
            if (cameraActive) {
                setTimeout(recognize, 500);
            }
        };

        recognize();
    }, [cameraActive, captureFrame]);

    // Start loop when camera becomes active
    useEffect(() => {
        if (cameraActive) {
            startRecognitionLoop();
        }
    }, [cameraActive, startRecognitionLoop]);

    // Register new face
    const handleRegister = async () => {
        if (!newUserName.trim()) {
            toast({
                title: "Name Required",
                description: "Please enter a name for the new user",
                variant: "destructive",
            });
            return;
        }

        const frame = captureFrame();
        if (!frame) {
            toast({
                title: "Capture Failed",
                description: "Could not capture image. Try again.",
                variant: "destructive",
            });
            return;
        }

        setIsRegistering(true);

        try {
            const result = await registerFaceBase64(newUserName.trim(), frame);

            if (result.success) {
                toast({
                    title: "Registration Successful",
                    description: `${result.user_name} has been registered!`,
                });

                speak(`Successfully registered ${result.user_name}`);

                // Refresh users list
                const usersData = await listUsers();
                setRegisteredUsers(usersData.users);

                setNewUserName('');
                setShowRegistration(false);
            }
        } catch (error: any) {
            toast({
                title: "Registration Failed",
                description: error.message || "Could not register face. Make sure your face is clearly visible.",
                variant: "destructive",
            });
        } finally {
            setIsRegistering(false);
        }
    };

    // Draw overlay on video
    const drawOverlay = useCallback(() => {
        if (!canvasRef.current || !videoRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const video = videoRef.current;

        if (!ctx) return;

        // Update dimensions only if changed to avoid clearing/flickering
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }

        // Clear previous drawings
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw face boxes
        recognizedFaces.forEach(face => {
            if (!face.face_location) return;

            const { top, right, bottom, left } = face.face_location;
            const width = right - left;
            const height = bottom - top;

            // Box color based on recognition
            ctx.strokeStyle = face.is_known ? '#22c55e' : '#ef4444';
            ctx.lineWidth = 3;
            ctx.strokeRect(left, top, width, height);

            // Label background
            const label = face.is_known
                ? `${face.user_name} (${face.confidence.toFixed(0)}%)`
                : 'Unknown';

            ctx.font = '16px Arial';
            const textWidth = ctx.measureText(label).width;

            ctx.fillStyle = face.is_known ? '#22c55e' : '#ef4444';
            ctx.fillRect(left, top - 25, textWidth + 10, 22);

            // Label text
            ctx.fillStyle = 'white';
            ctx.fillText(label, left + 5, top - 8);
        });
    }, [recognizedFaces]);

    // Update overlay when faces change
    useEffect(() => {
        if (cameraActive) {
            drawOverlay();
        }
    }, [cameraActive, recognizedFaces, drawOverlay]);

    return (
        <Layout title="Face Recognition">
            <div className="space-y-6">
                {/* API Status Banner */}
                {!apiConnected && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg animate-fade-in">
                        <p className="font-medium">⚠️ Backend Not Connected</p>
                        <p className="text-sm mt-1">
                            Start the Python API server:
                            <code className="ml-2 bg-red-200 px-2 py-1 rounded text-xs">
                                cd Facial_recognition && uvicorn face_recognition_api:app --reload
                            </code>
                        </p>
                    </div>
                )}

                {/* Camera View */}
                <div className="glass-card p-4 animate-fade-in">
                    <div className="camera-container relative">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-auto rounded-lg bg-gray-900"
                            style={{ minHeight: '300px' }}
                            aria-label="Camera feed for face recognition"
                        />
                        <canvas
                            ref={canvasRef}
                            className="absolute top-0 left-0 w-full h-full pointer-events-none"
                            aria-hidden="true"
                        />

                        {isLoading && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded-lg">
                                <Loader2 className="h-10 w-10 animate-spin text-white mb-4" />
                                <p className="text-white text-xl">Initializing camera...</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Camera Selection Dropdown */}
                {!cameraActive && videoDevices.length > 1 && (
                    <div className="w-full max-w-xs mx-auto mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Select Camera</label>
                        <select
                            value={selectedDeviceId}
                            onChange={(e) => setSelectedDeviceId(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-lg bg-white/80 focus:ring-2 focus:ring-babyBlue"
                        >
                            {videoDevices.map((device, idx) => (
                                <option key={device.deviceId} value={device.deviceId}>
                                    {device.label || `Camera ${idx + 1}`}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Controls */}
                <div className="flex flex-wrap gap-4 justify-center animate-fade-in">
                    {!cameraActive ? (
                        <button
                            onClick={startCamera}
                            disabled={!apiConnected || isLoading}
                            className={`btn-primary flex items-center gap-2 ${(!apiConnected || isLoading) ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                            aria-label="Start face recognition"
                        >
                            <Camera className="h-5 w-5" />
                            Start Recognition
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={stopCamera}
                                className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-full flex items-center gap-2 transition-colors"
                                aria-label="Stop camera"
                            >
                                Stop Camera
                            </button>

                            <button
                                onClick={() => setShowRegistration(!showRegistration)}
                                className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-full flex items-center gap-2 transition-colors"
                                aria-label="Add new person"
                            >
                                <UserPlus className="h-5 w-5" />
                                Add Person
                            </button>
                        </>
                    )}
                </div>

                {/* Registration Form */}
                {showRegistration && cameraActive && (
                    <div className="glass-card p-6 animate-fade-in">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <UserPlus className="h-5 w-5" />
                            Register New Person
                        </h2>
                        <p className="text-muted-foreground mb-4">
                            Position your face clearly in the camera, enter your name, and click capture.
                        </p>

                        <div className="flex gap-4">
                            <input
                                type="text"
                                value={newUserName}
                                onChange={(e) => setNewUserName(e.target.value)}
                                placeholder="Enter name..."
                                className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-babyBlue focus:border-transparent"
                                aria-label="Name for new person"
                            />
                            <button
                                onClick={handleRegister}
                                disabled={isRegistering || !newUserName.trim()}
                                className={`bg-babyBlue hover:bg-babyBlue/80 text-white px-6 py-2 rounded-lg flex items-center gap-2 transition-colors ${(isRegistering || !newUserName.trim()) ? 'opacity-50 cursor-not-allowed' : ''
                                    }`}
                            >
                                {isRegistering ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                    <Camera className="h-5 w-5" />
                                )}
                                Capture & Register
                            </button>
                        </div>
                    </div>
                )}

                {/* Detection Status */}
                <div className="glass-card p-4 animate-fade-in">
                    <h2 className="font-semibold mb-2 flex items-center gap-2">
                        <Volume2 className="h-5 w-5" />
                        Recognition Status
                    </h2>

                    {recognizedFaces.length > 0 ? (
                        <div className="space-y-2">
                            {recognizedFaces.map((face, index) => (
                                <div
                                    key={index}
                                    className={`p-3 rounded-lg ${face.is_known ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }`}
                                    aria-live="polite"
                                >
                                    <span className="font-medium">{face.user_name}</span>
                                    {face.is_known && (
                                        <span className="ml-2 text-sm">
                                            ({face.confidence.toFixed(0)}% confidence)
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-muted-foreground">
                            {cameraActive ? 'No faces detected. Position yourself in front of the camera.' : 'Start the camera to begin face recognition.'}
                        </p>
                    )}
                </div>

                {/* Registered Users */}
                <div className="glass-card p-4 animate-fade-in">
                    <h2 className="font-semibold mb-3 flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Registered People ({Object.keys(registeredUsers).length})
                    </h2>

                    {Object.keys(registeredUsers).length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(registeredUsers).map(([id, name]) => (
                                <span
                                    key={id}
                                    className="bg-babyBlue/10 text-babyBlue px-3 py-1 rounded-full text-sm"
                                >
                                    {name}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <p className="text-muted-foreground text-sm">
                            No users registered yet. Add someone using the camera!
                        </p>
                    )}
                </div>

            </div>
        </Layout >
    );
};

export default FaceRecognition;
