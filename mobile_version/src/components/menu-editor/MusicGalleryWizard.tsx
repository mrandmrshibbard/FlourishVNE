import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { VNProject, MusicGalleryEntry, MusicGalleryConfig } from '../../types/project';
import { VNID } from '../../types';
import { VNAudio } from '../../features/assets/types';
import { UIElementType, UIMusicGalleryElement } from '../../features/ui/types';
import { createUIElement } from '../../utils/uiElementFactory';
import { SparklesIcon, CheckIcon, ChevronRightIcon, XMarkIcon, MusicalNoteIcon } from '../icons';

/**
 * Music Gallery wizard: pick songs from the project's audio, choose unlock behavior, and
 * generate the config + a ready-made Music Gallery element in one go. Mirrors CGGalleryWizard.
 */

export interface MusicGalleryGeneratedConfig {
    galleryConfig: MusicGalleryConfig;
    galleryElement: UIMusicGalleryElement;
    /** Persistent boolean variables to create (one per locked song). */
    unlockVariables: { id: VNID; name: string }[];
}

interface WizardProps {
    isOpen: boolean;
    onClose: () => void;
    project: VNProject;
    screenId: VNID;
    onGenerate: (config: MusicGalleryGeneratedConfig) => void;
}

const generateId = (prefix: string): VNID =>
    `${prefix}-${Math.random().toString(36).substring(2, 9)}` as VNID;

type Step = 'settings' | 'select-songs' | 'review';

