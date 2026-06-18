/**
 * MobileProjectFiles — the in-app file manager for the mobile editor.
 *
 * Lists app-private .flourish project files (native bridge on device, IndexedDB
 * fallback in browser preview). Open loads the project; Share exports it out via
 * the system share sheet; Delete removes it. Also listens for .flourish files
 * opened/shared INTO the app and refreshes.
 *
 * Mobile fork only — mounted by ProjectHub when IS_MOBILE.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { VNProject } from '../types/project';
import { importProject } from '../utils/projectPackager';
import {
  listProjectFiles,
  readProjectFile,
  deleteProjectFile,
  shareProjectFile,
  onProjectImported,
  hasNativeFiles,
  ProjectFileEntry,
} from '../utils/mobileFiles';

const fmtSize = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};
const fmtDate = (ms: number): string => {
  if (!ms) return '';
  try { return new Date(ms).toLocaleDateString(); } catch { return ''; }
};

export const MobileProjectFiles: React.FC<{
  onProjectSelect: (project: VNProject) => void;
}> = ({ onProjectSelect }) => {
  const [files, setFiles] = useState<ProjectFileEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setFiles(await listProjectFiles()); } catch { setFiles([]); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // .flourish opened/shared into the app → refresh and surface it.
  useEffect(() => onProjectImported(() => { refresh(); }), [refresh]);

  const open = useCallback(async (name: string) => {
    setBusy(name); setError(null);
    try {
      const bytes = await readProjectFile(name);
      if (!bytes) throw new Error('File could not be read.');
      const { project } = await importProject(bytes);
      onProjectSelect(project);
    } catch (e: any) {
      setError(`Couldn't open ${name}: ${e?.message || 'unknown error'}`);
    } finally {
      setBusy(null);
    }
  }, [onProjectSelect]);

  const remove = useCallback(async (name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setBusy(name);
    try { await deleteProjectFile(name); await refresh(); } finally { setBusy(null); }
  }, [refresh]);

  const share = useCallback(async (name: string) => {
    try { await shareProjectFile(name); } catch { /* ignore */ }
  }, []);

  return (
    <section className="mt-8">
      <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-4 flex items-center gap-3 uppercase tracking-widest">
        <span className="w-8 h-[1px] bg-gradient-to-r from-transparent to-[var(--accent-cyan)]" />
        My Project Files
        <span className="text-[10px] normal-case tracking-normal text-[var(--text-muted)]/70">
          {hasNativeFiles() ? 'on this device' : 'browser preview'}
        </span>
        <span className="flex-1 h-[1px] bg-gradient-to-l from-transparent to-[var(--accent-cyan)]" />
      </h3>

      {error && (
        <div className="mb-3 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl p-3">{error}</div>
      )}

      {files.length === 0 ? (
        <div className="text-sm text-[var(--text-muted)] bg-[var(--bg-secondary)]/50 border border-[var(--border-subtle)] rounded-2xl p-5 text-center">
          No saved projects yet. Create or import a project, then use <span className="font-semibold">Save / Export</span> to keep it here.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {files.map((f) => (
            <div
              key={f.name}
              className="rounded-2xl p-4 flex flex-col gap-3"
              style={{
                background: 'linear-gradient(180deg, var(--bg-tertiary) 0%, var(--bg-secondary) 100%)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <div>
                <div className="font-semibold text-sm text-[var(--text-primary)] truncate">{f.name}</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  {fmtSize(f.size)}{f.modified ? ` · ${fmtDate(f.modified)}` : ''}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => open(f.name)}
                  disabled={busy === f.name}
                  className="flex-1 min-h-[44px] rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-lavender))' }}
                >
                  {busy === f.name ? 'Opening…' : 'Open'}
                </button>
                <button
                  onClick={() => share(f.name)}
                  className="min-h-[44px] px-4 rounded-xl text-sm font-medium text-[var(--text-primary)] border border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
                  title="Share / export"
                >
                  Share
                </button>
                <button
                  onClick={() => remove(f.name)}
                  disabled={busy === f.name}
                  className="min-h-[44px] px-4 rounded-xl text-sm font-medium text-red-400 border border-red-500/30 bg-red-500/10 disabled:opacity-50"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
