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

  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

  useEffect(() => {
    // Get current app version
    if (isElectron && (window as any).electronAPI?.getAppVersion) {
      (window as any).electronAPI.getAppVersion().then((v: string) => setCurrentVersion(v));
    }
  }, [isElectron]);

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
                <a
                  href={release.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent-cyan)]/20 hover:bg-[var(--accent-cyan)]/30 text-[var(--accent-cyan)] rounded-lg text-sm font-medium transition-colors"
                >
                  📥 Download from GitHub →
                </a>
                <a
                  href="https://memento-morii1.itch.io/flourish-visual-novel-engine"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent-pink)]/20 hover:bg-[var(--accent-pink)]/30 text-[var(--accent-pink)] rounded-lg text-sm font-medium transition-colors"
                >
                  🎮 itch.io
                </a>
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