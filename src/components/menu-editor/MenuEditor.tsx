import React, { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Panel from '../ui/Panel';
import { useProject } from '../../contexts/ProjectContext';
import { useToast } from '../../contexts/ToastContext';
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import { VNUIScreen, VNUIElement, UIElementType, UISettingsSliderElement, UISettingsToggleElement, UIButtonElement, UITextElement, UIImageElement, UISaveSlotGridElement, UICharacterPreviewElement, UITextInputElement, UIDropdownElement, UICheckboxElement, UIAssetCyclerElement, UICGGalleryElement } from '../../features/ui/types';
import { VNCharacter, VNCharacterLayer } from '../../features/character/types';
import ResizableDraggable from './ResizableDraggable';
import { createUIElement } from '../../utils/uiElementFactory';
import { fontSettingsToStyle, extractTextGradientStyle } from '../../utils/styleUtils';
import { GradientText } from '../ui/GradientText';
import { PlusIcon, SparklesIcon } from '../icons';
import CharacterCustomizationWizard, { GeneratedConfig } from './CharacterCustomizationWizard';
import CGGalleryWizard, { CGGalleryGeneratedConfig } from './CGGalleryWizard';
import SystemWizard from './SystemWizard';
import { applySystemWizardResult } from '../../features/systems/applySystem';
import { HotSpotOverlay, InteractiveElementOverlay } from '../interactive-elements/InteractiveElementOverlays';
import { isHotSpotElement, isInteractiveElement } from '../../utils/interactiveElements';
import { useElementRadial } from './ElementRadialContext';

// Safe wrapper for element rendering to prevent crashes.
const SafeUIElementRenderer: React.FC<{ element: VNUIElement, project: VNProject }> = ({ element, project }) => {
    const { t } = useTranslation('ui');
    try {
        return (
            <div style={{ opacity: element.opacity ?? 1, width: '100%', height: '100%', overflow: 'hidden' }}>
                <UIElementRenderer element={element} project={project} />
            </div>
        );
    } catch (err) {
        console.error('Error rendering UI element:', element.id, err);
        return <div className="w-full h-full bg-red-500/20 text-red-300 text-xs p-1">{t('menuEditor.renderError')}</div>;
    }
};

const UIElementRenderer: React.FC<{ element: VNUIElement, project: VNProject }> = ({ element, project }) => {
    const { t } = useTranslation('ui');
    if (!element) {
        return <div className="w-full h-full bg-yellow-500/20">{t('menuEditor.noElement')}</div>;
    }

    switch (element.type) {
        case UIElementType.Button: {
            const btn = element as UIButtonElement;
            // Use stored backgroundColor or default purple theme color
            const buttonBg = btn.backgroundColor || '#4D3273';
            // Resolve button image background (same logic as LivePreview)
            const btnImageUrl = btn.image ? (
                btn.image.type === 'video'
                    ? (project.videos[btn.image.id]?.videoUrl || (project.backgrounds[btn.image.id] as any)?.videoUrl || (project.images[btn.image.id] as any)?.videoUrl)
                    : project.images[btn.image.id]?.imageUrl || project.backgrounds[btn.image.id]?.imageUrl
            ) : null;
            const btnAlignClass = { left: 'justify-start', center: 'justify-center', right: 'justify-end' }[btn.font?.align || 'center'];
            return <div
                className={`w-full h-full border border-white/20 rounded flex items-center ${btnAlignClass} relative overflow-hidden`}
                style={{ pointerEvents: 'none', paddingLeft: `${btn.paddingX ?? 0}%`, paddingRight: `${btn.paddingX ?? 0}%`, boxSizing: 'border-box' }}
            >
                {btnImageUrl ? (
                    <img src={btnImageUrl} alt="" className="absolute inset-0 w-full h-full object-fill" />
                ) : (
                    <div className="absolute inset-0 w-full h-full rounded" style={{ backgroundColor: buttonBg }} />
                )}
                <GradientText className="relative z-10" style={{...fontSettingsToStyle(btn.font), ...(extractTextGradientStyle(btn.font) || {})}}>{btn.text}</GradientText>
            </div>;
        }
        case UIElementType.Text: {
            const txt = element as UITextElement;
            const effectiveAlign = txt.textAlign || txt.font?.align || 'center';
            const hAlignClass = { left: 'justify-start', center: 'justify-center', right: 'justify-end' }[effectiveAlign];
            const vAlignClass = { top: 'items-start', middle: 'items-center', bottom: 'items-end' }[txt.verticalAlign || 'middle'];

            const txtStyle: React.CSSProperties = { ...fontSettingsToStyle(txt.font), textAlign: effectiveAlign };

            return <div
                className={`w-full h-full flex p-1 ${hAlignClass} ${vAlignClass}`}
                style={txtStyle}
            >
                <div><GradientText style={extractTextGradientStyle(txt.font)}>{txt.text}</GradientText></div>
            </div>;
        }
        case UIElementType.Image: {
            const img = element as UIImageElement;
            // Support new background property with fallback to old image property
            const bgType = img.background?.type || (img.image ? img.image.type : null);
            const bgValue = img.background?.type === 'color' ? img.background.value :
                           img.background?.type ? img.background.assetId :
                           img.image?.id || null;
            
            // If it's a color background
            if (bgType === 'color' && typeof bgValue === 'string') {
                return <div className="w-full h-full" style={{ backgroundColor: bgValue }} />;
            }
            
            // Otherwise it's an image or video asset
            const url = bgValue ? (
                bgType === 'video'
                    ? (project.videos[bgValue]?.videoUrl || (project.backgrounds[bgValue] as any)?.videoUrl || (project.images[bgValue] as any)?.videoUrl)
                    : project.images[bgValue]?.imageUrl || project.backgrounds[bgValue]?.imageUrl
            ) : null;
            
            if (!url) {
                return <div className="w-full h-full bg-[var(--bg-primary)]/50 flex items-center justify-center text-slate-500">
                    {bgType === 'color' ? 'Color' : 'Image/Video'}
                </div>;
            }
            
            const objectFit = img.objectFit || 'contain';
            
            if (bgType === 'video') {
                return <video 
                    src={url} 
                    autoPlay 
                    muted 
                    loop 
                    playsInline
                    className="w-full h-full pointer-events-none" 
                    style={{ objectFit }}
                />;
            }
            
            return <img 
                src={url} 
                alt="" 
                className="w-full h-full" 
                style={{ objectFit }}
            />;
        }
        case UIElementType.SaveSlotGrid: {
            const slotEl = element as UISaveSlotGridElement;
            const slotBgColor = slotEl.slotBackgroundColor || '#1e293b';
            const slotBorderColor = slotEl.slotBorderColor || '#475569';
            const slotHeaderColor = slotEl.slotHeaderColor || '#7dd3fc';
            const baseFont = fontSettingsToStyle(slotEl.font);
            const emptySlotStyle = slotEl.emptySlotFont
                ? fontSettingsToStyle(slotEl.emptySlotFont)
                : { color: slotEl.emptySlotTextColor || '#a0aec0', fontSize: baseFont.fontSize, fontFamily: baseFont.fontFamily };
            const emptySlotTextAlign = (emptySlotStyle as any).textAlign ?? 'center';
            const emptySlotJustify = emptySlotTextAlign === 'right' ? 'flex-end' : emptySlotTextAlign === 'left' ? 'flex-start' : 'center';
            const navBtnStyle: React.CSSProperties = slotEl.navButtonFont
                ? { ...fontSettingsToStyle(slotEl.navButtonFont), backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '4px', padding: '2px 10px' }
                : { color: slotHeaderColor, fontFamily: baseFont.fontFamily, fontSize: baseFont.fontSize, fontWeight: 'bold' as const, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '4px', padding: '2px 10px' };
            const pageIndicatorStyle: React.CSSProperties = slotEl.pageIndicatorFont
                ? fontSettingsToStyle(slotEl.pageIndicatorFont)
                : { color: slotHeaderColor, fontFamily: baseFont.fontFamily, fontSize: baseFont.fontSize };
            const totalPages = Math.max(1, Math.ceil(slotEl.slotCount / 4));
            const prevLabel = slotEl.prevButtonText ?? t('menuEditor.prev');
            const nextLabel = slotEl.nextButtonText ?? t('menuEditor.next');
            return (
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3%', padding: '2%', flex: '1 1 0', minHeight: 0, boxSizing: 'border-box', overflow: 'hidden' }}>
                        {Array.from({ length: Math.min(slotEl.slotCount, 4) }).map((_, i) => (
                            <div
                                key={i}
                                style={{ backgroundColor: slotBgColor, borderColor: slotBorderColor, borderWidth: 2, borderStyle: 'solid', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                            >
                                <div style={{ position: 'relative', flex: '1 1 0', minHeight: 0, overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: emptySlotJustify, padding: '0 8%' }}>
                                        <span style={{ ...emptySlotStyle, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{slotEl.emptySlotText}</span>
                                    </div>
                                    {!slotEl.hideSlotLabel && (
                                        <div style={{ position: 'absolute', top: '4px', left: '4px', ...baseFont, color: slotHeaderColor, fontWeight: 'bold', margin: 0, textShadow: '0 2px 4px rgba(0,0,0,0.7)', zIndex: 10 }}>{t('menuEditor.slot', { n: i + 1 })}</div>
                                    )}
                                </div>
                                {!slotEl.hideInfoBar && (
                                    <div style={{ flex: '0 0 auto', padding: '4px 8px 6px', backgroundColor: 'rgba(0,0,0,0.35)' }} />
                                )}
                            </div>
                        ))}
                    </div>
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '0.5rem 0', flexShrink: 0 }}>
                            <span style={{ ...navBtnStyle, opacity: 0.3 }}>{prevLabel}</span>
                            <span style={pageIndicatorStyle}>{t('menuEditor.page', { total: totalPages })}</span>
                            <span style={navBtnStyle}>{nextLabel}</span>
                        </div>
                    )}
                </div>
            );
        }
        case UIElementType.SettingsSlider: {
            const sliderEl = element as UISettingsSliderElement;
            const thumbColor = sliderEl.thumbColor || '#8a2be2';
            const trackColor = sliderEl.trackColor || '#4D3273';
            return (
                <div className="w-full h-full flex items-center justify-center p-2">
                    <div className="w-full h-2 rounded-full relative" style={{ backgroundColor: trackColor }}>
                        <div 
                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white/30"
                            style={{ backgroundColor: thumbColor }}
                        />
                    </div>
                </div>
            );
        }
        case UIElementType.SettingsToggle:
            const tog = element as UISettingsToggleElement;
            return <div className="w-full h-full flex items-center gap-2" style={fontSettingsToStyle(tog.font)}>
                <input type="checkbox" className="h-4 w-4" disabled style={{ accentColor: tog.checkboxColor || '#3b82f6', pointerEvents: 'none' as const }}/>
                <GradientText style={extractTextGradientStyle(tog.font)}>{tog.text}</GradientText>
            </div>;
        case UIElementType.CharacterPreview:
             const charEl = element as UICharacterPreviewElement;
             const char = project.characters[charEl.characterId] as VNCharacter | undefined;
             if (!char) {
                 return <div className="w-full h-full border-2 border-dashed border-[var(--bg-tertiary)] flex items-center justify-center text-[var(--text-secondary)]">
                     <span className="bg-black/50 p-1 rounded">{t('menuEditor.noCharacterSelected')}</span>
                 </div>;
             }
             
             // Build image/video arrays similar to LivePreview rendering
             const imageUrls: string[] = [];
             const videoUrls: string[] = [];
             let hasVideo = false;
             
             // Add base
             if (char.baseVideoUrl) {
                 videoUrls.push(char.baseVideoUrl);
                 hasVideo = true;
             } else if (char.baseImageUrl) {
                 imageUrls.push(char.baseImageUrl);
             }
             
             // Add layers from first expression (for preview purposes)
             const firstExpr = Object.values(char.expressions)[0];
             if (firstExpr && firstExpr.layerConfiguration) {
                 Object.entries(firstExpr.layerConfiguration).forEach(([layerId, assetId]) => {
                     const layer = char.layers[layerId];
                     if (layer && assetId) {
                         const asset = layer.assets[assetId];
                         if (asset?.videoUrl) {
                             videoUrls.push(asset.videoUrl);
                             hasVideo = true;
                         } else if (asset?.imageUrl) {
                             imageUrls.push(asset.imageUrl);
                         }
                     }
                 });
             }
             
             return <div className="w-full h-full border-2 border-dashed border-[var(--accent-purple)] flex items-center justify-center relative overflow-hidden bg-black/20">
                 {hasVideo && videoUrls.length > 0 ? (
                     videoUrls.map((url, i) => (
                         <video 
                             key={i}
                             src={url} 
                             autoPlay 
                             muted 
                             loop 
                             playsInline
                             className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none" 
                             style={{ zIndex: i }}
                         />
                     ))
                 ) : (
                     imageUrls.map((url, i) => (
                         <img 
                             key={i}
                             src={url} 
                             alt="" 
                             className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none" 
                             style={{ zIndex: i }}
                         />
                     ))
                 )}
                 <span className="absolute bottom-1 left-1 right-1 text-center z-10 bg-black/70 p-1 rounded text-xs text-white">
                     {char.name}
                 </span>
             </div>;
        case UIElementType.TextInput:
            const input = element as UITextInputElement;
            return <div className="w-full h-full flex items-center p-2">
                <input 
                    type="text" 
                    placeholder={input.placeholder}
                    disabled
                    className="w-full px-3 py-2 rounded border"
                    style={{
                        ...fontSettingsToStyle(input.font),
                        backgroundColor: input.backgroundColor || '#1e293b',
                        borderColor: input.borderColor || '#475569',
                        pointerEvents: 'none'
                    }}
                />
            </div>;
        case UIElementType.Dropdown:
            const dropdown = element as UIDropdownElement;
            return <div className="w-full h-full flex items-center p-2">
                <select 
                    disabled
                    className="w-full px-3 py-2 rounded border"
                    style={{
                        ...fontSettingsToStyle(dropdown.font),
                        backgroundColor: dropdown.backgroundColor || '#1e293b',
                        borderColor: dropdown.borderColor || '#475569',
                        direction: dropdown.arrowSide === 'left' ? 'rtl' : 'ltr',
                        textAlign: dropdown.arrowSide === 'left' ? 'right' : 'left',
                        pointerEvents: 'none'
                    }}
                >
                    {dropdown.options.map(opt => (
                        <option key={opt.id} value={String(opt.value)}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </div>;
        case UIElementType.Checkbox:
            const checkbox = element as UICheckboxElement;
            return <div className="w-full h-full flex items-center p-2 gap-2">
                <input 
                    type="checkbox"
                    disabled
                    className="w-5 h-5"
                    style={{
                        accentColor: checkbox.checkboxColor || '#3b82f6',
                        pointerEvents: 'none'
                    }}
                />
                <GradientText style={{
                    ...fontSettingsToStyle(checkbox.font),
                    ...(extractTextGradientStyle(checkbox.font) || {}),
                    color: checkbox.labelColor || '#f1f5f9'
                }}>
                    {checkbox.label}
                </GradientText>
            </div>;
        case UIElementType.AssetCycler:
            const cycler = element as UIAssetCyclerElement;
            const cyclerChar = project.characters[cycler.characterId];
            const cyclerLayer = cyclerChar?.layers[cycler.layerId];
            const firstAssetId = cycler.assetIds[0];
            const firstAsset = firstAssetId && cyclerLayer ? cyclerLayer.assets[firstAssetId] : null;
            
            return <div className="w-full h-full flex flex-col gap-1 items-center justify-center p-2 rounded" style={{ backgroundColor: cycler.backgroundColor || 'rgba(30, 41, 59, 0.8)' }}>
                {cycler.label && (
                    <div style={{...fontSettingsToStyle(cycler.font), fontSize: `calc(var(--font-scale, 1) * ${(cycler.font?.size || 16) * 0.8}px)`, opacity: 0.8}} className="text-center">
                        <GradientText style={extractTextGradientStyle(cycler.font)}>{cycler.label}</GradientText>
                    </div>
                )}
                <div className="flex items-center gap-3 w-full">
                    <div style={{ color: cycler.arrowColor || '#a855f7', fontSize: `calc(var(--font-scale, 1) * ${cycler.arrowSize || 24}px)` }}>◀</div>
                    <div className="flex-1 text-center overflow-hidden" style={fontSettingsToStyle(cycler.font)}>
                        <GradientText style={extractTextGradientStyle(cycler.font)}>{cycler.showAssetName && firstAsset ? firstAsset.name : `1 / ${cycler.assetIds.length}`}</GradientText>
                    </div>
                    <div style={{ color: cycler.arrowColor || '#a855f7', fontSize: `calc(var(--font-scale, 1) * ${cycler.arrowSize || 24}px)` }}>▶</div>
                </div>
            </div>;
        case UIElementType.CGGallery:
            const gallery = element as UICGGalleryElement;
            const cols = gallery.columns || 4;
            const cgGalleryEntries = Object.values(project.cgGallery?.entries || {});
            const filteredEntries = gallery.categoryFilter
                ? cgGalleryEntries.filter(e => e.category === gallery.categoryFilter)
                : cgGalleryEntries;
            const displayCount = Math.min(filteredEntries.length || cols * 2, cols * 3);
            return <div className="w-full h-full overflow-hidden rounded p-2" style={{ backgroundColor: gallery.backgroundColor || 'rgba(15, 23, 42, 0.9)' }}>
                <div className="grid gap-1 h-full" style={{
                    gridTemplateColumns: `repeat(${cols}, 1fr)`,
                    gap: `${gallery.gap || 8}px`,
                }}>
                    {Array.from({ length: displayCount }).map((_, i) => {
                        const entry = filteredEntries[i];
                        const isLocked = entry?.unlockable;
                        return <div key={i} className="flex items-center justify-center text-xs" style={{
                            backgroundColor: isLocked ? (gallery.lockedColor || '#1e293b') : '#334155',
                            borderRadius: `${gallery.thumbnailBorderRadius || 8}px`,
                            border: `1px solid ${gallery.thumbnailBorderColor || '#4D3273'}`,
                            aspectRatio: '16/9',
                            overflow: 'hidden',
                        }}>
                            {entry ? (isLocked ? (gallery.lockedText || '🔒') : (entry.name || 'CG')) : ''}
                        </div>;
                    })}
                </div>
            </div>;
        default:
            return <div className="w-full h-full bg-red-500/20 text-red-300">Unknown Element</div>;
    }
}


const MenuEditor: React.FC<{
    activeScreenId: VNID,
    selectedElementIds: VNID[],
    setSelectedElementIds: (ids: VNID[]) => void,
    /** True while the Live Preview overlay is open — canvas drops its <video> backgrounds then. */
    isPlaying?: boolean,
}> = ({ activeScreenId, selectedElementIds, setSelectedElementIds, isPlaying }) => {
    const { t } = useTranslation('ui');
    const { project, dispatch } = useProject();
    const toast = useToast();
    const screen = project.uiScreens[activeScreenId];
    const [showWizard, setShowWizard] = useState(false);
    // Bumped when Test Play closes so the canvas <video> backgrounds remount (the browser evicts
    // a video that sat behind the fullscreen preview and won't auto-resume otherwise).
    const [videoReloadNonce, setVideoReloadNonce] = useState(0);
    useEffect(() => {
        const onPlayEnded = () => setVideoReloadNonce(n => n + 1);
        window.addEventListener('flourish:playended', onPlayEnded);
        return () => window.removeEventListener('flourish:playended', onPlayEnded);
    }, []);
    const [showCGGalleryWizard, setShowCGGalleryWizard] = useState(false);
    const [showShopWizard, setShowShopWizard] = useState(false);
    const [showInventoryWizard, setShowInventoryWizard] = useState(false);
    const [showTemplateSelector, setShowTemplateSelector] = useState(false);

    const stageRef = useRef<HTMLDivElement>(null);
    const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
    const rafRef = useRef<number | null>(null);
    
    // Clipboard for copy/cut/paste (persists across renders via ref)
    const clipboardRef = useRef<{ elements: VNUIElement[]; isCut: boolean }>({ elements: [], isCut: false });

    // Defer rendering elements to give the browser time to settle
    const [isReady, setIsReady] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setIsReady(true), 50);
        return () => clearTimeout(timer);
    }, [activeScreenId]);

    useLayoutEffect(() => {
        const updateSize = () => {
            // Cancel any pending RAF to avoid rapid updates
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
            }
            rafRef.current = requestAnimationFrame(() => {
                if (stageRef.current) {
                    const rect = stageRef.current.getBoundingClientRect();
                    // Only update if size actually changed
                    setStageSize(prev => {
                        if (prev.width === rect.width && prev.height === rect.height) {
                            return prev;
                        }
                        return { width: rect.width, height: rect.height };
                    });
                }
            });
        };
        const resizeObserver = new ResizeObserver(updateSize);
        if (stageRef.current) {
            resizeObserver.observe(stageRef.current);
        }
        updateSize();
        return () => {
            resizeObserver.disconnect();
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, [activeScreenId]);

    // --- Clipboard helpers (hooks must be above early return) ---
    const generateNewId = (): VNID => `elem-${Math.random().toString(36).substring(2, 9)}` as VNID;

    const handleCopy = useCallback(() => {
        if (!screen || selectedElementIds.length === 0) return;
        const elements = selectedElementIds
            .map(id => screen.elements[id])
            .filter(Boolean) as VNUIElement[];
        clipboardRef.current = { elements: JSON.parse(JSON.stringify(elements)), isCut: false };
        toast.info(`Copied ${elements.length} element${elements.length > 1 ? 's' : ''}`, { duration: 1500 });
    }, [screen, selectedElementIds, toast]);

    const handleCut = useCallback(() => {
        if (!screen || selectedElementIds.length === 0) return;
        const elements = selectedElementIds
            .map(id => screen.elements[id])
            .filter(Boolean) as VNUIElement[];
        clipboardRef.current = { elements: JSON.parse(JSON.stringify(elements)), isCut: true };
        // Delete originals
        selectedElementIds.forEach(id => {
            dispatch({ type: 'DELETE_UI_ELEMENT', payload: { screenId: activeScreenId, elementId: id } });
        });
        setSelectedElementIds([]);
        toast.info(`Cut ${elements.length} element${elements.length > 1 ? 's' : ''}`, { duration: 1500 });
    }, [screen, selectedElementIds, activeScreenId, dispatch, setSelectedElementIds, toast]);

    const handlePaste = useCallback(() => {
        const { elements, isCut } = clipboardRef.current;
        if (elements.length === 0) return;
        const newIds: VNID[] = [];
        elements.forEach(el => {
            const newId = generateNewId();
            const clone: VNUIElement = {
                ...JSON.parse(JSON.stringify(el)),
                id: newId,
                name: isCut ? el.name : `${el.name} (copy)`,
                // Offset pasted elements slightly so they don't overlap originals
                x: el.x + (isCut ? 0 : 2),
                y: el.y + (isCut ? 0 : 2),
            };
            dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId: activeScreenId, element: clone } });
            newIds.push(newId);
        });
        setSelectedElementIds(newIds);
        toast.info(`Pasted ${newIds.length} element${newIds.length > 1 ? 's' : ''}`, { duration: 1500 });
        // After a cut-paste, clear the clipboard so it doesn't paste again as cut
        if (isCut) {
            clipboardRef.current = { elements: [], isCut: false };
        }
    }, [activeScreenId, dispatch, setSelectedElementIds, toast]);

    const handleDeleteSelected = useCallback(() => {
        if (selectedElementIds.length === 0) return;
        const count = selectedElementIds.length;
        selectedElementIds.forEach(id => {
            dispatch({ type: 'DELETE_UI_ELEMENT', payload: { screenId: activeScreenId, elementId: id } });
        });
        setSelectedElementIds([]);
        toast.info(`Deleted ${count} element${count > 1 ? 's' : ''}`, { duration: 1500 });
    }, [selectedElementIds, activeScreenId, dispatch, setSelectedElementIds, toast]);

    const handleSelectAll = useCallback(() => {
        if (!screen) return;
        const allIds = Object.keys(screen.elements) as VNID[];
        setSelectedElementIds(allIds);
        toast.info(`Selected ${allIds.length} element${allIds.length > 1 ? 's' : ''}`, { duration: 1500 });
    }, [screen, setSelectedElementIds, toast]);

    // --- Keyboard shortcuts ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Skip if in input/textarea
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return;
            }
            // Only handle if we're on the UI tab (screen is active)
            if (!screen) return;

            const isCtrl = e.ctrlKey || e.metaKey;

            if (isCtrl && e.key === 'c') {
                e.preventDefault();
                handleCopy();
            } else if (isCtrl && e.key === 'x') {
                e.preventDefault();
                handleCut();
            } else if (isCtrl && e.key === 'v') {
                e.preventDefault();
                handlePaste();
            } else if (isCtrl && e.key === 'a') {
                e.preventDefault();
                handleSelectAll();
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                handleDeleteSelected();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [screen, handleCopy, handleCut, handlePaste, handleSelectAll, handleDeleteSelected]);

    // Early return AFTER all hooks to satisfy Rules of Hooks
    if (!screen) return <Panel title={t('menuEditor.title')}>{t('menuEditor.screenNotFound')}</Panel>;

    const handleUpdateElement = (elementId: VNID, updates: Partial<VNUIElement>) => {
        dispatch({ type: 'UPDATE_UI_ELEMENT', payload: { screenId: activeScreenId, elementId, updates } });
    };

    /** Hot spots / draggable elements / image maps are all `VNUIElement` entries
     *  in `screen.elements`. The overlay components emit geometric patches
     *  (`{x, y, width, height}`) which apply identically to all element types. */
    const handleUpdateInteractive = useCallback((elementId: VNID, updates: { x?: number; y?: number; width?: number; height?: number }) => {
        dispatch({
            type: 'UPDATE_UI_ELEMENT',
            payload: { screenId: activeScreenId, elementId, updates: updates as Partial<VNUIElement> },
        });
    }, [dispatch, activeScreenId]);
    
    const handleAddElement = (type: UIElementType) => {
        const newElement = createUIElement(type, project);
        if (newElement) {
            dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId: activeScreenId, element: newElement } });
            setSelectedElementIds([newElement.id]);
        }
    };

    const handleAddVideoElement = () => {
        const newElement = createUIElement(UIElementType.Image, project) as UIImageElement;
        if (newElement) {
            // Pre-configure as a video element
            newElement.name = 'Video';
            newElement.background = { type: 'video', assetId: null };
            newElement.image = null;
            dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId: activeScreenId, element: newElement } });
            setSelectedElementIds([newElement.id]);
        }
    };

    // --- Selection helpers ---
    const elementRadial = useElementRadial();

    const handleSelectElement = (elementId: VNID, e: React.MouseEvent) => {
        if (e.ctrlKey || e.metaKey) {
            // Toggle element in multi-select
            setSelectedElementIds(
                selectedElementIds.includes(elementId)
                    ? selectedElementIds.filter(id => id !== elementId)
                    : [...selectedElementIds, elementId]
            );
        } else {
            // Single select
            setSelectedElementIds([elementId]);
        }
    };

    // Right-click an element on the canvas → open its group radial menu.
    const handleElementContextMenu = (elementId: VNID, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        elementRadial?.openByElementId(elementId, e.clientX, e.clientY);
    };

    const handleWizardGenerate = (config: GeneratedConfig) => {
        const character = project.characters[config.characterId];
        if (!character) return;

        // 1. Create variables
        config.variables.forEach(varConfig => {
            dispatch({
                type: 'ADD_VARIABLE',
                payload: {
                    id: varConfig.id,
                    name: varConfig.name,
                    type: 'string',
                    defaultValue: ''
                }
            });
        });

        // 2. Create asset cyclers (positioned vertically on the left)
        let yPosition = 10;
        config.cyclers.forEach((cyclerConfig, index) => {
            const layer = character.layers[cyclerConfig.layerId];
            const cyclerElement = createUIElement(UIElementType.AssetCycler, project) as UIAssetCyclerElement;
            if (cyclerElement) {
                cyclerElement.name = `${cyclerConfig.label} Cycler`;
                cyclerElement.characterId = config.characterId;
                cyclerElement.layerId = cyclerConfig.layerId;
                cyclerElement.variableId = cyclerConfig.variableId;
                cyclerElement.assetIds = cyclerConfig.assetIds;
                cyclerElement.label = cyclerConfig.label;
                cyclerElement.x = 5;
                cyclerElement.y = yPosition;
                cyclerElement.width = 35;
                cyclerElement.height = 12;
                
                // Add asset conditions if this is a conditional cycler
                if (cyclerConfig.assetConditions && cyclerConfig.assetConditions.length > 0) {
                    cyclerElement.assetConditions = cyclerConfig.assetConditions;
                }
                
                dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId: activeScreenId, element: cyclerElement } });
                yPosition += 15;
            }
        });

        // 3. Create character preview (on the right side)
        const previewElement = createUIElement(UIElementType.CharacterPreview, project) as UICharacterPreviewElement;
        if (previewElement) {
            previewElement.name = `${character.name} Preview`;
            previewElement.characterId = config.characterId;
            previewElement.layerVariableMap = config.preview.layerVariableMap;
            previewElement.x = 45;
            previewElement.y = 5;
            previewElement.width = 50;
            previewElement.height = 85;
            dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId: activeScreenId, element: previewElement } });
        }

        // 4. Create a "Done" button at the bottom
        const buttonElement = createUIElement(UIElementType.Button, project) as UIButtonElement;
        if (buttonElement) {
            buttonElement.name = 'Done Button';
            buttonElement.text = 'Done';
            buttonElement.x = 5;
            buttonElement.y = 85;
            buttonElement.width = 35;
            buttonElement.height = 8;
            buttonElement.actions = [{ type: 'CloseScreen' }];
            dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId: activeScreenId, element: buttonElement } });
        }
    };

    const handleCGGalleryGenerate = (config: CGGalleryGeneratedConfig) => {
        // 1. Create unlock variables (if locked by default)
        config.unlockVariables.forEach(varConfig => {
            dispatch({
                type: 'ADD_VARIABLE',
                payload: {
                    id: varConfig.id,
                    name: varConfig.name,
                    type: 'boolean',
                    defaultValue: false,
                },
            });
        });

        // 2. Set the CG Gallery config on the project
        dispatch({ type: 'UPDATE_PROJECT', payload: { cgGallery: config.galleryConfig } });

        // 2. Add the CG Gallery UI element to the current screen
        dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId: activeScreenId, element: config.galleryElement } });

        // 3. Add a "Close" button below the gallery
        const buttonElement = createUIElement(UIElementType.Button, project) as UIButtonElement;
        if (buttonElement) {
            buttonElement.name = 'Close Gallery';
            buttonElement.text = 'Close';
            buttonElement.x = 35;
            buttonElement.y = 90;
            buttonElement.width = 30;
            buttonElement.height = 7;
            buttonElement.actions = [{ type: 'CloseScreen' }];
            dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId: activeScreenId, element: buttonElement } });
        }
    };
    
    // Resolve the background by the ACTUAL asset, not the declared type — a video can be picked
    // under an 'image' background (the image picker lists videos), which must still render as a video.
    const bgAssetId = screen.background.type !== 'color' ? screen.background.assetId : null;
    const bgAsset: any = bgAssetId ? (project.backgrounds[bgAssetId] || project.images?.[bgAssetId] || project.videos[bgAssetId]) : null;
    const bgIsVideo = !!(bgAsset && (bgAsset.isVideo || bgAsset.videoUrl));
    const mainBgVideoUrl = bgIsVideo ? bgAsset.videoUrl : null;
    const getBackground = () => {
        if (screen.background.type === 'color') return { backgroundColor: screen.background.value };
        // Video backgrounds can't be a CSS background-image — they render as a <video> child below.
        if (bgIsVideo) return {};
        if (bgAsset?.imageUrl) return { backgroundImage: `url(${bgAsset.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' };
        return {};
    };

    return (
        <div className="flex-grow flex flex-col gap-4 min-h-0 p-4">
            {/* Canvas Panel - Fills available space above the toolbar */}
            <Panel 
                title={`Editing Menu: ${screen.name}`} 
                className="flex-1 min-h-0"
            >
                <div className="bg-slate-900/50 rounded-md relative overflow-hidden mx-auto" ref={stageRef}
                    onMouseDown={() => setSelectedElementIds([])}
                    style={{
                        ...getBackground(),
                        // Confine element `layer` z-indices to this canvas (own stacking context)
                        // so a layered element never floats above the editor chrome.
                        isolation: 'isolate',
                        aspectRatio: `${project.gameResolution?.width || 16} / ${project.gameResolution?.height || 9}`,
                        maxWidth: '100%',
                        maxHeight: '100%',
                        width: '100%',
                        '--font-scale': stageSize.width > 0 ? stageSize.width / (project.gameResolution?.width || 1920) : 1,
                    } as React.CSSProperties}
                >
                    {/* Main video background — CSS can't show a video, so render a real <video>.
                        Dropped while Test Play is open (it's covered by the overlay): the browser
                        evicts an offscreen video behind a fullscreen overlay and won't re-fire
                        autoPlay, leaving it broken/blank on return — so we unmount it during play
                        and let it mount fresh when the editor is shown again. */}
                    {mainBgVideoUrl && !isPlaying && (
                        <video key={`mainbg-${videoReloadNonce}`} ref={(el) => { if (el) el.play().catch(() => {}); }} src={mainBgVideoUrl} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" style={{ zIndex: 0 }} />
                    )}

                    {/* Additional background planes (multi-plane parallax) — shown at their layer
                        so the author can arrange them. Static here (no parallax drift). */}
                    {(screen.additionalBackgrounds || []).map(b => {
                        if (b.background.type === 'color') {
                            return <div key={b.id} className="absolute inset-0" style={{ zIndex: b.layer ?? 0, backgroundColor: b.background.value }} />;
                        }
                        // Detect video by the actual asset, not the declared type.
                        const planeAsset: any = b.background.assetId ? (project.backgrounds[b.background.assetId] || project.images?.[b.background.assetId] || project.videos[b.background.assetId]) : null;
                        const planeIsVideo = !!(planeAsset && (planeAsset.isVideo || planeAsset.videoUrl));
                        const url = planeAsset ? (planeIsVideo ? planeAsset.videoUrl : planeAsset.imageUrl) : null;
                        if (!url) return null;
                        const planeScale = b.parallaxDepth ? { transform: 'scale(1.15)', transformOrigin: 'center' } as const : undefined;
                        return (
                            <div key={b.id} className="absolute inset-0 overflow-hidden" style={{ zIndex: b.layer ?? 0 }}>
                                {planeIsVideo
                                    ? (!isPlaying && <video key={`v-${videoReloadNonce}`} ref={(el) => { if (el) el.play().catch(() => {}); }} src={url} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" style={planeScale} />)
                                    : <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover" style={planeScale} />}
                            </div>
                        );
                    })}

                    {/* Standard UI elements (non-interactive). Hot spots, image maps, and any
                        draggable element are skipped here — they render via the dedicated
                        interactive-element overlays below, read from `screen.elements`. */}
                    {isReady && stageSize.width > 0 && Object.values(screen.elements).map((element: VNUIElement) => {
                        if (isInteractiveElement(element)) return null;
                        return (
                            <ResizableDraggable
                                key={element.id}
                                x={element.x} y={element.y}
                                width={element.width} height={element.height}
                                anchorX={element.anchorX} anchorY={element.anchorY}
                                parentSize={stageSize}
                                isSelected={selectedElementIds.includes(element.id)}
                                onSelect={(e) => {
                                    e.stopPropagation();
                                    handleSelectElement(element.id, e);
                                }}
                                onUpdate={updates => handleUpdateElement(element.id, updates)}
                                onContextMenu={(e) => handleElementContextMenu(element.id, e)}
                                zIndex={(element as any).layer ?? 0}
                                snapGrid={1}
                            >
                                <SafeUIElementRenderer element={element} project={project} />
                            </ResizableDraggable>
                        );
                    })}

                    {/* Interactive-element overlays. Hot spots, image maps, and draggables are typed
                        entries in screen.elements — the overlay components consume them directly. */}
                    {isReady && stageSize.width > 0 && Object.values(screen.elements).map((el: VNUIElement) => {
                        if (isHotSpotElement(el)) {
                            return (
                                <HotSpotOverlay
                                    key={el.id}
                                    spot={el}
                                    isSelected={selectedElementIds.includes(el.id)}
                                    parentSize={stageSize}
                                    onSelect={(e) => {
                                        e.stopPropagation();
                                        handleSelectElement(el.id, e);
                                    }}
                                    onUpdate={updates => handleUpdateInteractive(el.id, updates)}
                                    onContextMenu={(e) => handleElementContextMenu(el.id, e)}
                                    zIndex={(el as any).layer ?? 0}
                                />
                            );
                        }
                        if (isInteractiveElement(el)) {
                            return (
                                <InteractiveElementOverlay
                                    key={el.id}
                                    element={el}
                                    project={project}
                                    isSelected={selectedElementIds.includes(el.id)}
                                    parentSize={stageSize}
                                    onSelect={(e) => {
                                        e.stopPropagation();
                                        handleSelectElement(el.id, e);
                                    }}
                                    onUpdate={updates => handleUpdateInteractive(el.id, updates)}
                                    onContextMenu={(e) => handleElementContextMenu(el.id, e)}
                                    zIndex={(el as any).layer ?? 0}
                                />
                            );
                        }
                        return null;
                    })}
                </div>
            </Panel>
            
            {/* Element Toolbar - Always Visible */}
            <div className="flex-shrink-0 space-y-2">
                {/* Template Wizard Button - Prominent placement */}
                <button 
                    onClick={() => setShowTemplateSelector(true)} 
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 p-3 rounded-md flex items-center justify-center gap-2 font-semibold text-sm shadow-lg border border-purple-400/30"
                >
                    <SparklesIcon className="w-5 h-5" /> Template Wizard
                </button>
                
                {/* Individual Element Buttons */}
                <div className="grid grid-cols-2 md:grid-cols-11 gap-2">
                    <button onClick={() => handleAddElement(UIElementType.Button)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> Button</button>
                    <button onClick={() => handleAddElement(UIElementType.Text)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> Text</button>
                    <button onClick={() => handleAddElement(UIElementType.Image)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> Image</button>
                    <button onClick={handleAddVideoElement} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> Video</button>
                    <button onClick={() => handleAddElement(UIElementType.CharacterPreview)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> Character</button>
                    <button onClick={() => handleAddElement(UIElementType.TextInput)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> Text Input</button>
                    <button onClick={() => handleAddElement(UIElementType.Dropdown)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> Dropdown</button>
                    <button onClick={() => handleAddElement(UIElementType.Checkbox)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> Checkbox</button>
                    <button onClick={() => handleAddElement(UIElementType.AssetCycler)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> Cycler</button>
                    <button onClick={() => handleAddElement(UIElementType.SettingsSlider)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> Slider</button>
                    <button onClick={() => handleAddElement(UIElementType.SettingsToggle)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> Toggle</button>
                    <button onClick={() => handleAddElement(UIElementType.CGGallery)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> CG Gallery</button>
                </div>
            </div>
            
            {/* Template Selector Modal */}
            {showTemplateSelector && (
                <div 
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm"
                    onClick={(e) => e.target === e.currentTarget && setShowTemplateSelector(false)}
                >
                    <div className="bg-gradient-to-b from-[var(--bg-tertiary)] to-[var(--bg-secondary)] rounded-xl shadow-2xl w-full max-w-md p-6 m-4 border border-[var(--border-default)]">
                        <h2 className="text-xl font-bold mb-2 text-center">{t('menuEditor.templateWizard')}</h2>
                        <p className="text-sm text-slate-400 text-center mb-6">{t('menuEditor.chooseTemplate')}</p>
                        
                        <div className="space-y-3">
                            <button
                                onClick={() => {
                                    setShowTemplateSelector(false);
                                    setShowWizard(true);
                                }}
                                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 p-4 rounded-lg flex items-center gap-4 text-left transition-all hover:scale-[1.02]"
                            >
                                <div className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center text-2xl">👤</div>
                                <div>
                                    <div className="font-semibold">{t('menuEditor.charCustomizer')}</div>
                                    <div className="text-xs text-white/70">{t('menuEditor.charCustomizerDesc')}</div>
                                </div>
                            </button>
                            
                            <button
                                onClick={() => {
                                    setShowTemplateSelector(false);
                                    setShowCGGalleryWizard(true);
                                }}
                                className="w-full bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 p-4 rounded-lg flex items-center gap-4 text-left transition-all hover:scale-[1.02]"
                            >
                                <div className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center text-2xl">🖼️</div>
                                <div>
                                    <div className="font-semibold">{t('menuEditor.cgGallery')}</div>
                                    <div className="text-xs text-white/70">{t('menuEditor.cgGalleryDesc')}</div>
                                </div>
                            </button>
                        </div>
                        
                        <button
                            onClick={() => setShowTemplateSelector(false)}
                            className="w-full mt-6 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                        >
                            {t('menuEditor.cancel')}
                        </button>
                    </div>
                </div>
            )}
            
            {/* Character Customization Wizard */}
            <CharacterCustomizationWizard
                isOpen={showWizard}
                onClose={() => setShowWizard(false)}
                project={project}
                screenId={activeScreenId}
                onGenerate={handleWizardGenerate}
            />

            {/* CG Gallery Wizard */}
            <CGGalleryWizard
                isOpen={showCGGalleryWizard}
                onClose={() => setShowCGGalleryWizard(false)}
                project={project}
                screenId={activeScreenId}
                onGenerate={handleCGGalleryGenerate}
            />

            {/* Shop & Inventory System Wizards — generate a dedicated screen of native
                elements (items become registry items backed by count variables). */}
            <SystemWizard
                isOpen={showShopWizard}
                kind="shop"
                project={project}
                onClose={() => setShowShopWizard(false)}
                onGenerate={(result) => applySystemWizardResult(result, project, dispatch)}
            />
            <SystemWizard
                isOpen={showInventoryWizard}
                kind="inventory"
                project={project}
                onClose={() => setShowInventoryWizard(false)}
                onGenerate={(result) => applySystemWizardResult(result, project, dispatch)}
            />
        </div>
    );
};

export default MenuEditor;