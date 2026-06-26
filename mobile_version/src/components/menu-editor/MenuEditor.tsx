import React, { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Panel from '../ui/Panel';
import { useProject } from '../../contexts/ProjectContext';
import { useToast } from '../../contexts/ToastContext';
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import { VNUIScreen, VNUIElement, UIElementType, UISettingsSliderElement, UISettingsToggleElement, UIButtonElement, UITextElement, UIImageElement, UISaveSlotGridElement, UICharacterPreviewElement, UITextInputElement, UIDropdownElement, UICheckboxElement, UIAssetCyclerElement, UICGGalleryElement, UIInventoryGridElement, UIMeterElement, UICustomizerElement, UICustomElement } from '../../features/ui/types';
import { VNCharacter, VNCharacterLayer } from '../../features/character/types';
import { UIActionType } from '../../types/shared';
import ResizableDraggable from './ResizableDraggable';
import { createUIElement, createCustomUIElement } from '../../utils/uiElementFactory';
import { pluginManager } from '../../features/plugins/PluginManagerService';
import { useExtensionUIElementTypes } from '../ExtensionPanelsHost';
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
        // Start-hidden elements stay fully visible/selectable in the editor (so authors can place
        // and edit them), but render dimmed with a badge so it's obvious they begin hidden at runtime.
        const startsHidden = !!element.startHidden;
        return (
            <div style={{ opacity: (element.opacity ?? 1) * (startsHidden ? 0.45 : 1), width: '100%', height: '100%', overflow: 'hidden' }}>
                <UIElementRenderer element={element} project={project} />
                {startsHidden && (
                    <div style={{ position: 'absolute', top: 2, left: 2, zIndex: 10, background: 'rgba(2,6,23,0.8)', color: '#fbbf24', fontSize: 9, lineHeight: '12px', padding: '1px 4px', borderRadius: 3, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                        {t('menuEditor.startsHiddenBadge', '◌ hidden')}
                    </div>
                )}
            </div>
        );
    } catch (err) {
        console.error('Error rendering UI element:', element.id, err);
        return <div className="w-full h-full bg-red-500/20 text-red-300 text-xs p-1">{t('menuEditor.renderError')}</div>;
    }
};

// ── Free-placement slot editing ──────────────────────────────────────────────
// When a SaveSlotGrid / CGGallery element is in `slotLayout: 'free'`, each slot is
// positioned individually. We render one ResizableDraggable per slot rect so the
// author drags/resizes each box exactly like any other element. All slots map to a
// single parent element; selecting a slot selects that element's inspector.

/** Static preview of a single slot, matching the in-game look (empty save card / CG thumb). */
const FreeSlotPreview: React.FC<{ element: UISaveSlotGridElement | UICGGalleryElement, index: number, ring: boolean }> = ({ element, index, ring }) => {
    const ringShadow = ring ? '0 0 0 1px rgba(56,189,248,0.7)' : undefined;
    if (element.type === UIElementType.SaveSlotGrid) {
        const el = element as UISaveSlotGridElement;
        const slotBgColor = el.slotBackgroundColor || '#1e293b';
        const slotBorderColor = el.slotBorderColor || '#475569';
        const slotHeaderColor = el.slotHeaderColor || '#7dd3fc';
        const baseFont = fontSettingsToStyle(el.font);
        const emptyStyle = el.emptySlotFont
            ? fontSettingsToStyle(el.emptySlotFont)
            : { color: el.emptySlotTextColor || '#a0aec0', fontSize: baseFont.fontSize, fontFamily: baseFont.fontFamily };
        return (
            <div style={{ width: '100%', height: '100%', backgroundColor: slotBgColor, border: `2px solid ${slotBorderColor}`, borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: ringShadow }}>
                <div style={{ position: 'relative', flex: '1 1 0', minHeight: 0 }}>
                    <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8%' }}>
                        <span style={{ ...emptyStyle, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{el.emptySlotText}</span>
                    </div>
                    {!el.hideSlotLabel && (
                        <div style={{ position: 'absolute', top: 4, left: 4, ...baseFont, color: slotHeaderColor, fontWeight: 'bold', textShadow: '0 2px 4px rgba(0,0,0,0.7)' }}>Slot {index + 1}</div>
                    )}
                </div>
                {!el.hideInfoBar && <div style={{ flex: '0 0 auto', padding: '4px 8px 6px', backgroundColor: 'rgba(0,0,0,0.35)' }} />}
            </div>
        );
    }
    const el = element as UICGGalleryElement;
    return (
        <div style={{ width: '100%', height: '100%', border: `2px solid ${el.thumbnailBorderColor || '#4D3273'}`, borderRadius: el.thumbnailBorderRadius ?? 8, backgroundColor: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: ringShadow }}>
            <span style={{ fontSize: 11, color: '#cbd5e1' }}>CG {index + 1}</span>
        </div>
    );
};

const FreeSlotHandles: React.FC<{
    element: UISaveSlotGridElement | UICGGalleryElement;
    parentSize: { width: number; height: number };
    isElementSelected: boolean;
    focusedSlot: string | null;
    onSelectSlot: (index: number, e: React.MouseEvent) => void;
    onUpdateSlot: (index: number, rect: { x: number; y: number; width: number; height: number }) => void;
    onContextMenu: (e: React.MouseEvent) => void;
}> = ({ element, parentSize, isElementSelected, focusedSlot, onSelectSlot, onUpdateSlot, onContextMenu }) => {
    const isSave = element.type === UIElementType.SaveSlotGrid;
    const allRects = element.slotRects || [];
    // Save grids cap visible slots at slotCount (the engine does too); galleries show every placed box.
    const rects = isSave ? allRects.slice(0, (element as UISaveSlotGridElement).slotCount) : allRects;
    const layer = (element as { layer?: number }).layer ?? 0;
    return (
        <>
            {rects.map((rect, i) => {
                if (!rect) return null;
                const key = `${element.id}:${i}`;
                const focused = isElementSelected && focusedSlot === key;
                return (
                    <ResizableDraggable
                        key={key}
                        x={rect.x} y={rect.y} width={rect.width} height={rect.height}
                        anchorX={0} anchorY={0}
                        parentSize={parentSize}
                        isSelected={focused}
                        onSelect={(e) => onSelectSlot(i, e)}
                        onUpdate={(u) => onUpdateSlot(i, u)}
                        onContextMenu={onContextMenu}
                        zIndex={layer}
                        snapGrid={1}
                        label={isSave ? `Slot ${i + 1}` : `CG ${i + 1}`}
                    >
                        <FreeSlotPreview element={element} index={i} ring={isElementSelected && !focused} />
                    </ResizableDraggable>
                );
            })}
        </>
    );
};

// Inventory grid preview for the editor canvas. Mirrors the in-game grid: when no fixed row count is set,
// it fills the element's box with (square) slots so the author sees the whole grid, not just filled cells.
const InventoryPreview: React.FC<{ inv: UIInventoryGridElement, project: VNProject }> = ({ inv, project }) => {
    const invCols = inv.columns || 4;
    const colGap = inv.columnGap ?? inv.gap ?? 8;
    const rowGap = inv.rowGap ?? inv.gap ?? 8;
    const boundColl = inv.collectionId ? project.itemCollections?.[inv.collectionId] : undefined;
    const everything = () => (Object.values(project.items || {}) as any[]).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const allItems = !boundColl
        ? everything()
        : (boundColl.tracksOwnedItems && boundColl.entries.length === 0)
            ? everything()
            : boundColl.entries.map(e => project.items?.[e.itemId]).filter(Boolean) as any[];
    const invItems = inv.categoryFilter ? allItems.filter(it => it.category === inv.categoryFilter) : allItems;

    const containerRef = useRef<HTMLDivElement>(null);
    const [autoRows, setAutoRows] = useState(0);
    useLayoutEffect(() => {
        if (inv.rows && inv.rows > 0) { setAutoRows(0); return; }
        const node = containerRef.current;
        if (!node) return;
        const compute = () => {
            const cs = window.getComputedStyle(node);
            const availW = node.clientWidth - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.paddingRight || '0');
            const availH = node.clientHeight - parseFloat(cs.paddingTop || '0') - parseFloat(cs.paddingBottom || '0');
            if (availW <= 0 || availH <= 0) return;
            const slotW = (availW - colGap * (invCols - 1)) / invCols;
            if (slotW <= 0) return;
            setAutoRows(Math.max(1, Math.floor((availH + rowGap) / (slotW + rowGap))));
        };
        compute();
        const ro = new ResizeObserver(compute);
        ro.observe(node);
        return () => ro.disconnect();
    }, [inv.rows, invCols, colGap, rowGap]);

    const minRows = (inv.rows && inv.rows > 0) ? inv.rows : Math.max(autoRows, 1);
    const slots = Math.max(invItems.length, invCols * minRows);
    return <div ref={containerRef} className="w-full h-full overflow-hidden rounded p-2" style={{ backgroundColor: inv.backgroundColor || 'rgba(15, 23, 42, 0.9)' }}>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${invCols}, 1fr)`, columnGap: `${colGap}px`, rowGap: `${rowGap}px` }}>
            {Array.from({ length: slots }).map((_, i) => {
                const it = invItems[i];
                const url = it?.icon?.id ? ((project.images[it.icon.id] as any)?.imageUrl || (project.videos?.[it.icon.id] as any)?.videoUrl) : null;
                return <div key={i} className="flex flex-col items-center justify-center text-[10px] text-white/80 p-1" style={{
                    backgroundColor: inv.slotColor || 'rgba(255,255,255,0.04)',
                    borderRadius: `${inv.slotBorderRadius ?? 8}px`,
                    border: `1px solid ${inv.slotBorderColor || '#4D3273'}`,
                    aspectRatio: '1 / 1', overflow: 'hidden',
                }}>
                    {url ? <img src={url} alt="" className="w-full flex-1 min-h-0 object-contain" /> : <span className="flex-1 min-h-0" />}
                    {it && inv.showNames !== false && <span className="truncate w-full text-center">{it.name}</span>}
                </div>;
            })}
        </div>
    </div>;
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
            // WYSIWYG with the engine's "fit to content": art shrinks to its fitted rect, centered.
            if (btn.fitToContent && btnImageUrl) {
                return <div className="w-full h-full flex items-center justify-center overflow-hidden" style={{ pointerEvents: 'none' }}>
                    <img src={btnImageUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', display: 'block' }} />
                    {btn.text && <GradientText className="absolute" style={{...fontSettingsToStyle(btn.font), ...(extractTextGradientStyle(btn.font) || {})}}>{btn.text}</GradientText>}
                </div>;
            }
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
            // WYSIWYG with the engine's "fit to content": media shrinks to its fitted rect, centered.
            const fit = !!img.fitToContent;
            const mediaStyle: React.CSSProperties = fit
                ? { maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit, display: 'block' }
                : { width: '100%', height: '100%', objectFit };

            if (bgType === 'video') {
                const v = <video
                    src={url}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="pointer-events-none"
                    style={mediaStyle}
                />;
                return fit ? <div className="w-full h-full flex items-center justify-center overflow-hidden">{v}</div> : <div className="w-full h-full">{v}</div>;
            }

            const im = <img src={url} alt="" style={mediaStyle} />;
            return fit ? <div className="w-full h-full flex items-center justify-center overflow-hidden">{im}</div> : <div className="w-full h-full">{im}</div>;
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
            const cgGalleryEntries = Object.values(project.cgGallery?.entries || {}) as any[];
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
        case UIElementType.Inventory:
            return <InventoryPreview inv={element as UIInventoryGridElement} project={project} />;
        case UIElementType.Meter: {
            // Editor preview: render with the bound variable's DEFAULT value (live values only exist in test-play).
            const m = element as UIMeterElement;
            const boundVar = m.variableId ? project.variables[m.variableId] : undefined;
            const raw = Number(boundVar?.defaultValue ?? 0);
            const min = m.minValue ?? (boundVar as any)?.min ?? 0;
            const max = m.maxValue ?? (boundVar as any)?.max ?? 100;
            const pct = Math.max(0, Math.min(1, (raw - min) / ((max - min) || 1)));
            const dir = m.direction || 'ltr';
            const cut = (1 - pct) * 100;
            const clipPath = dir === 'rtl' ? `inset(0 0 0 ${cut}%)` : dir === 'up' ? `inset(${cut}% 0 0 0)` : `inset(0 ${cut}% 0 0)`;
            const fill = m.fillColorEnd
                ? `linear-gradient(${dir === 'up' ? '0deg' : '90deg'}, ${m.fillColor || '#a78bfa'}, ${m.fillColorEnd})`
                : (m.fillColor || '#a78bfa');
            const radius = m.borderRadius ?? 6;
            const valueText = m.valueFormat === 'percent' ? `${Math.round(pct * 100)}%` : m.valueFormat === 'valueMax' ? `${raw}/${max}` : `${raw}`;
            // Repeated-symbol / hearts style: show the chosen image N times so the canvas matches test-play.
            if (m.style === 'icons') {
                const n = Math.max(1, m.iconCount ?? 3);
                const stepSize = m.iconStep === 'quarter' ? 0.25 : m.iconStep === 'half' ? 0.5 : 1;
                const iconUrl = (a?: { id: VNID } | null) => a ? ((project.images[a.id] as any)?.imageUrl || (project.backgrounds[a.id] as any)?.imageUrl || null) : null;
                const fullUrl = iconUrl(m.iconImage);
                const emptyUrl = iconUrl(m.iconEmptyImage);
                const iconSize = m.iconSize ?? 24;
                const iconGap = m.iconGap ?? 4;
                const filledUnits = pct * n;
                const alignToFlex = (a?: string) => a === 'center' ? 'center' : (a === 'right' || a === 'bottom') ? 'flex-end' : 'flex-start';
                return <div className="w-full h-full flex flex-col gap-0.5" style={{ justifyContent: alignToFlex(m.alignY), overflow: 'visible' }}>
                    {m.showLabel && <div className="text-[10px] text-white leading-tight truncate">{m.label || boundVar?.name || 'Meter'}</div>}
                    <div className="flex flex-wrap items-center" style={{ gap: iconGap, justifyContent: alignToFlex(m.alignX) }}>
                        {Array.from({ length: n }).map((_, i) => {
                            let frac = Math.max(0, Math.min(1, filledUnits - i));
                            frac = Math.round(frac / stepSize) * stepSize;
                            return <div key={i} style={{ position: 'relative', width: iconSize, height: iconSize, flexShrink: 0 }}>
                                {emptyUrl
                                    ? <img src={emptyUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
                                    : fullUrl
                                        ? <img src={fullUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: 0.25, filter: 'grayscale(1)' }} />
                                        : <div style={{ position: 'absolute', inset: 0, borderRadius: 4, border: `1px solid ${m.borderColor || m.fillColor || '#a78bfa'}`, opacity: 0.3 }} />}
                                {frac > 0 && (fullUrl
                                    ? <img src={fullUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', clipPath: `inset(0 ${(1 - frac) * 100}% 0 0)` }} />
                                    : <div style={{ position: 'absolute', inset: 0, borderRadius: 4, background: fill, clipPath: `inset(0 ${(1 - frac) * 100}% 0 0)` }} />)}
                            </div>;
                        })}
                        {m.showValue && <div className="text-[10px] text-white" style={{ marginLeft: 4, textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>{valueText}</div>}
                    </div>
                </div>;
            }
            return <div className="w-full h-full flex flex-col gap-0.5">
                {m.showLabel && <div className="text-[10px] text-white leading-tight truncate">{m.label || boundVar?.name || 'Meter'}</div>}
                <div className="relative flex-1 overflow-hidden" style={{
                    minHeight: 4,
                    borderRadius: radius,
                    backgroundColor: m.backgroundColor || 'rgba(0,0,0,0.4)',
                    ...(m.borderColor ? { border: `1px solid ${m.borderColor}` } : {}),
                }}>
                    <div className="absolute inset-0" style={{ clipPath, background: fill, borderRadius: radius }} />
                    {m.showValue && <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>{valueText}</div>}
                </div>
            </div>;
        }
        case UIElementType.Customizer: {
            const cz = element as UICustomizerElement;
            const czChar = cz.characterId ? project.characters[cz.characterId] : null;
            if (!czChar) return <div className="w-full h-full border-2 border-dashed border-[var(--accent-purple)] flex items-center justify-center text-[var(--text-secondary)]"><span className="bg-black/50 p-1 rounded text-xs">Customizer — pick a character</span></div>;
            // Composite using each category's variable DEFAULT (canvas has no live values); fall back to
            // the chosen/first expression for layers without a category.
            const czFallback = (cz.expressionId && czChar.expressions[cz.expressionId]) || Object.values(czChar.expressions)[0];
            const czImgs: string[] = [];
            const czVids: string[] = [];
            let czHasVid = false;
            if (czChar.baseVideoUrl) { czVids.push(czChar.baseVideoUrl); czHasVid = true; }
            else if (czChar.baseImageUrl) { czImgs.push(czChar.baseImageUrl); }
            Object.entries(czChar.layers).forEach(([layerId, layer]: [string, any]) => {
                const cat = (cz.categories || []).find(c => c.layerId === layerId);
                let assetId: string | null = null;
                if (cat) assetId = String((project.variables[cat.variableId]?.defaultValue ?? '') || '') || null;
                if (!assetId && czFallback) assetId = czFallback.layerConfiguration[layerId] || null;
                const asset = assetId ? layer.assets[assetId] : null;
                if (asset?.videoUrl) { czVids.push(asset.videoUrl); czHasVid = true; }
                else if (asset?.imageUrl) { czImgs.push(asset.imageUrl); }
            });
            // Faithful preview: mirror the runtime (composite + per-category swatch grids) so every
            // property adjustment (layout, swatch size/gap, selected highlight, colors, labels) shows
            // live on the canvas. Selection uses each category variable's DEFAULT (canvas isn't playing).
            const czSwatchSize = cz.swatchSize ?? 48;
            const czSwatchGap = cz.swatchGap ?? 6;
            const czSel = cz.selectedColor || '#8a2be2';
            const czArrowColor = cz.arrowColor || '#ffffff';
            const czArrowSize = cz.arrowSize ?? 28;
            const czButtonColor = cz.buttonColor || 'rgba(255,255,255,0.12)';
            const czButtonText = cz.buttonTextColor || '#ffffff';
            const czLayout = cz.layout || 'preview-left';
            const czPv = `${cz.previewPercent ?? 45}%`;
            const czUiImg = (a?: { id: string } | null) => a ? ((project.images[a.id] as any)?.imageUrl || (project.backgrounds[a.id] as any)?.imageUrl || null) : null;
            const czArrowUrl = czUiImg(cz.arrowImage);
            const czFrameUrl = czUiImg(cz.backgroundImage);
            const czAssetUrl = (a: any) => a?.imageUrl || a?.videoUrl || null;
            const czPreview = (
                <div className="relative" style={czLayout === 'preview-top' ? { height: czPv, width: '100%', flexShrink: 0 } : { width: czPv, height: '100%', flexShrink: 0 }}>
                    {(czHasVid ? czVids : czImgs).map((u, i) => czHasVid
                        ? <video key={i} src={u} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-contain" style={{ zIndex: i }} />
                        : <img key={i} src={u} alt="" className="absolute inset-0 w-full h-full object-contain" style={{ zIndex: i }} />)}
                </div>
            );
            // Non-interactive mirror of one category's picker so the canvas matches the runtime style.
            const czRenderPicker = (cat: any, cur: string, assets: any[]) => {
                const pstyle = cat.pickerStyle || 'swatches';
                if (pstyle === 'arrows') {
                    const curAsset = assets.find(a => a.id === cur) || assets[0];
                    const cu = curAsset ? czAssetUrl(curAsset) : null;
                    const arrow = (flip: boolean) => czArrowUrl
                        ? <img src={czArrowUrl} alt="" style={{ width: czArrowSize, height: czArrowSize, objectFit: 'contain', transform: flip ? 'scaleX(-1)' : undefined }} />
                        : <span style={{ fontSize: czArrowSize, lineHeight: 1, color: czArrowColor }}>{flip ? '◀' : '▶'}</span>;
                    return <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {arrow(true)}
                        <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                            {cu && <div style={{ width: czSwatchSize, height: czSwatchSize, margin: '0 auto' }}><img src={cu} alt="" className="w-full h-full object-contain" /></div>}
                            <div className="text-[10px] text-white/80 truncate">{curAsset?.name || ''}</div>
                        </div>
                        {arrow(false)}
                    </div>;
                }
                if (pstyle === 'dropdown') {
                    const curAsset = assets.find(a => a.id === cur) || assets[0];
                    return <div style={{ width: '100%', padding: '4px 6px', borderRadius: 6, background: 'rgba(0,0,0,0.35)', color: czButtonText, border: `1px solid ${cz.borderColor || 'rgba(255,255,255,0.2)'}`, fontSize: 11 }} className="flex items-center justify-between"><span className="truncate">{curAsset?.name || ''}</span><span>▾</span></div>;
                }
                if (pstyle === 'buttons') {
                    return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {assets.map(a => <span key={a.id} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: cur === a.id ? czSel : czButtonColor, color: czButtonText }}>{a.name}</span>)}
                    </div>;
                }
                return <div style={{ display: 'flex', flexWrap: 'wrap', gap: czSwatchGap }}>
                    {assets.map(asset => {
                        const meta = cz.optionMeta?.[asset.id];
                        const swUrl = meta?.swatchImage ? czUiImg(meta.swatchImage) : null;
                        return (
                            <div key={asset.id} title={asset.name} style={{ position: 'relative', width: czSwatchSize, height: czSwatchSize, flexShrink: 0, borderRadius: 6, overflow: 'hidden', background: 'rgba(0,0,0,0.3)', boxShadow: cur === asset.id ? `0 0 0 3px ${czSel}` : 'inset 0 0 0 1px rgba(255,255,255,0.15)' }}>
                                {swUrl ? <img src={swUrl} alt="" className="w-full h-full object-contain" /> : asset.imageUrl ? <img src={asset.imageUrl} alt="" className="w-full h-full object-contain" /> : asset.videoUrl ? <video src={asset.videoUrl} muted className="w-full h-full object-contain" /> : <div className="w-full h-full" />}
                                {meta?.conditions?.length ? <span style={{ position: 'absolute', top: 1, right: 2, fontSize: 9 }}>🔒</span> : null}
                            </div>
                        );
                    })}
                </div>;
            };
            const czPickers = (
                <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: 6 }}>
                    {(cz.categories || []).map(cat => {
                        const layer = czChar.layers[cat.layerId];
                        if (!layer) return null;
                        let cur = String((project.variables[cat.variableId]?.defaultValue ?? '') || '');
                        if (!cur && czFallback) cur = czFallback.layerConfiguration[cat.layerId] || '';
                        const assets = Object.values(layer.assets) as any[];
                        return (
                            <div key={cat.layerId}>
                                {cz.showLabels !== false && <div className="text-[10px] text-white/80 mb-1 truncate">{cat.label || layer.name}</div>}
                                {czRenderPicker(cat, cur, assets)}
                            </div>
                        );
                    })}
                    {(cz.categories || []).length === 0 && <div className="text-[10px] text-white/50">No categories yet — set them up in the Customizer's properties.</div>}
                    {(cz.showRandomize || cz.showReset) && (cz.categories || []).length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                            {cz.showRandomize && <span style={{ fontSize: 10, padding: '4px 12px', borderRadius: 6, background: czButtonColor, color: czButtonText }}>{cz.randomizeLabel || 'Randomize'}</span>}
                            {cz.showReset && <span style={{ fontSize: 10, padding: '4px 12px', borderRadius: 6, background: czButtonColor, color: czButtonText }}>{cz.resetLabel || 'Reset'}</span>}
                        </div>
                    )}
                </div>
            );
            return <div className="w-full h-full overflow-hidden flex" style={{ background: cz.backgroundColor || 'rgba(0,0,0,0.25)', ...(czFrameUrl ? { backgroundImage: `url(${czFrameUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}), borderRadius: cz.borderRadius ?? 8, border: cz.borderColor ? `1px solid ${cz.borderColor}` : '1px dashed var(--accent-purple)', flexDirection: czLayout === 'preview-top' ? 'column' : 'row' }}>
                {czLayout === 'preview-right' ? <>{czPickers}{czPreview}</> : <>{czPreview}{czPickers}</>}
            </div>;
        }
        case UIElementType.Custom: {
            const el = element as UICustomElement;
            const def = pluginManager.getUIElementType(el.pluginType);
            if (!def) return <div className="w-full h-full bg-amber-500/20 text-amber-300 text-[10px] flex items-center justify-center text-center p-1">Custom element — its extension isn't enabled.</div>;
            const getVar = (nameOrId: string) => {
                let id = nameOrId;
                if (!(project.variables as any)[id]) {
                    const found = Object.values(project.variables).find((v: any) => v.name?.toLowerCase() === String(nameOrId).toLowerCase()) as any;
                    if (found) id = found.id;
                }
                return (project.variables as any)[id]?.defaultValue;
            };
            let html = '';
            try { html = def.render(el.props || {}, { getVariable: getVar, isEditor: true }); }
            catch (e) { html = '<div style="color:#f87171;font:11px sans-serif;padding:4px">render error</div>'; }
            return <div className="w-full h-full overflow-hidden" style={{ pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: html }} />;
        }
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

    // Which individual free-placement slot is focused (shows resize handles), as `${elementId}:${index}`.
    const [freeSlotFocus, setFreeSlotFocus] = useState<string | null>(null);

    // Defer rendering elements to give the browser time to settle
    const [isReady, setIsReady] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setIsReady(true), 50);
        return () => clearTimeout(timer);
    }, [activeScreenId]);

    useLayoutEffect(() => {
        // Letterbox the canvas to the game's aspect ratio: measure the PARENT (the panel
        // content area) and size the stage to the largest aspect-correct box that fits, then
        // center it with auto margins. This mirrors the scene editor (StagingArea) and the
        // runtime stage, so a UI screen looks the same while editing as it does in the built
        // game — even when the editor panel is wider/taller than the game's aspect ratio.
        // (Previously the canvas used width:100% + aspect-ratio + max-height, which STRETCHED
        // it on panels wider than the game aspect.)
        const measure = () => {
            const parent = stageRef.current?.parentElement;
            if (!parent) return;
            const cs = getComputedStyle(parent);
            const pw = parent.clientWidth - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.paddingRight || '0');
            const ph = parent.clientHeight - parseFloat(cs.paddingTop || '0') - parseFloat(cs.paddingBottom || '0');
            const ar = (project.gameResolution?.width || 1920) / (project.gameResolution?.height || 1080);
            let w = pw;
            let h = w / ar;
            if (h > ph) { h = ph; w = h * ar; }
            if (w > 0 && h > 0) {
                setStageSize(prev => (Math.round(prev.width) === Math.round(w) && Math.round(prev.height) === Math.round(h))
                    ? prev
                    : { width: Math.round(w), height: Math.round(h) });
            }
        };
        const updateSize = () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(measure);
        };
        const resizeObserver = new ResizeObserver(updateSize);
        const parent = stageRef.current?.parentElement;
        if (parent) resizeObserver.observe(parent);
        measure(); // synchronous first measure (before paint) to avoid a collapsed first frame
        return () => {
            resizeObserver.disconnect();
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, [activeScreenId, project.gameResolution?.width, project.gameResolution?.height]);

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
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                // Nudge selected element(s) by a small % step (Shift = coarser) for pixel-ish fine-tuning.
                if (selectedElementIds.length === 0) return;
                e.preventDefault();
                const step = e.shiftKey ? 2 : 0.5;
                const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
                const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
                selectedElementIds.forEach(id => {
                    const el = screen.elements[id];
                    if (!el) return;
                    const nx = Math.round(Math.max(0, Math.min(100, (el.x ?? 0) + dx)) * 100) / 100;
                    const ny = Math.round(Math.max(0, Math.min(100, (el.y ?? 0) + dy)) * 100) / 100;
                    dispatch({ type: 'UPDATE_UI_ELEMENT', payload: { screenId: activeScreenId, elementId: id, updates: { x: nx, y: ny } } });
                });
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [screen, handleCopy, handleCut, handlePaste, handleSelectAll, handleDeleteSelected, selectedElementIds, activeScreenId, dispatch]);

    // Early return AFTER all hooks to satisfy Rules of Hooks
    if (!screen) return <Panel title={t('menuEditor.title')}>{t('menuEditor.screenNotFound')}</Panel>;

    const handleUpdateElement = (elementId: VNID, updates: Partial<VNUIElement>) => {
        dispatch({ type: 'UPDATE_UI_ELEMENT', payload: { screenId: activeScreenId, elementId, updates } });
    };

    /** Patch a single free-placement slot rect by index, preserving the others. Only one slot
     *  moves per drag gesture, so reading the current array from the render closure is safe. */
    const handleUpdateSlotRect = (elementId: VNID, index: number, rect: { x: number; y: number; width: number; height: number }) => {
        const el = screen?.elements?.[elementId] as UISaveSlotGridElement | UICGGalleryElement | undefined;
        if (!el) return;
        const rects = [...(el.slotRects || [])];
        rects[index] = rect;
        handleUpdateElement(elementId, { slotRects: rects } as Partial<VNUIElement>);
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
    
    const extensionUIElementTypes = useExtensionUIElementTypes();

    const handleAddElement = (type: UIElementType) => {
        const newElement = createUIElement(type, project);
        if (newElement) {
            dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId: activeScreenId, element: newElement } });
            setSelectedElementIds([newElement.id]);
        }
    };

    // Add a custom (extension-contributed) element type.
    const handleAddCustomElement = (def: { type: string; displayName: string; defaultProps?: Record<string, any>; defaultSize?: { width: number; height: number } }) => {
        const newElement = createCustomUIElement(def.type, def.displayName, def.defaultProps, def.defaultSize);
        dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId: activeScreenId, element: newElement } });
        setSelectedElementIds([newElement.id]);
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
            buttonElement.actions = [{ type: UIActionType.ReturnToPreviousScreen }];
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
            buttonElement.actions = [{ type: UIActionType.ReturnToPreviousScreen }];
            dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId: activeScreenId, element: buttonElement } });
        }
    };
    
    // Resolve the background by the ACTUAL asset, not the declared type — a video can be picked
    // under an 'image' background (the image picker lists videos), which must still render as a video.
    const bgAssetId = screen.background.type !== 'color' ? screen.background.assetId : null;
    const bgAsset: any = bgAssetId ? (project.backgrounds[bgAssetId] || project.images?.[bgAssetId] || project.videos[bgAssetId]) : null;
    const bgIsVideo = !!(bgAsset && (bgAsset.isVideo || bgAsset.videoUrl));
    const mainBgVideoUrl = bgIsVideo ? bgAsset.videoUrl : null;
    // The engine over-scales a parallaxed main background (so drift never reveals its edges).
    // Mirror that here for WYSIWYG, using the same flat scale the additional-plane preview uses.
    const mainBgParallax = (screen.backgroundParallaxDepth ?? 0) > 0;
    const parallaxActive = !!screen.parallax?.mode && screen.parallax.mode !== 'off';
    const getBackground = () => {
        if (screen.background.type === 'color') return { backgroundColor: screen.background.value };
        // Video backgrounds can't be a CSS background-image — they render as a <video> child below.
        if (bgIsVideo) return {};
        // A parallaxed image bg is rendered as a scaled <div> layer below instead of on the stage.
        if (bgAsset?.imageUrl && !mainBgParallax) return { backgroundImage: `url(${bgAsset.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' };
        return {};
    };

    return (
        <div className="flex-grow flex flex-col gap-4 min-h-0 p-4">
            {/* Canvas Panel - Fills available space above the toolbar */}
            <Panel 
                title={`Editing Menu: ${screen.name}`} 
                className="flex-1 min-h-0"
            >
                <div className="bg-slate-900/50 rounded-md relative overflow-hidden m-auto" ref={stageRef}
                    onMouseDown={() => setSelectedElementIds([])}
                    style={{
                        ...getBackground(),
                        // Confine element `layer` z-indices to this canvas (own stacking context)
                        // so a layered element never floats above the editor chrome.
                        isolation: 'isolate',
                        // Explicit aspect-fit size (computed from the parent above) + auto margins
                        // to center it — letterboxes instead of stretching. Matches the runtime.
                        width: stageSize.width || '100%',
                        height: stageSize.height || undefined,
                        '--font-scale': stageSize.width > 0 ? stageSize.width / (project.gameResolution?.width || 1920) : 1,
                    } as React.CSSProperties}
                >
                    {/* Main video background — CSS can't show a video, so render a real <video>.
                        Dropped while Test Play is open (it's covered by the overlay): the browser
                        evicts an offscreen video behind a fullscreen overlay and won't re-fire
                        autoPlay, leaving it broken/blank on return — so we unmount it during play
                        and let it mount fresh when the editor is shown again. */}
                    {mainBgVideoUrl && !isPlaying && (
                        <video key={`mainbg-${videoReloadNonce}`} ref={(el) => { if (el) el.play().catch(() => {}); }} src={mainBgVideoUrl} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" style={{ zIndex: 0, transform: mainBgParallax ? 'scale(1.15)' : undefined, transformOrigin: 'center' }} />
                    )}

                    {/* Parallaxed image main background — scaled layer mirroring the engine's over-scale. */}
                    {!bgIsVideo && mainBgParallax && bgAsset?.imageUrl && (
                        <div className="absolute inset-0 overflow-hidden" style={{ zIndex: 0 }}>
                            <img src={bgAsset.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ transform: 'scale(1.15)', transformOrigin: 'center' }} />
                        </div>
                    )}

                    {/* Parallax indicator: warns the author that elements with a parallax depth will
                        drift in-game (the editor canvas shows them at rest). */}
                    {parallaxActive && (
                        <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-purple-900/80 text-purple-200 text-[10px] font-medium pointer-events-none flex items-center gap-1" style={{ zIndex: 99999 }}>
                            <SparklesIcon className="w-3 h-3" /> {t('menuEditor.parallaxActive', { mode: screen.parallax!.mode })}
                        </div>
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
                        // Free-placement SaveSlotGrid / CGGallery: render per-slot drag handles
                        // instead of one box for the whole element.
                        if ((element.type === UIElementType.SaveSlotGrid || element.type === UIElementType.CGGallery)
                            && (element as UISaveSlotGridElement | UICGGalleryElement).slotLayout === 'free') {
                            return (
                                <FreeSlotHandles
                                    key={element.id}
                                    element={element as UISaveSlotGridElement | UICGGalleryElement}
                                    parentSize={stageSize}
                                    isElementSelected={selectedElementIds.includes(element.id)}
                                    focusedSlot={freeSlotFocus}
                                    onSelectSlot={(idx, e) => {
                                        e.stopPropagation();
                                        handleSelectElement(element.id, e);
                                        setFreeSlotFocus(`${element.id}:${idx}`);
                                    }}
                                    onUpdateSlot={(idx, rect) => handleUpdateSlotRect(element.id, idx, rect)}
                                    onContextMenu={(e) => handleElementContextMenu(element.id, e)}
                                />
                            );
                        }
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
                
                {/* Individual Element Buttons — a single horizontally-scrollable row so the toolbar
                    keeps a fixed (one-row) height instead of wrapping into many rows in a narrow
                    window (which previously squeezed the canvas, especially when popped out). */}
                <div className="flex flex-nowrap overflow-x-auto gap-2 pb-1 [&>button]:flex-shrink-0 [&>button]:whitespace-nowrap">
                    <button onClick={() => handleAddElement(UIElementType.Button)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> Button</button>
                    <button onClick={() => handleAddElement(UIElementType.Text)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> Text</button>
                    <button onClick={() => handleAddElement(UIElementType.Image)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> Image</button>
                    <button onClick={handleAddVideoElement} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> Video</button>
                    <button onClick={() => handleAddElement(UIElementType.Customizer)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> Customizer</button>
                    <button onClick={() => handleAddElement(UIElementType.TextInput)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> Text Input</button>
                    <button onClick={() => handleAddElement(UIElementType.Dropdown)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> Dropdown</button>
                    <button onClick={() => handleAddElement(UIElementType.Checkbox)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> Checkbox</button>
                    <button onClick={() => handleAddElement(UIElementType.SettingsSlider)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> Slider</button>
                    <button onClick={() => handleAddElement(UIElementType.SettingsToggle)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> Toggle</button>
                    <button onClick={() => handleAddElement(UIElementType.CGGallery)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> CG Gallery</button>
                    <button onClick={() => handleAddElement(UIElementType.Inventory)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> Inventory</button>
                    <button onClick={() => handleAddElement(UIElementType.Meter)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-purple-400/30"><PlusIcon /> Meter</button>
                    {extensionUIElementTypes.map(({ def }) => (
                        <button key={def.type} onClick={() => handleAddCustomElement(def)} title={`From extension: ${def.type}`} className="bg-violet-700 hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-semibold text-xs shadow-md border border-violet-400/30"><PlusIcon /> {def.icon ? def.icon + ' ' : ''}{def.displayName}</button>
                    ))}
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