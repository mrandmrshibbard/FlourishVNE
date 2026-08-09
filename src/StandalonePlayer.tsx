import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { VNProject } from './types/project';
import LivePreview from './components/LivePreview';
import ErrorBoundary from './components/ErrorBoundary';
import { ProjectProvider } from './contexts/ProjectContext';
import { ToastProvider } from './contexts/ToastContext';
// @ts-ignore - Importing logo as base64
import flourishLogo from '../public/Flourish.png';

interface StandalonePlayerProps {
    project: VNProject;
}

/**
 * What a PLAYER sees if the engine hits an unrecoverable error. Deliberately plain: someone
 * playing a visual novel can't act on a stack trace, and the editor's developer fallback
 * (with "Copy Error Report") would only alarm them. Reloading re-mounts the whole engine from
 * the title screen; their saved games are stored outside React and survive untouched.
 */
const PlayerCrashScreen: React.FC = () => (
    <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 18,
        background: '#000', color: '#fff', textAlign: 'center', padding: 24,
        fontFamily: 'system-ui, sans-serif',
    }}>
        <div style={{ fontSize: 40 }}>😵‍💫</div>
        <div style={{ fontSize: 20, fontWeight: 600 }}>Something went wrong</div>
        <p style={{ maxWidth: 460, opacity: 0.75, lineHeight: 1.5, margin: 0 }}>
            The game ran into a problem and had to stop. Your saved games are safe — reloading
            will take you back to the title screen, and you can carry on from your last save.
        </p>
        <button
            onClick={() => window.location.reload()}
            style={{
                padding: '10px 22px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.25)',
                background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 15, cursor: 'pointer',
            }}
        >
            Reload the game
        </button>
    </div>
);

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

        // Prevent default context menu (right-click menu)
        const preventContextMenu = (e: MouseEvent) => {
            e.preventDefault();
        };
        document.addEventListener('contextmenu', preventContextMenu);

        return () => {
            document.removeEventListener('contextmenu', preventContextMenu);
        };
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
            <style>{`
                body {
                    user-select: none;
                    -webkit-user-select: none;
                    -moz-user-select: none;
                    -ms-user-select: none;
                }
                input, textarea, [contenteditable="true"] {
                    user-select: text;
                    -webkit-user-select: text;
                    -moz-user-select: text;
                    -ms-user-select: text;
                }
            `}</style>
            <ToastProvider>
                <ProjectProvider initialProject={project}>
                    {/* A built game has no editor around it: without this, any uncaught engine error
                        leaves the player staring at a black screen with no way out. The fallback is
                        written for PLAYERS — no stack traces, no "copy error report" — and reassures
                        them their saves are untouched, because they are (saves live in storage, not
                        in the crashed React tree). */}
                    <ErrorBoundary fallback={<PlayerCrashScreen />}>
                        <LivePreview onClose={() => {}} hideCloseButton={true} autoStartMusic={true} isStandalone={true} />
                    </ErrorBoundary>
                </ProjectProvider>
            </ToastProvider>
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
    version: __APP_VERSION__,

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
