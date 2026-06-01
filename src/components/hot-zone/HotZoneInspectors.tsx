/**
 * HotZoneInspectors
 * ──────────────────
 * Inspector panels for hot spots and hot zone elements (draggable images /
 * buttons / text / etc.). Extracted from the deprecated `HotZoneEditor.tsx`
 * so that file can be deleted in Phase 4.
 *
 * These components consume the legacy `VNHotSpot` / `VNHotZoneElement`
 * shapes — callers (VisualNovelEditor's inspector dispatcher) translate
 * between the unified `VNUIElement` types and these shapes via
 * `src/utils/hotZoneShims.ts`. A future Phase 4.5 can rewrite them to
 * operate on typed elements directly.
 */
import React, { useMemo } from 'react';
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import {
    VNHotSpot,
    VNHotZoneElement,
    VNUIElement,
    UIHotSpotElement,
    UIElementType,
    HotSpotShape,
    HotSpotTrigger,
    HotZoneElementType,
    VNFontSettings,
} from '../../features/ui/types';
import { ImageMapRegion } from '../../features/scene/types';
import { PlusIcon, TrashIcon } from '../icons';
import Panel from '../ui/Panel';
import ConditionsEditor from '../ui/ConditionsEditor';
import UIActionsListEditor from '../ui/UIActionsListEditor';

const generateId = (prefix: string): VNID =>
    `${prefix}-${Math.random().toString(36).substring(2, 9)}` as VNID;

/** Convert a `Partial<VNHotSpot>` patch (produced by the legacy-shape JSX
 *  inside HotSpotProperties) into a `Partial<UIHotSpotElement>` patch for
 *  the typed external API. The field names already match, so this is a
 *  no-op pass-through with a type assertion. */
function hotSpotPatchToTyped(patch: Partial<VNHotSpot>): Partial<UIHotSpotElement> {
    return patch as Partial<UIHotSpotElement>;
}

/** Type-aware translator: maps a `Partial<VNHotZoneElement>` patch back to
 *  the appropriate fields on the typed element. */
function hotZoneElementPatchToTyped(
    patch: Partial<VNHotZoneElement>,
    current: VNUIElement,
): Partial<VNUIElement> {
    const out: any = {};
    if ('name' in patch) out.name = patch.name;
    if ('x' in patch) out.x = patch.x;
    if ('y' in patch) out.y = patch.y;
    if ('width' in patch) out.width = patch.width;
    if ('height' in patch) out.height = patch.height;
    if ('conditions' in patch) out.conditions = patch.conditions;
    if ('draggable' in patch) out.draggable = patch.draggable;
    if ('snapBack' in patch) out.snapBack = patch.snapBack;
    if ('snapToHotSpot' in patch) out.snapToHotSpot = patch.snapToHotSpot;
    if ('hideOnDrop' in patch) out.hideOnDrop = patch.hideOnDrop;
    if ('actions' in patch) out.actions = patch.actions;
    if ('clickSoundId' in patch) out.clickSoundId = patch.clickSoundId;
    if ('hoverSoundId' in patch) out.hoverSoundId = patch.hoverSoundId;
    switch (current.type) {
        case UIElementType.Image: {
            if ('imageId' in patch) {
                const id = patch.imageId as VNID;
                out.background = id ? { type: 'image', assetId: id } : { type: 'color', value: '#00000000' };
                out.image = id ? { type: 'image', id } : null;
            }
            if ('videoId' in patch) {
                const id = patch.videoId as VNID | undefined;
                out.background = id ? { type: 'video', assetId: id } : { type: 'color', value: '#00000000' };
            }
            if ('videoLoop' in patch) (out as any).videoLoop = patch.videoLoop;
            if ('videoMuted' in patch) (out as any).videoMuted = patch.videoMuted;
            break;
        }
        case UIElementType.Button: {
            if ('text' in patch) out.text = patch.text;
            if ('font' in patch) out.font = patch.font;
            if ('backgroundColor' in patch) out.backgroundColor = patch.backgroundColor;
            if ('imageId' in patch) {
                const id = patch.imageId as VNID;
                out.image = id ? { type: 'image', id } : null;
            }
            break;
        }
        case UIElementType.Text: {
            if ('text' in patch) out.text = patch.text;
            if ('font' in patch) out.font = patch.font;
            break;
        }
        case UIElementType.TextInput: {
            if ('placeholder' in patch) out.placeholder = patch.placeholder;
            if ('variableId' in patch) out.variableId = patch.variableId;
            if ('font' in patch) out.font = patch.font;
            if ('backgroundColor' in patch) out.backgroundColor = patch.backgroundColor;
            if ('borderColor' in patch) out.borderColor = patch.borderColor;
            if ('maxLength' in patch) out.maxLength = patch.maxLength;
            break;
        }
        case UIElementType.ImageMap: {
            if ('imageId' in patch) {
                const id = patch.imageId as VNID;
                out.image = id ? { type: 'image', id } : null;
            }
            if ('hoverImageId' in patch) {
                const id = patch.hoverImageId as VNID | undefined;
                out.hoverImage = id ? { type: 'image', id } : null;
            }
            if ('imageMapRegions' in patch) out.imageMapRegions = patch.imageMapRegions;
            break;
        }
    }
    return out;
}