const MusicGalleryWizard: React.FC<WizardProps> = ({ isOpen, onClose, project, onGenerate }) => {
    const { t } = useTranslation('ui');
    const [step, setStep] = useState<Step>('settings');

    // Settings
    const [lockedByDefault, setLockedByDefault] = useState(false);
    const [onLeave, setOnLeave] = useState<'stop' | 'keepPlaying'>('stop');

    // Song picking
    const [selectedIds, setSelectedIds] = useState<VNID[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [artworkMap, setArtworkMap] = useState<Record<string, string>>({});
    const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});

    // Listen-preview: one throwaway audio element, stopped on unmount/close.
    const previewAudioRef = useRef<HTMLAudioElement | null>(null);
    const [previewingId, setPreviewingId] = useState<VNID | null>(null);
    const stopPreview = () => {
        previewAudioRef.current?.pause();
        previewAudioRef.current = null;
        setPreviewingId(null);
    };
    useEffect(() => () => { previewAudioRef.current?.pause(); }, []);

    const allAudio = useMemo(
        () => Object.values(project.audio || {}) as VNAudio[],
        [project.audio]
    );
    const filteredAudio = useMemo(() => {
        if (!searchTerm) return allAudio;
        const lower = searchTerm.toLowerCase();
        return allAudio.filter(a => a.name.toLowerCase().includes(lower));
    }, [allAudio, searchTerm]);

    const allImages = Object.values(project.images || {}) as { id: string; name: string }[];
    const allBackgrounds = Object.values(project.backgrounds || {}) as { id: string; name: string }[];

    const isSelected = (id: VNID) => selectedIds.includes(id);
    const toggleSong = (id: VNID) =>
        setSelectedIds(prev => isSelected(id) ? prev.filter(s => s !== id) : [...prev, id]);

    const togglePreview = (audio: VNAudio) => {
        if (previewingId === audio.id) { stopPreview(); return; }
        stopPreview();
        try {
            const el = new Audio(audio.audioUrl);
            el.volume = 0.6;
            el.onended = () => setPreviewingId(null);
            el.play().catch(() => setPreviewingId(null));
            previewAudioRef.current = el;
            setPreviewingId(audio.id as VNID);
        } catch { /* a bad file never breaks the wizard */ }
    };

    const reset = () => {
        stopPreview();
        setStep('settings');
        setLockedByDefault(false);
        setOnLeave('stop');
        setSelectedIds([]);
        setSearchTerm('');
        setArtworkMap({});
        setCategoryMap({});
    };
    const handleClose = () => { reset(); onClose(); };

    const handleGenerate = () => {
        const entries: Record<VNID, MusicGalleryEntry> = {};
        const unlockVariables: { id: VNID; name: string }[] = [];

        selectedIds.forEach((audioId, index) => {
            const audio = allAudio.find(a => a.id === audioId);
            if (!audio) return;
            const entryId = generateId('song');
            let unlockVariableId: VNID | null = null;
            if (lockedByDefault) {
                const varId = generateId('song_unlock');
                const safeName = audio.name.replace(/[^a-zA-Z0-9 _-]/g, '').substring(0, 30);
                unlockVariables.push({ id: varId, name: `Song Unlock: ${safeName}` });
                unlockVariableId = varId;
            }
            entries[entryId] = {
                id: entryId,
                name: audio.name,
                audioId: audioId,
                artworkAssetId: (artworkMap[audioId] || null) as VNID | null,
                unlockable: lockedByDefault,
                unlockVariableId,
                category: categoryMap[audioId] || '',
                order: index,
            };
        });

        const galleryConfig: MusicGalleryConfig = {
            // Merge INTO any existing gallery so re-running the wizard adds rather than wipes.
            entries: { ...(project.musicGallery?.entries || {}), ...entries },
            defaultArtworkAssetId: project.musicGallery?.defaultArtworkAssetId ?? null,
        };

        const galleryElement = createUIElement(UIElementType.MusicGallery, project) as UIMusicGalleryElement;
        galleryElement.onLeave = onLeave;

        onGenerate({ galleryConfig, galleryElement, unlockVariables });
        handleClose();
    };

    if (!isOpen) return null;

    const stepIdx = step === 'settings' ? 0 : step === 'select-songs' ? 1 : 2;

    const Toggle: React.FC<{ on: boolean; onClick: () => void }> = ({ on, onClick }) => (
        <button
            onClick={onClick}
            className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-purple-500' : 'bg-slate-600'}`}
        >
            <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
    );

    const renderStepIndicator = () => (
        <div className="flex items-center justify-center gap-2 mb-6">
            {[t('musicWizard.stepSettings', 'Settings'), t('musicWizard.stepSelectSongs', 'Pick songs'), t('musicWizard.stepReview', 'Review')].map((label, i) => (
                <React.Fragment key={label}>
                    {i > 0 && <div className="w-8 h-px bg-slate-600" />}
                    <div className="flex items-center gap-1.5">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i < stepIdx ? 'bg-green-500 text-white' : i === stepIdx ? 'bg-purple-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                            {i < stepIdx ? <CheckIcon /> : i + 1}
                        </div>
                        <span className={`text-xs ${i === stepIdx ? 'text-white' : 'text-slate-500'}`}>{label}</span>
                    </div>
                </React.Fragment>
            ))}
        </div>
    );

    const renderSettings = () => (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <label className="block text-sm font-medium">{t('musicWizard.lockedByDefault', 'Songs start locked')}</label>
                    <p className="text-xs text-slate-500">{t('musicWizard.lockedByDefaultHint', 'Each song gets its own unlock switch that stays flipped across playthroughs. Turn one on in your story with a Set Variable command.')}</p>
                </div>
                <Toggle on={lockedByDefault} onClick={() => setLockedByDefault(!lockedByDefault)} />
            </div>

            <div>
                <label className="block text-sm font-medium mb-1">{t('musicWizard.onLeave', 'When the player leaves the screen')}</label>
                <div className="flex gap-2">
                    <button
                        onClick={() => setOnLeave('stop')}
                        className={`flex-1 p-3 rounded-lg border text-sm ${onLeave === 'stop' ? 'bg-purple-600 border-purple-400' : 'bg-slate-800 border-slate-600 hover:bg-slate-700'}`}
                    >
                        <div className="font-semibold">{t('musicWizard.onLeaveStop', 'Stop the song')}</div>
                        <div className="text-xs opacity-70">{t('musicWizard.onLeaveStopHint', "The screen's own music comes back")}</div>
                    </button>
                    <button
                        onClick={() => setOnLeave('keepPlaying')}
                        className={`flex-1 p-3 rounded-lg border text-sm ${onLeave === 'keepPlaying' ? 'bg-purple-600 border-purple-400' : 'bg-slate-800 border-slate-600 hover:bg-slate-700'}`}
                    >
                        <div className="font-semibold">{t('musicWizard.onLeaveKeep', 'Keep it playing')}</div>
                        <div className="text-xs opacity-70">{t('musicWizard.onLeaveKeepHint', 'On screens where you tick "Let gallery music keep playing here"')}</div>
                    </button>
                </div>
            </div>
        </div>
    );

    const renderSelectSongs = () => (
        <div className="space-y-3">
            {allAudio.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                    <p className="text-lg mb-1">{t('musicWizard.noAudio', 'No audio files yet')}</p>
                    <p className="text-sm">{t('musicWizard.noAudioHint', 'Add music in the Assets tab first, then run this wizard again.')}</p>
                </div>
            ) : (
                <>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            autoFocus
                            placeholder={t('musicWizard.searchSongs', 'Search music…')}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500"
                        />
                        <button onClick={() => setSelectedIds(allAudio.map(a => a.id as VNID))} className="text-xs text-purple-400 hover:text-purple-300 whitespace-nowrap">{t('musicWizard.selectAll', 'Select all')}</button>
                        <button onClick={() => setSelectedIds([])} className="text-xs text-slate-400 hover:text-slate-300 whitespace-nowrap">{t('musicWizard.clear', 'Clear')}</button>
                    </div>

                    <div className="space-y-1 max-h-[350px] overflow-y-auto pr-1">
                        {filteredAudio.map(audio => (
                            <div
                                key={audio.id}
                                className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${isSelected(audio.id as VNID) ? 'border-purple-500 bg-purple-500/10' : 'border-slate-700 hover:border-slate-500'}`}
                                onClick={() => toggleSong(audio.id as VNID)}
                            >
                                <button
                                    onClick={e => { e.stopPropagation(); togglePreview(audio); }}
                                    className="w-7 h-7 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-xs flex-shrink-0"
                                    title={previewingId === audio.id ? t('musicWizard.stopListen', 'Stop') : t('musicWizard.listen', 'Listen')}
                                >
                                    {previewingId === audio.id ? '⏸' : '▶'}
                                </button>
                                <MusicalNoteIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                <span className="flex-1 text-sm truncate">{audio.name}</span>
                                {isSelected(audio.id as VNID) && (
                                    <div className="w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0"><CheckIcon /></div>
                                )}
                            </div>
                        ))}
                    </div>

                    <p className="text-xs text-slate-500 text-center">
                        {t('musicWizard.selectedCount', { selected: selectedIds.length, total: allAudio.length, defaultValue: '{{selected}} of {{total}} songs selected' })}
                    </p>
                </>
            )}
        </div>
    );

    const renderReview = () => (
        <div className="space-y-4">
            <div className="bg-slate-800/60 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                    <span className="text-slate-400">{t('musicWizard.songs', 'Songs')}</span>
                    <span className="font-medium">{selectedIds.length}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-400">{t('musicWizard.lockedByDefault', 'Songs start locked')}</span>
                    <span className="font-medium">{lockedByDefault ? t('musicWizard.yes', 'Yes') : t('musicWizard.no', 'No')}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-400">{t('musicWizard.onLeave', 'When the player leaves the screen')}</span>
                    <span className="font-medium">{onLeave === 'stop' ? t('musicWizard.onLeaveStop', 'Stop the song') : t('musicWizard.onLeaveKeep', 'Keep it playing')}</span>
                </div>
                {lockedByDefault && (
                    <div className="flex justify-between">
                        <span className="text-slate-400">{t('musicWizard.unlockVariables', 'Unlock switches')}</span>
                        <span className="font-medium text-purple-400">{t('musicWizard.willBeCreated', { count: selectedIds.length, defaultValue: '{{count}} will be created' })}</span>
                    </div>
                )}
            </div>

            {selectedIds.length > 0 && (
                <div>
                    <label className="block text-sm font-medium mb-2">
                        {t('musicWizard.perSong', 'Cover picture and category')}{' '}
                        <span className="text-slate-500 font-normal">{t('musicWizard.optional', '(optional)')}</span>
                    </label>
                    <div className="max-h-[220px] overflow-y-auto space-y-1 pr-1">
                        {selectedIds.map(id => {
                            const audio = allAudio.find(a => a.id === id);
                            if (!audio) return null;
                            return (
                                <div key={id} className="flex items-center gap-2">
                                    <span className="text-xs truncate flex-1">{audio.name}</span>
                                    <select
                                        value={artworkMap[id] || ''}
                                        onChange={e => setArtworkMap(prev => ({ ...prev, [id]: e.target.value }))}
                                        className="bg-slate-800 border border-slate-600 rounded px-2 py-0.5 text-xs w-36 focus:outline-none focus:border-purple-500"
                                    >
                                        <option value="">{t('musicWizard.noArtwork', 'No cover picture')}</option>
                                        {allImages.length > 0 && (
                                            <optgroup label={t('musicWizard.images', 'Images')}>
                                                {allImages.map(img => <option key={img.id} value={img.id}>{img.name}</option>)}
                                            </optgroup>
                                        )}
                                        {allBackgrounds.length > 0 && (
                                            <optgroup label={t('musicWizard.backgrounds', 'Backgrounds')}>
                                                {allBackgrounds.map(bg => <option key={bg.id} value={bg.id}>{bg.name}</option>)}
                                            </optgroup>
                                        )}
                                    </select>
                                    <input
                                        type="text"
                                        placeholder={t('musicWizard.category', 'Category')}
                                        value={categoryMap[id] || ''}
                                        onChange={e => setCategoryMap(prev => ({ ...prev, [id]: e.target.value }))}
                                        className="bg-slate-800 border border-slate-600 rounded px-2 py-0.5 text-xs w-24 focus:outline-none focus:border-purple-500"
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {lockedByDefault && selectedIds.length > 0 && (
                <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3">
                    <p className="text-[11px] text-slate-400">
                        {t('musicWizard.unlockVarInfo', 'Each song gets an on/off switch that stays flipped across playthroughs. Flip one on in your story with a Set Variable command to unlock its song.')}
                    </p>
                </div>
            )}
        </div>
    );

    return createPortal(
        <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={e => e.target === e.currentTarget && handleClose()}
        >
            <div className="bg-gradient-to-b from-[var(--bg-tertiary)] to-[var(--bg-secondary)] rounded-xl shadow-2xl w-full max-w-lg p-6 m-4 border border-[var(--border-default)] max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <MusicalNoteIcon className="w-5 h-5 text-purple-400" />
                        {t('musicWizard.title', 'Music Gallery Wizard')}
                    </h2>
                    <button onClick={handleClose} className="p-1 hover:bg-slate-700 rounded-lg transition-colors">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>
                <p className="text-sm text-slate-400 mb-4">
                    {t('musicWizard.subtitle', 'Turn your soundtrack into an unlockable jukebox players can browse.')}
                </p>

                {renderStepIndicator()}

                <div className="flex-1 overflow-y-auto min-h-0">
                    {step === 'settings' && renderSettings()}
                    {step === 'select-songs' && renderSelectSongs()}
                    {step === 'review' && renderReview()}
                </div>

                <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-700">
                    {step !== 'settings' ? (
                        <button onClick={() => { stopPreview(); setStep(step === 'review' ? 'select-songs' : 'settings'); }} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
                            {t('musicWizard.back', 'Back')}
                        </button>
                    ) : (
                        <button onClick={handleClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
                            {t('musicWizard.cancel', 'Cancel')}
                        </button>
                    )}

                    {step === 'review' ? (
                        <button
                            onClick={handleGenerate}
                            disabled={selectedIds.length === 0}
                            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed px-6 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 transition-all"
                        >
                            <SparklesIcon className="w-4 h-4" /> {t('musicWizard.generate', 'Create the gallery')}
                        </button>
                    ) : (
                        <button
                            onClick={() => { stopPreview(); setStep(step === 'settings' ? 'select-songs' : 'review'); }}
                            className="bg-purple-600 hover:bg-purple-500 px-6 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 transition-colors"
                        >
                            {t('musicWizard.next', 'Next')} <ChevronRightIcon className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default MusicGalleryWizard;
