import React, { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
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
import { PlusIcon, SparklesIcon } from '../icons';
import CharacterCustomizationWizard, { GeneratedConfig } from './CharacterCustomizationWizard';
import CGGalleryWizard, { CGGalleryGeneratedConfig } from './CGGalleryWizard';

// Safe wrapper for element rendering to prevent crashes.
const SafeUIElementRenderer: React.FC<{ element: VNUIElement, project: VNProject }> = ({ element, project }) => {
    try {
        return (
            <div style={{ opacity: element.opacity ?? 1, width: '100%', height: '100%', overflow: 'hidden' }}>
                <UIElementRenderer element={element} project={project} />
            </div>
        );
    } catch (err) {
        console.error('Error rendering UI element:', element.id, err);
        return <div className="w-full h-full bg-red-500/20 text-red-300 text-xs p-1">Render Error</div>;
    }
};

const UIElementRenderer: React.FC<{ element: VNUIElement, project: VNProject }> = ({ element, project }) => {
    if (!element) {
        return <div className="w-full h-full bg-yellow-500/20">No element</div>;
    }
    
    switch (element.type) {
        case UIElementType.Button: {
            const btn = element as UIButtonElement;
            // Use stored backgroundColor or default purple theme color
            const buttonBg = btn.backgroundColor || '#4D3273';
            // Resolve button image background (same logic as LivePreview)
            const btnImageUrl = btn.image ? (
                btn.image.type === 'video'
                    ? project.videos[btn.image.id]?.videoUrl
                    : project.images[btn.image.id]?.imageUrl || project.backgrounds[btn.image.id]?.imageUrl
            ) : null;
            const btnAlignClass = { left: 'justify-start', center: 'justify-center', right: 'justify-end' }[btn.font?.align || 'center'];
            return <div
                className={`w-full h-full border border-white/20 rounded flex items-center ${btnAlignClass} relative overflow-hidden`}
                style={{ pointerEvents: 'none' }}
            >
                {btnImageUrl ? (
                    <img src={btnImageUrl} alt="" className="absolute inset-0 w-full h-full object-fill" />
                ) : (
                    <div className="absolute inset-0 w-full h-full rounded" style={{ backgroundColor: buttonBg }} />
                )}
                <span className="relative z-10" style={{...fontSettingsToStyle(btn.font), ...(extractTextGradientStyle(btn.font) || {})}}>{btn.text}</span>
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
                <div><span style={extractTextGradientStyle(txt.font) || undefined}>{txt.text}</span></div>
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
                bgType === 'video' ? project.videos[bgValue]?.videoUrl : 
                project.images[bgValue]?.imageUrl || project.backgrounds[bgValue]?.imageUrl
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
            return (
                <div className="w-full h-full grid grid-cols-2 gap-2 p-2 overflow-hidden">
                    {Array.from({ length: Math.min(slotEl.slotCount, 4) }).map((_, i) => (
                        <div 
                            key={i} 
                            className="rounded-md border-2 p-2 flex flex-col"
                            style={{ 
                                backgroundColor: slotBgColor,
                                borderColor: slotBorderColor,
                            }}
                        >
                            <span className="text-xs font-bold" style={{ color: slotHeaderColor }}>Slot {i + 1}</span>
                            <span className="text-[10px] opacity-50" style={{...fontSettingsToStyle(slotEl.font), ...(extractTextGradientStyle(slotEl.font) || {})}}>{slotEl.emptySlotText}</span>
                        </div>
                    ))}
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
                <span style={extractTextGradientStyle(tog.font) || undefined}>{tog.text}</span>
            </div>;
        case UIElementType.CharacterPreview:
             const charEl = element as UICharacterPreviewElement;
             const char = project.characters[charEl.characterId] as VNCharacter | undefined;
             if (!char) {
                 return <div className="w-full h-full border-2 border-dashed border-[var(--bg-tertiary)] flex items-center justify-center text-[var(--text-secondary)]">
                     <span className="bg-black/50 p-1 rounded">No Character Selected</span>
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
                <span style={{
                    ...fontSettingsToStyle(checkbox.font),
                    ...(extractTextGradientStyle(checkbox.font) || {}),
                    color: checkbox.labelColor || '#f1f5f9'
                }}>
                    {checkbox.label}
                </span>
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
                        <span style={extractTextGradientStyle(cycler.font) || undefined}>{cycler.label}</span>
                    </div>
                )}
                <div className="flex items-center gap-3 w-full">
                    <div style={{ color: cycler.arrowColor || '#a855f7', fontSize: `calc(var(--font-scale, 1) * ${cycler.arrowSize || 24}px)` }}>◀</div>
                    <div className="flex-1 text-center overflow-hidden" style={fontSettingsToStyle(cycler.font)}>
                        <span style={extractTextGradientStyle(cycler.font) || undefined}>{cycler.showAssetName && firstAsset ? firstAsset.name : `1 / ${cycler.assetIds.length}`}</span>
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
}> = ({ activeScreenId, selectedElementIds, setSelectedElementIds }) => {
    const { project, dispatch } = useProject();
    const toast = useToast();
    const screen = project.uiScreens[activeScreenId];
    const [showWizard, setShowWizard] = useState(false);
    const [showCGGalleryWizard, setShowCGGalleryWizard] = useState(false);
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
    if (!screen) return <Panel title="Menu Editor">Screen not found</Panel>;

    const handleUpdateElement = (elementId: VNID, updates: Partial<VNUIElement>) => {
        dispatch({ type: 'UPDATE_UI_ELEMENT', payload: { screenId: activeScreenId, elementId, updates } });
    };
    
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
    
    const getBackground = () => {
        if (screen.background.type === 'color') return { backgroundColor: screen.background.value };
        if (screen.background.assetId) {
             const url = screen.background.type === 'image' 
                ? (project.backgrounds[screen.background.assetId]?.imageUrl || project.images?.[screen.background.assetId]?.imageUrl)
                : project.videos[screen.background.assetId]?.videoUrl;
            if (url) return { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' };
        }
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
                        aspectRatio: `${project.gameResolution?.width || 16} / ${project.gameResolution?.height || 9}`,
                        maxWidth: '100%',
                        maxHeight: '100%',
                        width: '100%',
                        '--font-scale': stageSize.width > 0 ? stageSize.width / (project.gameResolution?.width || 1920) : 1,
                    } as React.CSSProperties}
                >
                    {isReady && stageSize.width > 0 && Object.values(screen.elements).map((element: VNUIElement) => (
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
                            snapGrid={1}
                        >
                            <SafeUIElementRenderer element={element} project={project} />
                        </ResizableDraggable>
                    ))}
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
                        <h2 className="text-xl font-bold mb-2 text-center">✨ Template Wizard</h2>
                        <p className="text-sm text-slate-400 text-center mb-6">Choose a template to get started quickly</p>
                        
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
                                    <div className="font-semibold">Character Customizer</div>
                                    <div className="text-xs text-white/70">Create a character customization screen with layer cyclers</div>
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
                                    <div className="font-semibold">CG Gallery</div>
                                    <div className="text-xs text-white/70">Create a CG art gallery with unlockable entries</div>
                                </div>
                            </button>

                            <button
                                onClick={() => {
                                    setShowTemplateSelector(false);
                                    // TODO: Open shop wizard
                                    alert('Shop Template coming soon!');
                                }}
                                className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 p-4 rounded-lg flex items-center gap-4 text-left transition-all hover:scale-[1.02]"
                            >
                                <div className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center text-2xl">🛒</div>
                                <div>
                                    <div className="font-semibold">Shop Template</div>
                                    <div className="text-xs text-white/70">Create an in-game shop with items and currency</div>
                                </div>
                            </button>
                        </div>
                        
                        <button
                            onClick={() => setShowTemplateSelector(false)}
                            className="w-full mt-6 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                        >
                            Cancel
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
        </div>
    );
};

export default MenuEditor;