/** Convert a unified element back to legacy `VNHotZoneElement` shape so the
 *  existing inspector JSX can render unchanged. */
function toLegacyHotZoneElement(el: VNUIElement): VNHotZoneElement | null {
    const anyEl = el as any;
    switch (el.type) {
        case UIElementType.ImageMap: {
            return {
                id: el.id, name: el.name, elementType: 'imageMap',
                imageId: ((el as any).image?.id ?? '') as VNID,
                hoverImageId: (el as any).hoverImage?.id,
                imageMapRegions: (el as any).imageMapRegions,
                x: el.x, y: el.y, width: el.width, height: el.height,
                draggable: anyEl.draggable, snapBack: anyEl.snapBack,
                snapToHotSpot: anyEl.snapToHotSpot, hideOnDrop: anyEl.hideOnDrop,
                conditions: el.conditions, actions: anyEl.actions,
                clickSoundId: anyEl.clickSoundId, hoverSoundId: anyEl.hoverSoundId,
            };
        }
        case UIElementType.Image: {
            const bg = (el as any).background;
            const isVideo = bg?.type === 'video';
            const isImage = bg?.type === 'image';
            const assetId = (bg && (bg.type === 'image' || bg.type === 'video') ? bg.assetId : null) ?? (el as any).image?.id ?? null;
            return {
                id: el.id, name: el.name,
                elementType: isVideo ? 'video' : 'image',
                imageId: (isImage ? assetId : '') as VNID,
                videoId: isVideo ? (assetId ?? undefined) as VNID | undefined : undefined,
                videoLoop: anyEl.videoLoop, videoMuted: anyEl.videoMuted,
                x: el.x, y: el.y, width: el.width, height: el.height,
                draggable: anyEl.draggable, snapBack: anyEl.snapBack,
                snapToHotSpot: anyEl.snapToHotSpot, hideOnDrop: anyEl.hideOnDrop,
                conditions: el.conditions, actions: anyEl.actions,
                clickSoundId: anyEl.clickSoundId, hoverSoundId: anyEl.hoverSoundId,
            };
        }
        case UIElementType.Text: {
            return {
                id: el.id, name: el.name, elementType: 'text',
                imageId: '' as VNID, text: (el as any).text, font: (el as any).font,
                x: el.x, y: el.y, width: el.width, height: el.height,
                draggable: anyEl.draggable, snapBack: anyEl.snapBack,
                snapToHotSpot: anyEl.snapToHotSpot, hideOnDrop: anyEl.hideOnDrop,
                conditions: el.conditions, actions: anyEl.actions,
                clickSoundId: anyEl.clickSoundId, hoverSoundId: anyEl.hoverSoundId,
            };
        }
        case UIElementType.Button: {
            return {
                id: el.id, name: el.name, elementType: 'button',
                imageId: ((el as any).image?.id ?? '') as VNID,
                text: (el as any).text, font: (el as any).font,
                backgroundColor: (el as any).backgroundColor,
                x: el.x, y: el.y, width: el.width, height: el.height,
                draggable: anyEl.draggable, snapBack: anyEl.snapBack,
                snapToHotSpot: anyEl.snapToHotSpot, hideOnDrop: anyEl.hideOnDrop,
                conditions: el.conditions,
                actions: (el as any).actions ?? anyEl.actions,
                clickSoundId: (el as any).clickSoundId ?? null,
                hoverSoundId: (el as any).hoverSoundId ?? null,
            };
        }
        case UIElementType.TextInput: {
            return {
                id: el.id, name: el.name, elementType: 'textInput',
                imageId: '' as VNID,
                placeholder: (el as any).placeholder,
                variableId: (el as any).variableId,
                font: (el as any).font,
                backgroundColor: (el as any).backgroundColor,
                borderColor: (el as any).borderColor,
                maxLength: (el as any).maxLength,
                x: el.x, y: el.y, width: el.width, height: el.height,
                draggable: anyEl.draggable, snapBack: anyEl.snapBack,
                snapToHotSpot: anyEl.snapToHotSpot, hideOnDrop: anyEl.hideOnDrop,
                conditions: el.conditions, actions: anyEl.actions,
                clickSoundId: anyEl.clickSoundId, hoverSoundId: anyEl.hoverSoundId,
            };
        }
        default:
            return null;
    }
}

