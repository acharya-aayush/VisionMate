
import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useToast } from "@/hooks/use-toast";

const Home: React.FC = () => {
  const { toast } = useToast();

  useEffect(() => {
    // Check for stored accessibility preferences
    const highContrast = localStorage.getItem('highContrast') === 'true';
    if (highContrast) {
      document.body.classList.add('high-contrast-mode');
    }

    // Welcome message
    toast({
      title: "Welcome to Vision Mate",
      description: "Our voice becomes your vision",
      duration: 3000,
    });
  }, [toast]);

  return (
    <Layout title="Welcome to Vision Mate">
      <div className="space-y-6">
        <section className="glass-card p-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <h2 className="text-xl font-semibold mb-3">Our Voice Becomes Your Vision</h2>
          <p className="text-muted-foreground mb-4">
            Vision Mate uses cutting-edge computer vision technology to help you navigate and understand the world around you.
          </p>
          <Link to="/camera" className="btn-primary inline-flex items-center">
            Start Camera
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-2">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </Link>
        </section>

        <section className="space-y-4 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <h2 className="text-xl font-semibold">Key Features</h2>

          <div className="glass-card p-4 flex items-start space-x-4">
            <div className="bg-babyBlue/10 p-2 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-babyBlue">
                <path d="M6.5 6.5 17.5 17.5" />
                <path d="M2 12h3" />
                <path d="M19 12h3" />
                <path d="m12 2-2.5 2.5" />
                <path d="m12 2 2.5 2.5" />
                <path d="M12 22v-3" />
                <path d="m19.5 4.5-4 4" />
                <path d="m4.5 19.5 4-4" />
                <path d="m12 9 4 4" />
                <path d="m12 9-4 4" />
              </svg>
            </div>
            <div>
              <h3 className="font-medium">Hand Tracking</h3>
              <p className="text-sm text-muted-foreground">Detect hand movements and gestures in real-time.</p>
            </div>
          </div>

          <div className="glass-card p-4 flex items-start space-x-4">
            <div className="bg-babyBlue/10 p-2 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-babyBlue">
                <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
              </svg>
            </div>
            <div>
              <h3 className="font-medium">Object Detection</h3>
              <p className="text-sm text-muted-foreground">Identify objects in your environment with voice feedback.</p>
            </div>
          </div>

          <div className="glass-card p-4 flex items-start space-x-4">
            <div className="bg-babyBlue/10 p-2 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-babyBlue">
                <path d="M16 16h.01" />
                <path d="M8 16h.01" />
                <path d="M12 20c-3.3 0-6-2.7-6-6v-8a6 6 0 0 1 12 0v8c0 3.3-2.7 6-6 6z" />
                <path d="M12 20v4" />
              </svg>
            </div>
            <div>
              <h3 className="font-medium">Voice Guidance</h3>
              <p className="text-sm text-muted-foreground">Clear audio descriptions of your surroundings.</p>
            </div>
          </div>

          <div className="glass-card p-4 flex items-start space-x-4">
            <div className="bg-babyBlue/10 p-2 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-babyBlue">
                <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <path d="M9 9h.01" />
                <path d="M15 9h.01" />
              </svg>
            </div>
            <div>
              <h3 className="font-medium">Face Recognition</h3>
              <p className="text-sm text-muted-foreground">Identify familiar faces and announce who's nearby.</p>
            </div>
          </div>
        </section>

        <section className="glass-card p-6 animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <h2 className="text-xl font-semibold mb-3">Getting Started</h2>
          <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
            <li>Tap the <strong>Camera</strong> button in the navigation bar</li>
            <li>Allow camera access when prompted</li>
            <li>Hold your hand in view to experience hand tracking</li>
            <li>Point your camera at objects for detection</li>
          </ol>
        </section>
      </div>
    </Layout>
  );
};

export default Home;
