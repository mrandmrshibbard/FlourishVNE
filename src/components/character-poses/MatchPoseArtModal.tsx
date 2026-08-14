/**
 * "Match art by file name" — the bulk assist for filling a pose's art.
 *
 * The author drops N files (e.g. mia_side_body.png, mia_side_dress_red.png). Each file name is
 * tokenized (same splitter the sprite importer uses); tokens matching the pose or character name
 * are ignored, and the rest are scored against every layer asset's name. Best match wins as the
 * suggestion — the author reviews the table, fixes anything, and commits in one click.
 * Everything is a suggestion until "Add art" is pressed; Skip rows are untouched.
 */
import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../contexts/ProjectContext';
import { useToast } from '../../contexts/ToastContext';
import { VNCharacter, VNCharacterLayer, VNCharacterPose, VNLayerAsset } from '../../features/character/types';
import { splitNameTokens, stripExtension } from '../../features/character/import/nameGrouping';
import { ingestUpload } from '../../utils/assetStore';
import { UploadIcon } from '../icons';

type TargetKey = 'skip' | 'base' | `${string}:${string}`; // 'layerId:assetId'

interface Row {
    file: File;
    previewUrl: string;
    target: TargetKey;
    guessed: boolean;
}

const MatchPoseArtModal: React.FC<{
    character: VNCharacter;
    pose: VNCharacterPose;
    onClose: () => void;
}> = ({ character, pose, onClose }) => {
    const { t } = useTranslation('characters');
    const { project, dispatch } = useProject();
    const toast = useToast();
    const [rows, setRows] = useState<Row[]>([]);
    const [busy, setBusy] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const ignoreTokens = new Set([
        ...splitNameTokens(pose.name.toLowerCase()),
        ...splitNameTokens(character.name.toLowerCase()),
    ]);

    const guessTarget = (fileName: string): TargetKey => {
        const tokens = splitNameTokens(stripExtension(fileName).toLowerCase()).filter(tk => !ignoreTokens.has(tk));
        if (tokens.length === 0) return 'base';
        // Base-ish names → the pose's base sprite.
        if (tokens.some(tk => tk === 'base' || tk === 'body' || tk === 'sprite')) return 'base';
        let best: { key: TargetKey; score: number } = { key: 'skip', score: 0 };
        for (const layer of Object.values(character.layers) as VNCharacterLayer[]) {
            const layerTokens = new Set(splitNameTokens(layer.name.toLowerCase()));
            for (const asset of Object.values(layer.assets) as VNLayerAsset[]) {
                const assetTokens = new Set(splitNameTokens(asset.name.toLowerCase()));
                let score = 0;
                for (const tk of tokens) {
                    if (assetTokens.has(tk)) score += 2;      // asset-name hits weigh most
                    else if (layerTokens.has(tk)) score += 1; // layer-name hits break ties
                }
                if (score > best.score) best = { key: `${layer.id}:${asset.id}` as TargetKey, score };
            }
        }
        return best.score > 0 ? best.key : 'skip';
    };

    const addFiles = (files: File[]) => {
        const media = files.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
        setRows(prev => [
            ...prev,
            ...media.map(file => ({
                file,
                previewUrl: URL.createObjectURL(file),
                target: guessTarget(file.name),
                guessed: true,
            })),
        ]);
    };

    const commit = async () => {
        setBusy(true);
        try {
            let applied = 0;
            for (const row of rows) {
                if (row.target === 'skip') continue;
                const isVideo = row.file.type.startsWith('video/');
                if (row.target === 'base') {
                    // Fresh id per upload — reusing an id keeps the same URL and the image cache
                    // shows stale art (also lets two base-guessed rows write distinct files).
                    const url = await ingestUpload(project.id, 'characters', `${character.id}-pose-${pose.id}-base-${Math.random().toString(36).substring(2, 9)}` as any, row.file);
                    dispatch({ type: 'UPDATE_POSE', payload: { characterId: character.id, poseId: pose.id, updates: isVideo
                        ? { baseVideoUrl: url, baseImageUrl: null, isBaseVideo: true, baseVideoLoop: true }
                        : { baseImageUrl: url, baseVideoUrl: null, isBaseVideo: false } } });
                } else {
                    const [layerId, assetId] = row.target.split(':');
                    const url = await ingestUpload(project.id, 'characters', `${character.id}-pose-${pose.id}-${assetId}-${Math.random().toString(36).substring(2, 9)}` as any, row.file);
                    dispatch({ type: 'SET_ASSET_POSE_ART', payload: { characterId: character.id, layerId, assetId, poseId: pose.id, art: isVideo ? { videoUrl: url, isVideo: true, loop: true } : { imageUrl: url } } });
                }
                applied++;
            }
            toast.success(t('poses.matchDone', 'Added art for {{n}} piece(s) to "{{pose}}".', { n: applied, pose: pose.name }));
            onClose();
        } finally {
            setBusy(false);
        }
    };

    const targetOptions: Array<{ value: TargetKey; label: string }> = [
        { value: 'skip', label: t('poses.matchSkip', 'Skip this file') },
        { value: 'base', label: t('poses.matchBase', 'Base sprite for this pose') },
        ...(Object.values(character.layers) as VNCharacterLayer[]).flatMap(layer =>
            (Object.values(layer.assets) as VNLayerAsset[]).map(asset => ({
                value: `${layer.id}:${asset.id}` as TargetKey,
                label: `${layer.name} › ${asset.name}`,
            }))),
    ];

    const assignable = rows.filter(r => r.target !== 'skip').length;

    return createPortal(
        <div className="fixed inset-0 z-[100000] bg-black/70 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-4 w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                    {t('poses.matchTitle', 'Match art by file name — "{{pose}}"', { pose: pose.name })}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mb-3">
                    {t('poses.matchHint', 'Drop the art you made for this pose. Files are matched to your pieces by name — "mia_side_dress_red.png" finds the piece called "dress red". Check the guesses below and fix any that are wrong.')}
                </p>

                <div
                    className="rounded-lg border-2 border-dashed p-4 text-center text-xs cursor-pointer mb-3 flex-shrink-0"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
                    onDrop={e => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)); }}
                >
                    <UploadIcon className="w-4 h-4 inline-block mr-1" /> {t('poses.matchDrop', 'Drop files here, or click to pick them')}
                    <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" className="hidden"
                        onChange={e => { addFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
                    {rows.length === 0 && <p className="text-xs text-center text-[var(--text-muted)] py-4">{t('poses.matchEmpty', 'No files yet.')}</p>}
                    {rows.map((row, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-lg border p-1.5" style={{ borderColor: row.target === 'skip' ? 'var(--border-subtle)' : 'color-mix(in srgb, var(--accent-mint) 40%, transparent)', background: 'var(--bg-primary)' }}>
                            {row.file.type.startsWith('video/')
                                ? <video src={row.previewUrl} muted className="w-10 h-10 object-contain rounded bg-slate-800 flex-shrink-0" />
                                : <img src={row.previewUrl} alt="" className="w-10 h-10 object-contain rounded bg-slate-800 flex-shrink-0" />}
                            <span className="text-[11px] flex-1 truncate" style={{ color: 'var(--text-secondary)' }} title={row.file.name}>{row.file.name}</span>
                            <select
                                value={row.target}
                                onChange={e => setRows(rs => rs.map((r, j) => j === i ? { ...r, target: e.target.value as TargetKey, guessed: false } : r))}
                                className="text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded px-1.5 py-1 outline-none max-w-[14rem]"
                            >
                                {targetOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            <button onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} className="text-xs px-1 text-red-400 hover:text-red-300" title={t('poses.matchRemoveRow', 'Remove from this list')}>✕</button>
                        </div>
                    ))}
                </div>

                <div className="flex justify-end gap-2 mt-3 flex-shrink-0">
                    <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-xs border border-[var(--border-subtle)] text-[var(--text-secondary)]">{t('editor.cancel', 'Cancel')}</button>
                    <button
                        type="button"
                        onClick={commit}
                        disabled={busy || assignable === 0}
                        className="px-3 py-1.5 rounded-md text-xs bg-[var(--accent-purple)] text-white font-semibold disabled:opacity-40"
                    >
                        {busy ? t('poses.matchWorking', 'Adding…') : t('poses.matchCommit', 'Add art ({{n}})', { n: assignable })}
                    </button>
                </div>
            </div>
        </div>, document.body);
};

export default MatchPoseArtModal;
