import React, { useState, useEffect } from 'react';

interface Release {
  tag_name: string;
  body: string;
  published_at: string;
  html_url?: string;
}

// Convert URLs in plain text to clickable links, and preserve markdown-style links
function renderBodyWithLinks(text: string): React.ReactNode[] {
  // Match URLs (http/https) that aren't already inside markdown link syntax
  const urlRegex = /(https?:\/\/[^\s)\]]+)/g;
  const parts = text.split(urlRegex);
  
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      // Reset lastIndex since we used .test()
      urlRegex.lastIndex = 0;
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent-cyan)] hover:text-[var(--accent-pink)] underline underline-offset-2 break-all transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export const ChangelogModal: React.FC<{
  visible: boolean;
  onClose: () => void;
}> = ({ visible, onClose }) => {
  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [installState, setInstallState] = useState<'idle' | 'downloading' | 'installing' | 'error'>('idle');
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [installError, setInstallError] = useState<string | null>(null);

  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

  useEffect(() => {
    // Get current app version
    if (isElectron && (window as any).electronAPI?.getAppVersion) {
      (window as any).electronAPI.getAppVersion().then((v: string) => setCurrentVersion(v));
    }
  }, [isElectron]);

  // Listen for update-status events so we can show download progress inside
  // the modal after the user clicks "Restart & Update".
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onUpdateStatus) return;

    const handler = (event: { status: string; percent?: number; message?: string }) => {
      if (installState === 'idle') return; // not triggered by us
      if (event.status === 'downloading') {
        setInstallState('downloading');
        if (typeof event.percent === 'number') setDownloadPercent(event.percent);
      } else if (event.status === 'downloaded') {
        setInstallState('installing');
      } else if (event.status === 'error') {
        setInstallState('error');
        setInstallError(event.message || 'Unknown error');
      }
    };

    api.onUpdateStatus(handler);
    // Note: electron IPC .on doesn't return a cleanup; listener persists for
    // the component lifetime which is fine since the modal unmounts on close.
  }, [installState]);

  useEffect(() => {
    if (visible) {
      if (!isElectron) {
        setRelease(null);
        setLoading(false);
        setError('Update notes are available in the desktop (Electron) app.');
        return;
      }

      setLoading(true);
      setError(null);

      const cacheKey = 'githubLatestReleaseBodyCache';
      const cachedRaw = localStorage.getItem(cacheKey);
      if (cachedRaw) {
        try {
          const cached = JSON.parse(cachedRaw) as { release: Release; fetchedAt: number };
          const oneHourMs = 1 * 60 * 60 * 1000;
          if (cached?.release?.tag_name && typeof cached.fetchedAt === 'number' && Date.now() - cached.fetchedAt < oneHourMs) {
            setRelease(cached.release);
            setLoading(false);
            return;
          }
        } catch {
          // Ignore invalid cache
        }
      }

      fetch('https://api.github.com/repos/mrandmrshibbard/FlourishVNE-releases/releases/latest', {
        headers: {
          'Accept': 'application/vnd.github+json'
        }
      })
        .then(response => {
          if (!response.ok) {
            if (response.status === 404) {
              throw new Error('No releases found. Check back later for updates!');
            }
            throw new Error(`Failed to fetch changelog (${response.status})`);
          }
          return response.json();
        })
        .then((data: Release) => {
          setRelease(data);
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ release: data, fetchedAt: Date.now() }));
          } catch {
            // Ignore storage failures
          }
        })
        .catch(err => {
          setError(err.message);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [visible, isElectron]);

  if (!visible) return null;

  const latestVersion = release?.tag_name?.replace('v', '');
  const hasUpdate = currentVersion && latestVersion && latestVersion !== currentVersion;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-lg shadow-xl w-full max-w-2xl p-6 max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-semibold">Latest Changes</h2>
            {currentVersion && (
              <p className="text-xs text-[var(--text-secondary)]">
                Your version: v{currentVersion}
                {hasUpdate && <span className="ml-2 text-[var(--accent-pink)]">→ Update available!</span>}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-2xl"
          >
            ×
          </button>
        </div>

        {loading && <p className="text-center py-8">Loading changelog...</p>}
        {error && <p className="text-red-500 text-center py-8">Error: {error}</p>}
        {release && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-[var(--text-secondary)]">
                Version {release.tag_name} - {new Date(release.published_at).toLocaleDateString()}
              </p>
              {hasUpdate && (
                <span className="px-3 py-1 bg-[var(--accent-pink)]/20 text-[var(--accent-pink)] rounded-full text-xs font-medium">
                  NEW
                </span>
              )}
            </div>
            <div className="text-sm whitespace-pre-wrap bg-[var(--bg-primary)] p-4 rounded-lg border border-[var(--border-color)] select-text cursor-text">
              {renderBodyWithLinks(release.body || 'No release notes available.')}
            </div>
            {release.html_url && (
              <div className="mt-4 flex items-center gap-3 flex-wrap">
                {hasUpdate && isElectron ? (
                  <>
                    <button
                      disabled={installState !== 'idle' && installState !== 'error'}
                      onClick={() => {
                        const api = (window as any).electronAPI;
                        if (api?.installUpdate) {
                          setInstallState('downloading');
                          setDownloadPercent(0);
                          setInstallError(null);
                          api.installUpdate().then((res: any) => {
                            if (res?.status === 'error') {
                              setInstallState('error');
                              setInstallError(res.message || 'Update failed');
                            }
                          }).catch(() => {
                            setInstallState('error');
                            setInstallError('Failed to communicate with updater');
                          });
                        }
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[var(--accent-pink)] to-[var(--accent-purple)] hover:shadow-lg hover:shadow-[var(--accent-pink)]/25 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-60 disabled:cursor-wait"
                    >
                      {installState === 'downloading' ? (
                        <>⏳ Downloading… {downloadPercent}%</>
                      ) : installState === 'installing' ? (
                        <>✨ Installing…</>
                      ) : installState === 'error' ? (
                        <>🔄 Retry Update</>
                      ) : (
                        <>🔄 Restart &amp; Update</>
                      )}
                    </button>
                    {installState === 'downloading' && (
                      <div className="w-full mt-2 h-1.5 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${downloadPercent}%`,
                            background: 'linear-gradient(90deg, var(--accent-pink), var(--accent-purple))',
                          }}
                        />
                      </div>
                    )}
                    {installState === 'error' && installError && (
                      <p className="text-xs text-red-400 mt-1">{installError}</p>
                    )}
                  </>
                ) : (
                  <a
                    href={release.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent-cyan)]/20 hover:bg-[var(--accent-cyan)]/30 text-[var(--accent-cyan)] rounded-lg text-sm font-medium transition-colors"
                  >
                    📥 View on GitHub →
                  </a>
                )}
              </div>
            )}
          </div>
        )}
        
        {!loading && !release && !error && (
          <p className="text-center py-8 text-[var(--text-secondary)]">
            No release information available yet.
          </p>
        )}
      </div>
    </div>
  );
};