export const HotSpotProperties: React.FC<{
    spot: UIHotSpotElement;
    project: VNProject;
    /** Names of draggable elements on the screen — used as the "Accepted Elements" picker. */
    targetableElements: { id: VNID; name: string }[];
    onUpdate: (patch: Partial<UIHotSpotElement>) => void;
    /** Removes this hot spot from the screen. */
    onDelete?: () => void;
}> = ({ spot, project, targetableElements, onUpdate: typedOnUpdate, onDelete }) => {
    // Inside the body we still operate on the legacy VNHotSpot shape (field
    // names match), so existing JSX builds Partial<VNHotSpot> patches; convert
    // to Partial<UIHotSpotElement> at the boundary.
    const onUpdate = (patch: Partial<VNHotSpot>) => typedOnUpdate(hotSpotPatchToTyped(patch));
    // hotZoneElements is just the {id,name} list — derive a no-op map for the
    // existing JSX that iterates Object.values().
    const hotZoneElements = useMemo(() => {
        const out: Record<VNID, { id: VNID; name: string }> = {};
        for (const el of targetableElements) out[el.id] = el;
        return out as unknown as Record<VNID, VNHotZoneElement>;
    }, [targetableElements]);
    const targetable = targetableElements;

    return (
        <Panel title="Properties: Hot Spot" className="w-96 flex-shrink-0">
            <div className="flex-grow overflow-y-auto pr-1 space-y-3 text-sm">
            <h4 className="font-bold text-sky-300 flex items-center gap-2">
                Hot Spot Properties
                <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400">
                    {spot.trigger}
                </span>
            </h4>

            <label className="block">
                <span className="text-[var(--text-secondary)] text-xs">Name</span>
                <input
                    type="text"
                    value={spot.name}
                    onChange={e => onUpdate({ name: e.target.value })}
                    className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                />
            </label>

            <div className="grid grid-cols-2 gap-2">
                <label className="block">
                    <span className="text-[var(--text-secondary)] text-xs">Shape</span>
                    <select
                        value={spot.shape}
                        onChange={e => onUpdate({ shape: e.target.value as HotSpotShape })}
                        className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                    >
                        <option value="rect">Rectangle</option>
                        <option value="circle">Circle</option>
                    </select>
                </label>
                <label className="block">
                    <span className="text-[var(--text-secondary)] text-xs">Trigger</span>
                    <select
                        value={spot.trigger}
                        onChange={e => onUpdate({ trigger: e.target.value as HotSpotTrigger })}
                        className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                    >
                        <option value="click">Click</option>
                        <option value="hover">Hover</option>
                        <option value="drag-drop">Drag & Drop</option>
                    </select>
                </label>
            </div>

            {spot.trigger === 'drag-drop' && (
                <div>
                    <span className="text-[var(--text-secondary)] text-xs font-semibold">Accepted Elements</span>
                    <p className="text-[10px] text-[var(--text-muted)] mb-1">Which elements can be dropped here?</p>
                    <div className="mt-0.5 space-y-0.5 max-h-28 overflow-y-auto">
                        {(Object.values(hotZoneElements) as VNHotZoneElement[]).map(el => {
                            const isAccepted = spot.acceptedElementIds?.includes(el.id) ?? false;
                            return (
                                <label key={el.id} className="flex items-center gap-2 text-[10px] px-1 py-0.5 rounded hover:bg-[var(--bg-secondary)]">
                                    <input
                                        type="checkbox"
                                        checked={isAccepted}
                                        onChange={() => {
                                            const current = spot.acceptedElementIds || [];
                                            const next = isAccepted
                                                ? current.filter(id => id !== el.id)
                                                : [...current, el.id];
                                            onUpdate({ acceptedElementIds: next });
                                        }}
                                    />
                                    <span className={isAccepted ? 'text-green-300' : 'text-[var(--text-secondary)]'}>{el.name}</span>
                                </label>
                            );
                        })}
                        {Object.keys(hotZoneElements).length === 0 && (
                            <p className="text-[10px] text-slate-500 italic">No elements added yet</p>
                        )}
                    </div>
                </div>
            )}

            <div className="flex gap-2">
                <label className="block flex-1">
                    <span className="text-[var(--text-secondary)] text-xs">Highlight Color</span>
                    <input
                        type="color"
                        value={spot.highlightColor || '#3b82f6'}
                        onChange={e => onUpdate({ highlightColor: e.target.value })}
                        className="w-full mt-0.5 h-7 bg-transparent border border-[var(--border-default)] rounded cursor-pointer"
                    />
                </label>
                <label className="flex items-end gap-1.5 pb-0.5">
                    <input
                        type="checkbox"
                        checked={spot.visible ?? false}
                        onChange={e => onUpdate({ visible: e.target.checked })}
                    />
                    <span className="text-[var(--text-secondary)] text-xs">Visible</span>
                </label>
            </div>

            <div>
                <span className="text-[var(--text-secondary)] text-xs font-semibold">Position & Size</span>
                <div className="grid grid-cols-4 gap-1 mt-0.5">
                    {(['x', 'y', 'width', 'height'] as const).map(field => (
                        <label key={field} className="block">
                            <span className="text-[var(--text-muted)] text-[10px] uppercase">{field[0].toUpperCase()}</span>
                            <input type="number" value={spot[field]} step={0.1} min={field === 'width' || field === 'height' ? 1 : undefined}
                                onChange={e => onUpdate({ [field]: parseFloat(e.target.value) || 0 })}
                                className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]"
                            />
                        </label>
                    ))}
                </div>
            </div>

            <hr className="border-[var(--border-subtle)]" />

            <div className="space-y-1">
                <span className="text-[var(--text-secondary)] text-xs font-semibold">Visibility Conditions</span>
                <p className="text-[10px] text-[var(--text-muted)]">
                    Hot spot is only active when all conditions are met.
                </p>
                <ConditionsEditor
                    conditions={spot.conditions}
                    project={project}
                    onChange={conditions => onUpdate({ conditions })}
                />
            </div>

            <hr className="border-[var(--border-subtle)]" />

            <UIActionsListEditor
                actions={spot.actions}
                project={project}
                targetableElements={targetable}
                onChange={actions => onUpdate({ actions })}
                label="Trigger Actions"
            />

            {onDelete && (
                <>
                    <hr className="border-[var(--border-subtle)]" />
                    <button onClick={onDelete} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors">
                        <TrashIcon /> Delete Hot Spot
                    </button>
                </>
            )}
            </div>
        </Panel>
    );
};

