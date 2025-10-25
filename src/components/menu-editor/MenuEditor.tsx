import React, { useState, useRef, useLayoutEffect } from 'react';
import Panel from '../ui/Panel';
import { useProject } from '../../contexts/ProjectContext';
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import { VNUIScreen, VNUIElement, UIElementType, UISettingsSliderElement, UISettingsToggleElement, UIButtonElement, UITextElement, UIImageElement, UISaveSlotGridElement, UICharacterPreviewElement } from '../../features/ui/types';
import { VNCharacter, VNCharacterLayer } from '../../features/character/types';
import ResizableDraggable from './ResizableDraggable';
import { createUIElement } from '../../utils/uiElementFactory';
import { fontSettingsToStyle } from '../../utils/styleUtils';
import { PlusIcon } from '../icons';

const UIElementRenderer: React.FC<{ element: VNUIElement, project: VNProject }> = ({ element, project }) => {
    switch (element.type) {
        case UIElementType.Button:
            const btn = element as UIButtonElement;
            return <div
                style={{ ...fontSettingsToStyle(btn.font), pointerEvents: 'none' }}
                className="w-full h-full bg-[var(--bg-tertiary)] border border-[var(--text-secondary)] rounded flex items-center justify-center"
            >{btn.text}</div>;
        case UIElementType.Text: {
            const txt = element as UITextElement;
            const hAlignClass = { left: 'justify-start', center: 'justify-center', right: 'justify-end' }[txt.textAlign || 'center'];
            const vAlignClass = { top: 'items-start', middle: 'items-center', bottom: 'items-end' }[txt.verticalAlign || 'middle'];

            return <div
                className={`w-full h-full flex p-1 ${hAlignClass} ${vAlignClass}`}
                style={{ ...fontSettingsToStyle(txt.font), textAlign: txt.textAlign || 'center' }}
            >
                <div>{txt.text}</div>
            </div>;
        }
        case UIElementType.Image:
            const img = element as UIImageElement;
            const url = img.image ? (project.backgrounds[img.image.id]?.imageUrl || project.videos[img.image.id]?.videoUrl) : null;
            return url ? <img src={url} alt="" className="w-full h-full object-contain" /> : <div className="w-full h-full bg-[var(--bg-primary)]/50 flex items-center justify-center text-slate-500">Image/Video</div>;
        case UIElementType.SaveSlotGrid:
             return <div className="w-full h-full bg-[var(--bg-primary)]/50 border-2 border-dashed border-[var(--bg-tertiary)] flex items-center justify-center text-[var(--text-secondary)]">Save/Load Slots</div>;
        case UIElementType.SettingsSlider:
            return <div className="w-full h-full flex items-center justify-center p-2">
                <input type="range" className="w-full" disabled />
            </div>;
        case UIElementType.SettingsToggle:
            const tog = element as UISettingsToggleElement;
            return <div className="w-full h-full flex items-center gap-2" style={fontSettingsToStyle(tog.font)}>
                <input type="checkbox" className="h-4 w-4" disabled/>
                <span>{tog.text}</span>
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
        default:
            return <div className="w-full h-full bg-red-500/20 text-red-300">Unknown Element</div>;
    }
}


const MenuEditor: React.FC<{ 
    activeScreenId: VNID,
    selectedElementId: VNID | null,
    setSelectedElementId: (id: VNID | null) => void,
}> = ({ activeScreenId, selectedElementId, setSelectedElementId }) => {
    const { project, dispatch } = useProject();
    const screen = project.uiScreens[activeScreenId];

    const stageRef = useRef<HTMLDivElement>(null);
    const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

    useLayoutEffect(() => {
        const updateSize = () => {
            if (stageRef.current) {
                const rect = stageRef.current.getBoundingClientRect();
                 setStageSize({ width: rect.width, height: rect.height });
            }
        };
        const resizeObserver = new ResizeObserver(updateSize);
        if (stageRef.current) {
            resizeObserver.observe(stageRef.current);
        }
        updateSize();
        return () => resizeObserver.disconnect();
    }, [activeScreenId]);

    if (!screen) return <Panel title="Menu Editor">Screen not found</Panel>;

    const handleUpdateElement = (elementId: VNID, updates: Partial<VNUIElement>) => {
        dispatch({ type: 'UPDATE_UI_ELEMENT', payload: { screenId: activeScreenId, elementId, updates } });
    };
    
    const handleAddElement = (type: UIElementType) => {
        const newElement = createUIElement(type, project);
        if (newElement) {
            dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId: activeScreenId, element: newElement } });
            setSelectedElementId(newElement.id);
        }
    };
    
    const getBackground = () => {
        if (screen.background.type === 'color') return { backgroundColor: screen.background.value };
        if (screen.background.assetId) {
             const url = screen.background.type === 'image' 
                ? project.backgrounds[screen.background.assetId]?.imageUrl
                : project.videos[screen.background.assetId]?.videoUrl;
            if (url) return { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' };
        }
        return {};
    };

    return (
        <div className="flex-grow flex flex-col gap-4 min-h-0">
            <Panel title={`Editing Menu: ${screen.name}`} className="flex-grow">
                <div className="w-full h-full bg-slate-900/50 rounded-md relative overflow-hidden aspect-video" ref={stageRef}
                    onMouseDown={() => setSelectedElementId(null)}
                    style={getBackground()}
                >
                    {stageSize.width > 0 && Object.values(screen.elements).map((element: VNUIElement) => (
                        <ResizableDraggable
                            key={element.id}
                            x={element.x} y={element.y}
                            width={element.width} height={element.height}
                            anchorX={element.anchorX} anchorY={element.anchorY}
                            parentSize={stageSize}
                            isSelected={selectedElementId === element.id}
                            onSelect={(e) => {
                                e.stopPropagation();
                                setSelectedElementId(element.id);
                            }}
                            onUpdate={updates => handleUpdateElement(element.id, updates)}
                        >
                            <UIElementRenderer element={element} project={project} />
                        </ResizableDraggable>
                    ))}
                </div>
            </Panel>
            <div className="flex-shrink-0 grid grid-cols-2 md:grid-cols-6 gap-2">
                <button onClick={() => handleAddElement(UIElementType.Button)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-bold"><PlusIcon /> Button</button>
                <button onClick={() => handleAddElement(UIElementType.Text)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-bold"><PlusIcon /> Text</button>
                <button onClick={() => handleAddElement(UIElementType.Image)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-bold"><PlusIcon /> Image</button>
                <button onClick={() => handleAddElement(UIElementType.CharacterPreview)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-bold"><PlusIcon /> Character</button>
                <button onClick={() => handleAddElement(UIElementType.SettingsSlider)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-bold"><PlusIcon /> Slider</button>
                <button onClick={() => handleAddElement(UIElementType.SettingsToggle)} className="bg-[var(--accent-purple)] hover:opacity-80 p-2 rounded-md flex items-center justify-center gap-2 font-bold"><PlusIcon /> Toggle</button>
            </div>
        </div>
    );
};

export default MenuEditor;