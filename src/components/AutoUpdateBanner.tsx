import React, { useState, useEffect, useCallback } from 'react';

/**
 * Update status events forwarded from the Electron main process via IPC.
 */
type UpdateStatus =
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error';

interface UpdateEvent {
    status: UpdateStatus;
    version?: string;
    releaseDate?: string;
    percent?: number;
    transferred?: number;
    total?: number;
    message?: string;
}

/**
 * A subtle, non-intrusive banner that appears at the top of the app when an
 * auto-update has been downloaded and is ready to install.  On click it tells
 * the main process to quit-and-install.
 *
 * The banner is completely invisible until an update finishes downloading, so
 * it never interrupts normal workflow.
 */
const AutoUpdateBanner: React.FC = () => {
    const [status, setStatus] = useState<UpdateStatus | null>(null);
    const [newVersion, setNewVersion] = useState('');
    const [downloadPercent, setDownloadPercent] = useState(0);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        const api = (window as any).electronAPI;
        if (!api?.onUpdateStatus) return;

        api.onUpdateStatus((event: UpdateEvent) => {
            setStatus(event.status);

            if (event.version) setNewVersion(event.version);
            if (typeof event.percent === 'number') setDownloadPercent(event.percent);

            // Reset dismissed when a new download completes
            if (event.status === 'downloaded') setDismissed(false);
        });
    }, []);

    const handleInstall = useCallback(() => {
        const api = (window as any).electronAPI;
        if (api?.installUpdate) {
            api.installUpdate();
        }
    }, []);

    // ── Nothing to show ──
    if (dismissed) return null;
    if (!status || status === 'checking' || status === 'not-available') return null;

    // Error state — show briefly then allow dismissal
    if (status === 'error') {
        return null; // Silently ignore update errors to avoid confusing users
    }

    // Downloading state — show slim progress bar
    if (status === 'downloading' || status === 'available') {
        return (
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '3px',
                    zIndex: 99999,
                    background: 'rgba(255,255,255,0.08)',
                    pointerEvents: 'none',
                }}
            >
                <div
                    style={{
                        width: `${status === 'available' ? 5 : downloadPercent}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #ff00a5, #8a2be2, #00f2ea)',
                        borderRadius: '0 2px 2px 0',
                        transition: 'width 0.4s ease',
                    }}
                />
            </div>
        );
    }

    // Downloaded — show restart banner
    if (status === 'downloaded') {
        return (
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: 99999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    padding: '8px 16px',
                    background: 'linear-gradient(135deg, rgba(138,43,226,0.95), rgba(255,0,165,0.90))',
                    backdropFilter: 'blur(8px)',
                    color: '#fff',
                    fontSize: '13px',
                    fontFamily: "'Segoe UI', system-ui, sans-serif",
                    boxShadow: '0 2px 12px rgba(138,43,226,0.4)',
                    animation: 'update-banner-in 0.35s ease-out',
                }}
            >
                <style>{`
                    @keyframes update-banner-in {
                        from { transform: translateY(-100%); opacity: 0; }
                        to   { transform: translateY(0);     opacity: 1; }
                    }
                `}</style>

                <span style={{ fontWeight: 500 }}>
                    ✨ Flourish {newVersion ? `v${newVersion}` : 'update'} is ready
                </span>

                <button
                    onClick={handleInstall}
                    style={{
                        background: 'rgba(255,255,255,0.2)',
                        border: '1px solid rgba(255,255,255,0.35)',
                        borderRadius: '6px',
                        padding: '4px 14px',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => {
                        (e.target as HTMLButtonElement).style.background = 'rgba(255,255,255,0.35)';
                    }}
                    onMouseLeave={(e) => {
                        (e.target as HTMLButtonElement).style.background = 'rgba(255,255,255,0.2)';
                    }}
                >
                    Restart &amp; Update
                </button>

                <button
                    onClick={() => setDismissed(true)}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'rgba(255,255,255,0.6)',
                        fontSize: '16px',
                        cursor: 'pointer',
                        padding: '0 4px',
                        lineHeight: 1,
                    }}
                    title="Dismiss — update will apply next time you close the app"
                    aria-label="Dismiss update notification"
                >
                    ✕
                </button>
            </div>
        );
    }

    return null;
};

export default AutoUpdateBanner;