export const HotZoneElementProperties: React.FC<{
    element: VNUIElement;
    project: VNProject;
    /** Names of draggable elements on the screen — used by the inner actions
     *  editor's target-element pickers. */
    targetableElements: { id: VNID; name: string }[];
    onUpdate: (patch: Partial<VNUIElement>) => void;
    /** Removes this element (draggable / image map) from the screen. */
    onDelete?: () => void;
}> = ({ element: typedElement, project, targetableElements, onUpdate: typedOnUpdate, onDelete }) => {
    const element = toLegacyHotZoneElement(typedElement);
    if (!element) return null;
    // Existing JSX produces Partial<VNHotZoneElement> patches; translate at the
    // boundary so the external API stays typed.
    const onUpdate = (patch: Partial<VNHotZoneElement>) =>
        typedOnUpdate(hotZoneElementPatchToTyped(patch, typedElement));
    const hotZoneElements = useMemo(() => {
        const out: Record<VNID, { id: VNID; name: string }> = {};
        for (const el of targetableElements) out[el.id] = el;
        return out as unknown as Record<VNID, VNHotZoneElement>;
    }, [targetableElements]);

    const imageAssets = useMemo(() =>
        Object.values(project.images).concat(Object.values(project.backgrounds) as any[]),
        [project.images, project.backgrounds]
    );
    const audioAssets = useMemo(() => Object.values(project.audio), [project.audio]);
    const targetable = targetableElements;

    const elType = element.elementType || 'image';
    const defaultFont: VNFontSettings = { family: 'sans-serif', size: 16, color: '#ffffff', weight: 'normal', italic: false };
    const panelTitle = elType === 'imageMap' ? 'Properties: Image Map'
        : element.draggable ? 'Properties: Draggable Element'
        : `Properties: ${elType.charAt(0).toUpperCase()}${elType.slice(1)}`;

    return (
        <Panel title={panelTitle} className="w-96 flex-shrink-0">
            <div className="flex-grow overflow-y-auto pr-1 space-y-3 text-sm">
            <h4 className="font-bold text-purple-300 flex items-center gap-2">
                Element Properties
                {element.draggable && (
                    <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                        draggable
                    </span>
                )}
            </h4>

            <label className="block">
                <span className="text-[var(--text-secondary)] text-xs">Name</span>
                <input
                    type="text"
                    value={element.name}
                    onChange={e => onUpdate({ name: e.target.value })}
                    className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                />
            </label>

            <label className="block">
                <span className="text-[var(--text-secondary)] text-xs">Element Type</span>
                <select
                    value={elType}
                    onChange={e => onUpdate({ elementType: e.target.value as HotZoneElementType })}
                    className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                >
                    <option value="image">Image</option>
                    <option value="text">Text</option>
                    <option value="button">Button</option>
                    <option value="video">Video</option>
                    <option value="textInput">Text Input</option>
                    <option value="imageMap">Image Map</option>
                </select>
            </label>

            {(elType === 'image' || elType === 'button' || elType === 'imageMap') && (
                <label className="block">
                    <span className="text-[var(--text-secondary)] text-xs">{elType === 'button' ? 'Background Image' : elType === 'imageMap' ? 'Map Background Image' : 'Image Asset'}</span>
                    <select
                        value={element.imageId}
                        onChange={e => onUpdate({ imageId: e.target.value as VNID })}
                        className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                    >
                        <option value="">-- Select Image --</option>
                        {imageAssets.map((img: any) => (
                            <option key={img.id} value={img.id}>{img.name || img.id}</option>
                        ))}
                    </select>
                </label>
            )}

            {elType === 'imageMap' && (
                <label className="block">
                    <span className="text-[var(--text-secondary)] text-xs">Hover State Image</span>
                    <select
                        value={element.hoverImageId || ''}
                        onChange={e => onUpdate({ hoverImageId: (e.target.value || undefined) as VNID | undefined })}
                        className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                    >
                        <option value="">-- None --</option>
                        {imageAssets.map((img: any) => (
                            <option key={img.id} value={img.id}>{img.name || img.id}</option>
                        ))}
                    </select>
                    <span className="text-[var(--text-muted)] text-[9px]">Shown clipped to hovered region (Ren'Py-style)</span>
                </label>
            )}

            {elType === 'video' && (
                <>
                    <label className="block">
                        <span className="text-[var(--text-secondary)] text-xs">Video Asset</span>
                        <select
                            value={element.videoId || ''}
                            onChange={e => onUpdate({ videoId: e.target.value as VNID })}
                            className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                        >
                            <option value="">-- Select Video --</option>
                            {Object.values(project.videos).map((v: any) => (
                                <option key={v.id} value={v.id}>{v.name || v.id}</option>
                            ))}
                        </select>
                    </label>
                    <div className="flex gap-3">
                        <label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                            <input type="checkbox" checked={element.videoLoop ?? true}
                                onChange={e => onUpdate({ videoLoop: e.target.checked })} />
                            Loop
                        </label>
                        <label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                            <input type="checkbox" checked={element.videoMuted ?? true}
                                onChange={e => onUpdate({ videoMuted: e.target.checked })} />
                            Muted
                        </label>
                    </div>
                </>
            )}

            {elType === 'textInput' && (
                <>
                    <label className="block">
                        <span className="text-[var(--text-secondary)] text-xs">Bind to Variable</span>
                        <select
                            value={element.variableId || ''}
                            onChange={e => onUpdate({ variableId: e.target.value as VNID })}
                            className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                        >
                            <option value="">-- Select Variable --</option>
                            {Object.values(project.variables).map((v: any) => (
                                <option key={v.id} value={v.id}>{v.name} ({v.type})</option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-[var(--text-secondary)] text-xs">Placeholder</span>
                        <input
                            type="text"
                            value={element.placeholder || ''}
                            onChange={e => onUpdate({ placeholder: e.target.value })}
                            placeholder="Enter text..."
                            className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                        />
                    </label>
                    <label className="block">
                        <span className="text-[var(--text-secondary)] text-xs">Max Length</span>
                        <input
                            type="number"
                            value={element.maxLength || ''}
                            onChange={e => onUpdate({ maxLength: e.target.value ? Number(e.target.value) : undefined })}
                            placeholder="No limit"
                            min={1}
                            className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                        />
                    </label>
                    <div className="grid grid-cols-2 gap-1">
                        <label className="block">
                            <span className="text-[var(--text-muted)] text-[10px]">Background</span>
                            <input type="color" value={element.backgroundColor || '#1e293b'}
                                onChange={e => onUpdate({ backgroundColor: e.target.value })}
                                className="w-full h-6 bg-transparent border border-[var(--border-default)] rounded cursor-pointer" />
                        </label>
                        <label className="block">
                            <span className="text-[var(--text-muted)] text-[10px]">Border</span>
                            <input type="color" value={element.borderColor || '#475569'}
                                onChange={e => onUpdate({ borderColor: e.target.value })}
                                className="w-full h-6 bg-transparent border border-[var(--border-default)] rounded cursor-pointer" />
                        </label>
                    </div>
                </>
            )}

            {elType === 'imageMap' && (() => {
                const regions = element.imageMapRegions || [];
                const addRegion = () => {
                    const newRegion: ImageMapRegion = {
                        id: generateId('imr') as VNID,
                        name: `Region ${regions.length + 1}`,
                        shape: 'rect',
                        coords: [25, 25, 50, 50],
                        actions: [],
                        tooltip: '',
                        cursor: 'pointer',
                        highlightColor: 'rgba(16,185,129,0.3)',
                    };
                    onUpdate({ imageMapRegions: [...regions, newRegion] });
                };
                const updateRegion = (idx: number, patch: Partial<ImageMapRegion>) => {
                    const newRegions = [...regions];
                    newRegions[idx] = { ...newRegions[idx], ...patch };
                    onUpdate({ imageMapRegions: newRegions });
                };
                const removeRegion = (idx: number) => {
                    onUpdate({ imageMapRegions: regions.filter((_, i) => i !== idx) });
                };

                return (
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-[var(--text-secondary)] text-xs font-semibold">Clickable Regions ({regions.length})</span>
                            <button onClick={addRegion} className="flex items-center gap-1 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white px-1.5 py-0.5 rounded transition-colors">
                                <PlusIcon className="w-3 h-3" /> Add
                            </button>
                        </div>

                        {regions.map((region, idx) => (
                            <div key={region.id} className="p-2 bg-[var(--bg-primary)] rounded border border-emerald-500/30 space-y-1">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-bold text-emerald-300">Region {idx + 1}</span>
                                    <button onClick={() => removeRegion(idx)} className="text-red-400 hover:text-red-300 p-0.5" title="Remove Region">
                                        <TrashIcon className="w-3 h-3" />
                                    </button>
                                </div>

                                <label className="block">
                                    <span className="text-[var(--text-muted)] text-[10px]">Name</span>
                                    <input type="text" value={region.name} onChange={e => updateRegion(idx, { name: e.target.value })}
                                        className="w-full mt-0.5 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]" />
                                </label>

                                <label className="block">
                                    <span className="text-[var(--text-muted)] text-[10px]">Shape</span>
                                    <select value={region.shape} onChange={e => {
                                        const shape = e.target.value as 'rect' | 'circle' | 'poly';
                                        const defaultCoords = shape === 'rect' ? [25, 25, 50, 50] : shape === 'circle' ? [50, 50, 25] : [25, 25, 75, 25, 75, 75, 25, 75];
                                        updateRegion(idx, { shape, coords: defaultCoords });
                                    }} className="w-full mt-0.5 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]">
                                        <option value="rect">Rectangle</option>
                                        <option value="circle">Circle</option>
                                        <option value="poly">Polygon</option>
                                    </select>
                                </label>

                                {region.shape === 'rect' && (
                                    <div className="grid grid-cols-2 gap-1">
                                        <label className="block"><span className="text-[var(--text-muted)] text-[10px]">X %</span>
                                            <input type="number" value={region.coords[0] ?? 0} onChange={e => { const c = [...region.coords]; c[0] = parseFloat(e.target.value) || 0; updateRegion(idx, { coords: c }); }}
                                                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]" /></label>
                                        <label className="block"><span className="text-[var(--text-muted)] text-[10px]">Y %</span>
                                            <input type="number" value={region.coords[1] ?? 0} onChange={e => { const c = [...region.coords]; c[1] = parseFloat(e.target.value) || 0; updateRegion(idx, { coords: c }); }}
                                                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]" /></label>
                                        <label className="block"><span className="text-[var(--text-muted)] text-[10px]">W %</span>
                                            <input type="number" value={region.coords[2] ?? 50} onChange={e => { const c = [...region.coords]; c[2] = parseFloat(e.target.value) || 0; updateRegion(idx, { coords: c }); }}
                                                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]" /></label>
                                        <label className="block"><span className="text-[var(--text-muted)] text-[10px]">H %</span>
                                            <input type="number" value={region.coords[3] ?? 50} onChange={e => { const c = [...region.coords]; c[3] = parseFloat(e.target.value) || 0; updateRegion(idx, { coords: c }); }}
                                                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]" /></label>
                                    </div>
                                )}

                                {region.shape === 'circle' && (
                                    <div className="grid grid-cols-3 gap-1">
                                        <label className="block"><span className="text-[var(--text-muted)] text-[10px]">CX %</span>
                                            <input type="number" value={region.coords[0] ?? 50} onChange={e => { const c = [...region.coords]; c[0] = parseFloat(e.target.value) || 0; updateRegion(idx, { coords: c }); }}
                                                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]" /></label>
                                        <label className="block"><span className="text-[var(--text-muted)] text-[10px]">CY %</span>
                                            <input type="number" value={region.coords[1] ?? 50} onChange={e => { const c = [...region.coords]; c[1] = parseFloat(e.target.value) || 0; updateRegion(idx, { coords: c }); }}
                                                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]" /></label>
                                        <label className="block"><span className="text-[var(--text-muted)] text-[10px]">R %</span>
                                            <input type="number" value={region.coords[2] ?? 25} onChange={e => { const c = [...region.coords]; c[2] = parseFloat(e.target.value) || 0; updateRegion(idx, { coords: c }); }}
                                                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]" /></label>
                                    </div>
                                )}

                                {region.shape === 'poly' && (
                                    <div className="space-y-1">
                                        <span className="text-[var(--text-muted)] text-[10px]">Points (x%, y%)</span>
                                        {Array.from({ length: Math.floor(region.coords.length / 2) }).map((_, pi) => (
                                            <div key={pi} className="grid grid-cols-3 gap-1 items-end">
                                                <input type="number" value={region.coords[pi * 2] ?? 0} onChange={e => { const c = [...region.coords]; c[pi * 2] = parseFloat(e.target.value) || 0; updateRegion(idx, { coords: c }); }}
                                                    className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]" title={`P${pi + 1} X`} />
                                                <input type="number" value={region.coords[pi * 2 + 1] ?? 0} onChange={e => { const c = [...region.coords]; c[pi * 2 + 1] = parseFloat(e.target.value) || 0; updateRegion(idx, { coords: c }); }}
                                                    className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]" title={`P${pi + 1} Y`} />
                                                <button onClick={() => { const c = [...region.coords]; c.splice(pi * 2, 2); updateRegion(idx, { coords: c.length >= 2 ? c : [50, 50] }); }}
                                                    className="text-red-400 hover:text-red-300 text-[10px] p-0.5" title="Remove Point">✕</button>
                                            </div>
                                        ))}
                                        <button onClick={() => updateRegion(idx, { coords: [...region.coords, 50, 50] })}
                                            className="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white px-1.5 py-0.5 rounded transition-colors">+ Point</button>
                                    </div>
                                )}

                                <label className="block">
                                    <span className="text-[var(--text-muted)] text-[10px]">Tooltip</span>
                                    <input type="text" value={region.tooltip || ''} onChange={e => updateRegion(idx, { tooltip: e.target.value })} placeholder="Hover text..."
                                        className="w-full mt-0.5 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]" />
                                </label>

                                <label className="block">
                                    <span className="text-[var(--text-muted)] text-[10px]">Highlight Color</span>
                                    <input type="color" value={region.highlightColor?.startsWith('rgba') ? '#10b981' : (region.highlightColor || '#10b981')}
                                        onChange={e => updateRegion(idx, { highlightColor: e.target.value + '4D' })}
                                        className="w-full h-5 bg-transparent border border-[var(--border-default)] rounded cursor-pointer" />
                                </label>

                                <UIActionsListEditor
                                    actions={region.actions || []}
                                    project={project}
                                    targetableElements={targetable}
                                    onChange={actions => updateRegion(idx, { actions })}
                                    label="On Click Actions"
                                />

                                <ConditionsEditor
                                    conditions={region.conditions}
                                    project={project}
                                    onChange={cs => updateRegion(idx, { conditions: cs })}
                                />
                            </div>
                        ))}
                    </div>
                );
            })()}

            {(elType === 'text' || elType === 'button') && (
                <label className="block">
                    <span className="text-[var(--text-secondary)] text-xs">Text</span>
                    <input
                        type="text"
                        value={element.text || ''}
                        onChange={e => onUpdate({ text: e.target.value })}
                        placeholder="Display text..."
                        className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                    />
                </label>
            )}

            {(elType === 'text' || elType === 'button' || elType === 'textInput') && (() => {
                const font = element.font || defaultFont;
                const updateFont = (updates: Partial<VNFontSettings>) => onUpdate({ font: { ...font, ...updates } });
                return (
                    <div className="space-y-1">
                        <span className="text-[var(--text-secondary)] text-xs font-semibold">Font</span>
                        <div className="grid grid-cols-2 gap-1">
                            <input type="number" value={font.size} min={8} max={120}
                                onChange={e => updateFont({ size: Number(e.target.value) })}
                                className="bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]"
                                title="Font size"
                            />
                            <input type="color" value={font.color}
                                onChange={e => updateFont({ color: e.target.value })}
                                className="h-6 bg-transparent border border-[var(--border-default)] rounded cursor-pointer"
                                title="Text color"
                            />
                        </div>
                        <div className="flex gap-2">
                            <label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                                <input type="checkbox" checked={font.weight === 'bold'} onChange={e => updateFont({ weight: e.target.checked ? 'bold' : 'normal' })} />
                                Bold
                            </label>
                            <label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                                <input type="checkbox" checked={font.italic} onChange={e => updateFont({ italic: e.target.checked })} />
                                Italic
                            </label>
                        </div>
                    </div>
                );
            })()}

            <div className="space-y-1">
                <span className="text-[var(--text-secondary)] text-xs font-semibold">Sounds</span>
                <label className="block">
                    <span className="text-[var(--text-muted)] text-[10px]">Click Sound</span>
                    <select
                        value={element.clickSoundId || ''}
                        onChange={e => onUpdate({ clickSoundId: (e.target.value || null) as VNID | null })}
                        className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]"
                    >
                        <option value="">None</option>
                        {audioAssets.map((a: any) => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
                    </select>
                </label>
                <label className="block">
                    <span className="text-[var(--text-muted)] text-[10px]">Hover Sound</span>
                    <select
                        value={element.hoverSoundId || ''}
                        onChange={e => onUpdate({ hoverSoundId: (e.target.value || null) as VNID | null })}
                        className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]"
                    >
                        <option value="">None</option>
                        {audioAssets.map((a: any) => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
                    </select>
                </label>
            </div>

            <div className="space-y-1">
                <span className="text-[var(--text-secondary)] text-xs font-semibold">Behavior</span>
                <label className="flex items-center gap-2 text-xs px-1 py-0.5 rounded hover:bg-[var(--bg-secondary)]">
                    <input
                        type="checkbox"
                        checked={element.draggable ?? false}
                        onChange={e => onUpdate({ draggable: e.target.checked })}
                    />
                    <span className="text-[var(--text-secondary)]">Draggable by player</span>
                </label>

                {element.draggable && (
                    <>
                        <label className="flex items-center gap-2 text-xs px-1 py-0.5 rounded hover:bg-[var(--bg-secondary)] ml-3">
                            <input
                                type="checkbox"
                                checked={element.snapBack ?? false}
                                onChange={e => onUpdate({ snapBack: e.target.checked })}
                            />
                            <span className="text-[var(--text-secondary)]">Snap back if not on hot spot</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs px-1 py-0.5 rounded hover:bg-[var(--bg-secondary)] ml-3">
                            <input
                                type="checkbox"
                                checked={element.snapToHotSpot ?? false}
                                onChange={e => onUpdate({ snapToHotSpot: e.target.checked })}
                            />
                            <span className="text-[var(--text-secondary)]">Snap to hot spot center</span>
                        </label>
                        {element.snapToHotSpot && (
                            <label className="flex items-center gap-2 text-xs px-1 py-0.5 rounded hover:bg-[var(--bg-secondary)] ml-6">
                                <input
                                    type="checkbox"
                                    checked={element.hideOnDrop ?? false}
                                    onChange={e => onUpdate({ hideOnDrop: e.target.checked })}
                                />
                                <span className="text-[var(--text-secondary)]">Hide on drop</span>
                            </label>
                        )}
                    </>
                )}
            </div>

            <div>
                <span className="text-[var(--text-secondary)] text-xs font-semibold">Position & Size</span>
                <div className="grid grid-cols-4 gap-1 mt-0.5">
                    {(['x', 'y', 'width', 'height'] as const).map(field => (
                        <label key={field} className="block">
                            <span className="text-[var(--text-muted)] text-[10px] uppercase">{field[0].toUpperCase()}</span>
                            <input type="number" value={element[field]} step={0.1} min={field === 'width' || field === 'height' ? 1 : undefined}
                                onChange={e => onUpdate({ [field]: parseFloat(e.target.value) || 0 })}
                                className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]"
                            />
                        </label>
                    ))}
                </div>
            </div>

            <hr className="border-[var(--border-subtle)]" />

            <div className="space-y-1">
                <span className="text-[var(--text-secondary)] text-xs font-semibold">Visibility Conditions</span>
                <p className="text-[10px] text-[var(--text-muted)]">
                    Element is only shown when all conditions are met.
                </p>
                <ConditionsEditor
                    conditions={element.conditions}
                    project={project}
                    onChange={conditions => onUpdate({ conditions })}
                />
            </div>

            <hr className="border-[var(--border-subtle)]" />

            <UIActionsListEditor
                actions={element.actions || []}
                project={project}
                targetableElements={targetable}
                onChange={actions => onUpdate({ actions })}
                label={element.draggable ? 'Click Actions (non-drag)' : 'Click Actions'}
            />

            {onDelete && (
                <>
                    <hr className="border-[var(--border-subtle)]" />
                    <button onClick={onDelete} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors">
                        <TrashIcon /> Delete Element
                    </button>
                </>
            )}
            </div>
        </Panel>
    );
};
