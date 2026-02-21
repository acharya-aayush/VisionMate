
import React from 'react';
import Layout from '../components/Layout';
import { useToast } from "@/hooks/use-toast";
import { useVisionSettings } from '@/hooks/useVisionSettings';

const Settings: React.FC = () => {
  const { toast } = useToast();
  const { settings, updateSettings, resetSettings } = useVisionSettings();

  const {
    fontSize,
    highContrast,
    speakDetections,
    useReadAloud,
    cameraFacing,
    detectionMode,
    speechRate,
    confidenceFloor,
  } = settings;
  
  const handleFontSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(e.target.value);
    updateSettings({ fontSize: newSize });
  };
  
  const handleHighContrastChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateSettings({ highContrast: e.target.checked });
  };
  
  const handleSpeakDetectionsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateSettings({ speakDetections: e.target.checked });
  };
  
  const handleUseReadAloudChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isChecked = e.target.checked;
    updateSettings({ useReadAloud: isChecked });
    
    // Demonstrate reading aloud
    if (isChecked && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance("Read aloud is now enabled");
      window.speechSynthesis.speak(utterance);
    }
  };
  
  const handleCameraFacingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value === 'user' ? 'user' : 'environment';
    updateSettings({ cameraFacing: value });
  };

  const handleDetectionModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const mode = e.target.value === 'social' || e.target.value === 'quiet' ? e.target.value : 'navigation';
    updateSettings({ detectionMode: mode });
  };

  const handleSpeechRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateSettings({ speechRate: parseFloat(e.target.value) });
  };

  const handleConfidenceFloorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateSettings({ confidenceFloor: parseInt(e.target.value) });
  };
  
  // Demonstrate read aloud feature
  const readPageAloud = () => {
    if (!useReadAloud) {
      toast({
        title: "Read Aloud Disabled",
        description: "Enable read aloud in settings to use this action.",
      });
      return;
    }

    if ('speechSynthesis' in window) {
      // Get all text content from the page
      const mainContent = document.getElementById('main-content');
      if (mainContent) {
        const textToRead = mainContent.innerText;
        const utterance = new SpeechSynthesisUtterance(textToRead);
        utterance.rate = speechRate;
        window.speechSynthesis.speak(utterance);
        
        toast({
          title: "Reading Aloud",
          description: "Reading page content...",
        });
      }
    } else {
      toast({
        title: "Not Supported",
        description: "Your browser doesn't support text-to-speech",
        variant: "destructive",
      });
    }
  };
  
  const handleResetSettings = () => {
    resetSettings();

    toast({
      title: "Settings Reset",
      description: "All settings have been reset to default values",
    });
  };
  
  return (
    <Layout title="Settings">
      <div className="space-y-6">
        <section className="glass-card p-6 animate-fade-in">
          <h2 className="text-xl font-semibold mb-4">Accessibility Options</h2>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="font-size" className="block mb-2 font-medium">
                Text Size: {fontSize}px
              </label>
              <input
                id="font-size"
                type="range"
                min="12"
                max="24"
                step="2"
                value={fontSize}
                onChange={handleFontSizeChange}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                aria-valuemin={12}
                aria-valuemax={24}
                aria-valuenow={fontSize}
              />
            </div>
            
            <div className="flex items-center">
              <input
                id="high-contrast"
                type="checkbox"
                checked={highContrast}
                onChange={handleHighContrastChange}
                className="w-4 h-4 text-babyBlue border-gray-300 rounded focus:ring-babyBlue"
              />
              <label htmlFor="high-contrast" className="ml-2 font-medium">
                High Contrast Mode
              </label>
            </div>
            
            <div className="flex items-center">
              <input
                id="speak-detections"
                type="checkbox"
                checked={speakDetections}
                onChange={handleSpeakDetectionsChange}
                className="w-4 h-4 text-babyBlue border-gray-300 rounded focus:ring-babyBlue"
              />
              <label htmlFor="speak-detections" className="ml-2 font-medium">
                Speak Object Detections
              </label>
            </div>
            
            <div className="flex items-center">
              <input
                id="use-read-aloud"
                type="checkbox"
                checked={useReadAloud}
                onChange={handleUseReadAloudChange}
                className="w-4 h-4 text-babyBlue border-gray-300 rounded focus:ring-babyBlue"
              />
              <label htmlFor="use-read-aloud" className="ml-2 font-medium">
                Enable Read Aloud
              </label>
            </div>
            
            <button
              onClick={readPageAloud}
              className="mt-2 px-4 py-2 bg-babyBlue hover:bg-babyBlue/80 text-white rounded-lg transition-colors w-full"
              aria-label="Read this page aloud"
            >
              <div className="flex items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                </svg>
                <span>Read This Page Aloud</span>
              </div>
            </button>
          </div>
        </section>
        
        <section className="glass-card p-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <h2 className="text-xl font-semibold mb-4">Camera Settings</h2>
          
          <div>
            <label htmlFor="camera-facing" className="block mb-2 font-medium">
              Camera Facing
            </label>
            <select
              id="camera-facing"
              value={cameraFacing}
              onChange={handleCameraFacingChange}
              className="bg-white border border-gray-300 text-gray-900 rounded-lg focus:ring-babyBlue focus:border-babyBlue block w-full p-2.5"
              aria-label="Select camera facing direction"
            >
              <option value="environment">Rear Camera (Default)</option>
              <option value="user">Front Camera</option>
            </select>
            <p className="mt-2 text-sm text-muted-foreground">
              Changes will take effect next time you open the camera.
            </p>
          </div>
        </section>

        <section className="glass-card p-6 animate-fade-in" style={{ animationDelay: '0.15s' }}>
          <h2 className="text-xl font-semibold mb-4">Detection Profile</h2>

          <div className="space-y-4">
            <div>
              <label htmlFor="detection-mode" className="block mb-2 font-medium">
                Detection Mode
              </label>
              <select
                id="detection-mode"
                value={detectionMode}
                onChange={handleDetectionModeChange}
                className="bg-white border border-gray-300 text-gray-900 rounded-lg focus:ring-babyBlue focus:border-babyBlue block w-full p-2.5"
              >
                <option value="navigation">Navigation Assist</option>
                <option value="social">Social Awareness</option>
                <option value="quiet">Quiet Guidance</option>
              </select>
            </div>

            <div>
              <label htmlFor="speech-rate" className="block mb-2 font-medium">
                Speech Rate: {speechRate.toFixed(1)}x
              </label>
              <input
                id="speech-rate"
                type="range"
                min="0.7"
                max="1.4"
                step="0.1"
                value={speechRate}
                onChange={handleSpeechRateChange}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div>
              <label htmlFor="confidence-floor" className="block mb-2 font-medium">
                Recognition Confidence Floor: {confidenceFloor}%
              </label>
              <input
                id="confidence-floor"
                type="range"
                min="35"
                max="90"
                step="1"
                value={confidenceFloor}
                onChange={handleConfidenceFloorChange}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <p className="mt-2 text-sm text-muted-foreground">
                Lower values announce more uncertain detections.
              </p>
            </div>
          </div>
        </section>
        
        <section className="glass-card p-6 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <h2 className="text-xl font-semibold mb-4">About Vision Mate</h2>
          
          <div className="space-y-2 text-muted-foreground">
            <p>Version: 1.0.0 Beta</p>
            <p>Our Voice Becomes Your Vision</p>
            <p>© 2025 Vision Mate</p>
          </div>
        </section>
        
        <div className="flex justify-center pt-4 pb-16 animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <button
            onClick={handleResetSettings}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-full transition-colors"
            aria-label="Reset all settings to default values"
          >
            Reset All Settings
          </button>
        </div>
      </div>
    </Layout>
  );
};

export default Settings;
