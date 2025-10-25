import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { VNProject } from './types/project';
import LivePreview from './components/LivePreview';
import { ProjectProvider } from './contexts/ProjectContext';
// @ts-ignore - Importing logo as base64
import flourishLogo from '../docs/Flourish.png';

interface StandalonePlayerProps {
    project: VNProject;
}

/**
 * Standalone Player Component
 * This is a minimal wrapper around LivePreview that can be used
 * for standalone game distribution without the editor interface.
 */
const StandalonePlayer: React.FC<StandalonePlayerProps> = ({ project }) => {
    const [isReady, setIsReady] = useState(false);
    const [showSplash, setShowSplash] = useState(true);
    const [splashFadingOut, setSplashFadingOut] = useState(false);

    useEffect(() => {
        // Perform any necessary initialization
        console.log('[Standalone Player] Loaded project:', project.title);
        setIsReady(true);
    }, [project]);

    const handleSplashClick = () => {
        setSplashFadingOut(true);
        // Wait for fade out animation to complete
        setTimeout(() => {
            setShowSplash(false);
        }, 800);
    };

    if (!isReady) {
        return (
            <div style={{
                width: '100vw',
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#1a1a2e',
                color: '#fff'
            }}>
                <div>Initializing game...</div>
            </div>
        );
    }

    if (showSplash) {
        return (
            <div
                onClick={handleSplashClick}
                style={{
                    width: '100vw',
                    height: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#000',
                    cursor: 'pointer',
                    opacity: splashFadingOut ? 0 : 1,
                    transition: 'opacity 0.8s ease-in-out'
                }}
            >
                <div style={{
                    textAlign: 'center',
                    animation: splashFadingOut ? 'none' : 'fadeIn 1s ease-in',
                }}>
                    <p style={{
                        color: '#fff',
                        fontSize: '1.5rem',
                        fontFamily: 'sans-serif',
                        marginBottom: '2rem',
                        letterSpacing: '0.2em',
                        fontWeight: '300'
                    }}>
                        MADE USING
                    </p>
                    <img 
                        src={flourishLogo} 
                        alt="Flourish" 
                        style={{
                            maxWidth: '400px',
                            width: '80vw',
                            height: 'auto'
                        }}
                    />
                    <p style={{
                        color: '#888',
                        fontSize: '0.9rem',
                        fontFamily: 'sans-serif',
                        marginTop: '3rem',
                        fontStyle: 'italic'
                    }}>
                        Click to continue
                    </p>
                </div>
                <style>{`
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                `}</style>
            </div>
        );
    }

    return (
        <div style={{
            width: '100vw',
            height: '100vh',
            background: '#000',
            overflow: 'hidden'
        }}>
            <ProjectProvider initialProject={project}>
                <LivePreview onClose={() => {}} hideCloseButton={true} autoStartMusic={true} />
            </ProjectProvider>
        </div>
    );
};

/**
 * Game Engine Initializer
 * This is the entry point for the standalone player.
 * It's exposed globally for the HTML template to call.
 */
export const GameEngine = {
    /**
     * Mount the game to a DOM element
     * @param container - The DOM element to mount to
     * @param projectData - The VNProject data
     */
    mount: (container: HTMLElement, projectData: VNProject) => {
        if (!container) {
            throw new Error('Container element not found');
        }

        if (!projectData) {
            throw new Error('Project data is required');
        }

        // Create React root and render
        const root = ReactDOM.createRoot(container);
        root.render(
            <React.StrictMode>
                <StandalonePlayer project={projectData} />
            </React.StrictMode>
        );
    },

    /**
     * Get version information
     */
    version: '1.0.0',

    /**
     * Check if the engine is ready
     */
    isReady: () => {
        return typeof React !== 'undefined' && typeof ReactDOM !== 'undefined';
    }
};

// Expose GameEngine globally for the HTML template
if (typeof window !== 'undefined') {
    (window as any).GameEngine = GameEngine;
}

export default StandalonePlayer;
