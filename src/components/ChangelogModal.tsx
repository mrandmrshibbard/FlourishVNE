import React, { useState, useEffect } from 'react';

interface Release {
  tag_name: string;
  body: string;
  published_at: string;
}

export const ChangelogModal: React.FC<{
  visible: boolean;
  onClose: () => void;
}> = ({ visible, onClose }) => {
  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      setError(null);
      fetch('https://api.github.com/repos/mrandmrshibbard/FlourishVNE/releases/latest')
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
        })
        .catch(err => {
          setError(err.message);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-lg shadow-xl w-full max-w-2xl p-6 max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Latest Changes</h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-2xl"
          >
            ×
          </button>
        </div>

        {loading && <p>Loading changelog...</p>}
        {error && <p className="text-red-500">Error: {error}</p>}
        {release && (
          <div>
            <p className="text-sm text-[var(--text-secondary)] mb-2">
              Version {release.tag_name} - {new Date(release.published_at).toLocaleDateString()}
            </p>
            <div className="text-sm whitespace-pre-wrap">
              {release.body}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};