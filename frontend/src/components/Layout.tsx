
import React, { useState } from 'react';
import Navigation from './Navigation';
import { useToast } from "@/hooks/use-toast";
import { Copyright, X, Users } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
}

const Layout: React.FC<LayoutProps> = ({ children, title }) => {
  const [showAbout, setShowAbout] = useState(false);

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className="app-container">
        <header className="flex items-center justify-between p-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <span className="font-bold text-xl" role="heading" aria-level={1}>
              Vision Mate
            </span>
            <span className="bg-babyBlue text-white text-xs px-2 py-0.5 rounded-full">
              Beta
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              aria-label="About developers" 
              onClick={() => setShowAbout(true)}
              className="p-2 rounded-full hover:bg-muted transition-colors"
            >
              <Users size={20} />
            </button>
            <button 
              aria-label="Toggle accessibility mode" 
              onClick={() => {
                document.body.classList.toggle('high-contrast-mode');
                const isHighContrast = document.body.classList.contains('high-contrast-mode');
                localStorage.setItem('highContrast', isHighContrast ? 'true' : 'false');
              }}
              className="p-2 rounded-full hover:bg-muted transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-accessibility">
                <circle cx="16" cy="4" r="1"/><path d="m18 19 1-7"/><path d="m5 8 3-3 5 1"/><path d="M19.8 12.8a6 6 0 0 0-7.6-7.6"/>
                <path d="M22 22a3.9 3.9 0 0 0-4-4"/><path d="M14 22a3.9 3.9 0 0 1-4-4"/><path d="M10 6a3.9 3.9 0 0 0-4 4"/>
                <path d="M2 2a3.9 3.9 0 0 1 4 4"/><path d="m5 19 1.6-5"/><path d="m13 9-4 3-1 7"/>
              </svg>
            </button>
          </div>
        </header>
        
        <main id="main-content" className="page-container page-transition">
          {title && (
            <h1 className="text-2xl font-bold mb-6">{title}</h1>
          )}
          {children}
        </main>
        
        <footer className="text-center p-4 text-xs text-muted-foreground border-t border-border/40 mt-auto">
          <div className="flex items-center justify-center gap-1">
            <Copyright size={14} />
            <span>2025 Vision Mate. All rights reserved.</span>
          </div>
        </footer>
        
        <Navigation />

        {/* About developers modal */}
        {showAbout && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-in fade-in">
            <div className="bg-card p-6 rounded-lg max-w-md w-full mx-4 shadow-lg">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Developers</h2>
                <button 
                  onClick={() => setShowAbout(false)}
                  className="p-1 rounded-full hover:bg-muted transition-colors"
                  aria-label="Close about dialog"
                >
                  <X size={20} />
                </button>
              </div>
              <ul className="space-y-2">
                <li className="p-2 bg-muted/50 rounded">Aayush Acharya</li>
                <li className="p-2 bg-muted/50 rounded">Aaryan Bista</li>
                <li className="p-2 bg-muted/50 rounded">Binish Shrestha</li>
                <li className="p-2 bg-muted/50 rounded">Devesh Phaiju</li>
              </ul>
              <p className="mt-4 text-sm text-muted-foreground">
                Vision Mate is a project designed to assist visually impaired individuals by providing real-time object and hand detection.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Layout;
