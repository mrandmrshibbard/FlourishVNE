import React from 'react';
import type { MigrationProgress } from '../utils/assetMigration';

/** Format a byte count for the status line (e.g. "1.3 GB"). */
const fmtBytes = (n: number): string => {
    if (!n) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

const Spinner: React.FC = () => (
    <svg className="w-4 h-4 animate-spin text-sky-400" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
);

/**
 * Bottom-center banner shown while a project's media is being moved into the new on-disk storage
 * format (only appears for legacy/imported projects that actually need migrating). Driven by
 * ProjectContext; renders nothing when `status` is null.
 */
const MigrationStatusBar: React.FC<{ status: MigrationProgress | null }> = ({ status }) => {
    if (!status) return null;
    const pct = status.total > 0 ? Math.round((status.done / status.total) * 100) : 0;

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10000] w-[min(92vw,30rem)] pointer-events-none">
            <div className="rounded-lg border border-sky-500 bg-slate-900/95 shadow-xl backdrop-blur-sm px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                    <Spinner />
                    <p className="text-sm font-medium text-white">Updating project storage…</p>
                    <span className="ml-auto text-xs text-slate-400 tabular-nums">{status.done}/{status.total}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-700 overflow-hidden">
                    <div
                        className="h-full bg-sky-500 transition-all duration-200 ease-out"
                        style={{ width: `${pct}%` }}
                    />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-400 truncate">
                        {status.label ? `Moving ${status.label}…` : 'Preparing assets…'}
                    </p>
                    {status.bytes > 0 && <span className="text-xs text-slate-500 tabular-nums flex-shrink-0">{fmtBytes(status.bytes)}</span>}
                </div>
            </div>
        </div>
    );
};

export default MigrationStatusBar;
