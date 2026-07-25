/**
 * InteractiveElementInspectors
 * ────────────────────────────
 * Inspector panels for hot spots and interactive elements (draggable images /
 * buttons / text / image maps / etc.) that live on a regular screen.
 *
 * The external API is typed against the unified `VNUIElement` types. Internally
 * these components still build patches in the legacy `VNHotSpot` /
 * `VNHotZoneElement` runtime shapes and translate at the boundary, so the JSX
 * can stay unchanged — purely an implementation detail, no save/load impact.
 */
import React, { useMemo } from 'react';
import { ColorInput } from '../ui/Form';
import CursorSelect from '../ui/CursorSelect';
import { useTranslation } from 'react-i18next';
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
import { draggableImageElementRegion } from '../../features/scene/types';
import { UIActionType } from '../../types/shared';
import { PlusIcon, TrashIcon } from '../icons';
import Panel from '../ui/Panel';
import ConditionsEditor from '../ui/ConditionsEditor';
import VideoTrimFields from '../ui/VideoTrimFields';
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
    if ('dragTag' in patch) out.dragTag = patch.dragTag;
    if ('hoverCursor' in patch) out.hoverCursor = patch.hoverCursor;
    if ('hoverCursorImage' in patch) out.hoverCursorImage = patch.hoverCursorImage;
    if ('boundItemId' in patch) out.boundItemId = patch.boundItemId;
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
            if ('videoTrimStart' in patch) (out as any).videoTrimStart = patch.videoTrimStart;
            if ('videoTrimEnd' in patch) (out as any).videoTrimEnd = patch.videoTrimEnd;
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
        case UIElementType.draggableImageElement: {
            if ('imageId' in patch) {
                const id = patch.imageId as VNID;
                out.image = id ? { type: 'image', id } : null;
            }
            if ('hoverImageId' in patch) {
                const id = patch.hoverImageId as VNID | undefined;
                out.hoverImage = id ? { type: 'image', id } : null;
            }
            if ('draggableImageElementRegions' in patch) out.draggableImageElementRegions = patch.draggableImageElementRegions;
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
        case UIElementType.draggableImageElement: {
            return {
                id: el.id, name: el.name, elementType: 'draggableImageElement',
                imageId: ((el as any).image?.id ?? '') as VNID,
                hoverImageId: (el as any).hoverImage?.id,
                draggableImageElementRegions: (el as any).draggableImageElementRegions,
                x: el.x, y: el.y, width: el.width, height: el.height,
                draggable: anyEl.draggable, snapBack: anyEl.snapBack,
                snapToHotSpot: anyEl.snapToHotSpot, hideOnDrop: anyEl.hideOnDrop, dragTag: anyEl.dragTag, boundItemId: anyEl.boundItemId, hoverCursor: anyEl.hoverCursor, hoverCursorImage: anyEl.hoverCursorImage,
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
                videoTrimStart: anyEl.videoTrimStart, videoTrimEnd: anyEl.videoTrimEnd,
                x: el.x, y: el.y, width: el.width, height: el.height,
                draggable: anyEl.draggable, snapBack: anyEl.snapBack,
                snapToHotSpot: anyEl.snapToHotSpot, hideOnDrop: anyEl.hideOnDrop, dragTag: anyEl.dragTag, boundItemId: anyEl.boundItemId, hoverCursor: anyEl.hoverCursor, hoverCursorImage: anyEl.hoverCursorImage,
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
                snapToHotSpot: anyEl.snapToHotSpot, hideOnDrop: anyEl.hideOnDrop, dragTag: anyEl.dragTag, boundItemId: anyEl.boundItemId, hoverCursor: anyEl.hoverCursor, hoverCursorImage: anyEl.hoverCursorImage,
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
                snapToHotSpot: anyEl.snapToHotSpot, hideOnDrop: anyEl.hideOnDrop, dragTag: anyEl.dragTag, boundItemId: anyEl.boundItemId, hoverCursor: anyEl.hoverCursor, hoverCursorImage: anyEl.hoverCursorImage,
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
                snapToHotSpot: anyEl.snapToHotSpot, hideOnDrop: anyEl.hideOnDrop, dragTag: anyEl.dragTag, boundItemId: anyEl.boundItemId, hoverCursor: anyEl.hoverCursor, hoverCursorImage: anyEl.hoverCursorImage,
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
    /** Drag tags already used by draggable objects on this screen — for the Accept-tag autocomplete. */
    dragTagOptions?: string[];
    onUpdate: (patch: Partial<UIHotSpotElement>) => void;
    /** Removes this hot spot from the screen. */
    onDelete?: () => void;
}> = ({ spot, project, targetableElements, dragTagOptions = [], onUpdate: typedOnUpdate, onDelete }) => {
    const { t } = useTranslation('ui');
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
        <Panel title={t('hotZone.propsHotSpot')} className="w-96 flex-shrink-0">
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3 text-sm">
            <h4 className="font-bold text-sky-300 flex items-center gap-2">
                Hot Spot Properties
                <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400">
                    {spot.trigger}
                </span>
            </h4>

            <label className="block">
                <span className="text-[var(--text-secondary)] text-xs">{t('hotZone.name')}</span>
                <input
                    type="text"
                    value={spot.name}
                    onChange={e => onUpdate({ name: e.target.value })}
                    className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                />
            </label>

            <div className="grid grid-cols-2 gap-2">
                <label className="block">
                    <span className="text-[var(--text-secondary)] text-xs">{t('hotZone.shape')}</span>
                    <select
                        value={spot.shape}
                        onChange={e => onUpdate({ shape: e.target.value as HotSpotShape })}
                        className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                    >
                        <option value="rect">{t('hotZone.shapeRect')}</option>
                        <option value="circle">{t('hotZone.shapeCircle')}</option>
                    </select>
                </label>
                <label className="block">
                    <span className="text-[var(--text-secondary)] text-xs">{t('hotZone.trigger')}</span>
                    <select
                        value={spot.trigger}
                        onChange={e => onUpdate({ trigger: e.target.value as HotSpotTrigger })}
                        className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                    >
                        <option value="click">{t('hotZone.trigClick')}</option>
                        <option value="hover">{t('hotZone.trigHover')}</option>
                        <option value="drag-drop">{t('hotZone.trigDragDrop')}</option>
                    </select>
                </label>
            </div>
            <CursorSelect value={{ hoverCursor: (spot as any).hoverCursor, hoverCursorImage: (spot as any).hoverCursorImage }} onChange={patch => onUpdate(patch as any)} />

            {spot.trigger === 'drag-drop' && (
                <div className="space-y-2 rounded-md border border-[var(--border-subtle)] p-2 bg-[var(--bg-primary)]/40">
                    <p className="text-[10px] text-[var(--text-muted)]">{t('hotZone.dropHowHint', 'Choose what this drop zone accepts. Use a tag for groups of objects (easiest), or tick specific objects below.')}</p>
                    {/* Easiest path: accept-by-tag */}
                    <label className="block">
                        <span className="text-[var(--text-secondary)] text-xs font-semibold">{t('hotZone.acceptTagLabel', 'Accept objects tagged')}</span>
                        <input
                            type="text"
                            list="flourish-drag-tags"
                            value={spot.acceptTag || ''}
                            placeholder={t('hotZone.acceptTagPlaceholder', 'e.g. key — leave empty to accept any')}
                            onChange={e => onUpdate({ acceptTag: e.target.value || undefined })}
                            className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                        />
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{t('hotZone.acceptTagHelp', 'Type the same word you put in an object’s “Drag tag”. Tip: tag every key “key”, then accept “key” here so any key works.')}</p>
                    </label>
                    <div>
                    <span className="text-[var(--text-secondary)] text-xs font-semibold">{t('hotZone.acceptedElements')}</span>
                    <p className="text-[10px] text-[var(--text-muted)] mb-1">{t('hotZone.acceptedHint')}</p>
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
                            <p className="text-[10px] text-slate-500 italic">{t('hotZone.noElementsYet')}</p>
                        )}
                    </div>
                    </div>
                    <datalist id="flourish-drag-tags">
                        {dragTagOptions.map(tag => <option key={tag} value={tag} />)}
                    </datalist>
                </div>
            )}

            <div className="flex gap-2">
                <label className="block flex-1">
                    <span className="text-[var(--text-secondary)] text-xs">{t('hotZone.highlightColor')}</span>
                    <ColorInput value={spot.highlightColor || '#3b82f6'} onChange={v => onUpdate({ highlightColor: v })} />
                </label>
                <label className="flex items-end gap-1.5 pb-0.5">
                    <input
                        type="checkbox"
                        checked={spot.visible ?? false}
                        onChange={e => onUpdate({ visible: e.target.checked })}
                    />
                    <span className="text-[var(--text-secondary)] text-xs">{t('hotZone.visible')}</span>
                </label>
            </div>

            {(spot.visible ?? false) && (
                <label className="block">
                    <span className="text-[var(--text-secondary)] text-xs">{t('hotZone.visibleOpacity', 'See-through (opacity)')}: {Math.round((spot.visibleOpacity ?? 1) * 100)}%</span>
                    <input
                        type="range" min={0} max={100} step={5}
                        value={Math.round((spot.visibleOpacity ?? 1) * 100)}
                        onChange={e => onUpdate({ visibleOpacity: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) / 100 })}
                        className="w-full accent-[var(--accent-lavender)]"
                    />
                </label>
            )}

            <div>
                <span className="text-[var(--text-secondary)] text-xs font-semibold">{t('hotZone.positionSize')}</span>
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

            <ConditionsEditor
                collapsible
                title={t('hotZone.visibilityConditions')}
                hint="Hot spot is only active when all conditions are met."
                conditions={spot.conditions}
                project={project}
                onChange={conditions => onUpdate({ conditions })}
            />

            <hr className="border-[var(--border-subtle)]" />

            <UIActionsListEditor
                actions={spot.actions}
                project={project}
                targetableElements={targetable}
                onChange={actions => onUpdate({ actions })}
                label={t('hotZone.triggerActions')}
            />

            {onDelete && (
                <>
                    <hr className="border-[var(--border-subtle)]" />
                    <button onClick={onDelete} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors">
                        <TrashIcon /> {t('hotZone.deleteHotSpot')}
                    </button>
                </>
            )}
            </div>
        </Panel>
    );
};

const CONVERT_DEFAULT_FONT: VNFontSettings = { family: 'sans-serif', size: 16, color: '#ffffff', weight: 'normal', italic: false };

// Type-specific fields wiped when an interactive element changes kind. Base fields
// (id/name/position/interactive/draggable/snap/actions/conditions/sounds) are preserved by
// the reducer's shallow merge; the cleared keys become `undefined` and are dropped on JSON
// export, so no stale data from the previous kind survives a save/load round-trip.
const TYPE_SPECIFIC_FIELDS = [
    'background', 'image', 'objectFit', 'text', 'font', 'textAlign', 'verticalAlign',
    'action', 'hoverImage', 'backgroundColor', 'placeholder', 'variableId', 'borderColor',
    'maxLength', 'draggableImageElementRegions',
];

/** Convert an interactive element to a different kind in place, preserving shared base
 *  fields and carrying over any compatible content (image asset, text, font, regions…).
 *  Returns a `Partial<VNUIElement>` patch for the reducer (merged over the current element). */
function convertInteractiveElementType(current: VNUIElement, newType: HotZoneElementType): Partial<VNUIElement> {
    const legacy = toLegacyHotZoneElement(current);
    const cleared: any = {};
    for (const f of TYPE_SPECIFIC_FIELDS) cleared[f] = undefined;
    const imgId = (legacy?.imageId as VNID) || '';
    let typed: any;
    switch (newType) {
        case 'image':
            typed = { type: UIElementType.Image, background: imgId ? { type: 'image', assetId: imgId } : { type: 'color', value: '#00000000' }, image: imgId ? { type: 'image', id: imgId } : null, objectFit: 'contain' };
            break;
        case 'video': {
            const vid = legacy?.videoId as VNID | undefined;
            typed = { type: UIElementType.Image, background: vid ? { type: 'video', assetId: vid } : { type: 'color', value: '#00000000' }, image: null, objectFit: 'contain' };
            break;
        }
        case 'text':
            typed = { type: UIElementType.Text, text: legacy?.text || legacy?.name || '', font: legacy?.font || CONVERT_DEFAULT_FONT, textAlign: 'center', verticalAlign: 'middle' };
            break;
        case 'button':
            typed = { type: UIElementType.Button, text: legacy?.text || legacy?.name || '', font: legacy?.font || CONVERT_DEFAULT_FONT, action: (current as any).actions?.[0] || { type: UIActionType.None }, image: imgId ? { type: 'image', id: imgId } : null, hoverImage: null, backgroundColor: legacy?.backgroundColor };
            break;
        case 'textInput':
            typed = { type: UIElementType.TextInput, placeholder: legacy?.placeholder || '', variableId: legacy?.variableId, font: legacy?.font || CONVERT_DEFAULT_FONT, backgroundColor: legacy?.backgroundColor, borderColor: legacy?.borderColor, maxLength: legacy?.maxLength };
            break;
        case 'draggableImageElement':
            typed = { type: UIElementType.draggableImageElement, image: imgId ? { type: 'image', id: imgId } : null, hoverImage: legacy?.hoverImageId ? { type: 'image', id: legacy.hoverImageId } : null, draggableImageElementRegions: legacy?.draggableImageElementRegions || [] };
            break;
        default:
            typed = {};
    }
    return { ...cleared, ...typed };
}

export const InteractiveElementProperties: React.FC<{
    element: VNUIElement;
    project: VNProject;
    /** Names of draggable elements on the screen — used by the inner actions
     *  editor's target-element pickers. */
    targetableElements: { id: VNID; name: string }[];
    /** Drag tags already used on this screen — for the Drag-tag autocomplete. */
    dragTagOptions?: string[];
    onUpdate: (patch: Partial<VNUIElement>) => void;
    /** Removes this element (draggable / image map) from the screen. */
    onDelete?: () => void;
}> = ({ element: typedElement, project, targetableElements, dragTagOptions = [], onUpdate: typedOnUpdate, onDelete }) => {
    const { t } = useTranslation('ui');
    const element = toLegacyHotZoneElement(typedElement);
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

    // Missing-element return must stay BELOW every hook — an early return between hooks
    // changes the hook count across renders and crashes React ("Rendered fewer hooks").
    if (!element) return null;
    // Existing JSX produces Partial<VNHotZoneElement> patches; translate at the
    // boundary so the external API stays typed.
    const onUpdate = (patch: Partial<VNHotZoneElement>) =>
        typedOnUpdate(hotZoneElementPatchToTyped(patch, typedElement));
    const targetable = targetableElements;

    const elType = element.elementType || 'image';
    const defaultFont: VNFontSettings = { family: 'sans-serif', size: 16, color: '#ffffff', weight: 'normal', italic: false };
    const panelTitle = elType === 'draggableImageElement' ? t('hotZone.propsdraggableImageElement')
        : element.draggable ? t('hotZone.propsDraggable')
        : t('hotZone.propsType', { type: `${elType.charAt(0).toUpperCase()}${elType.slice(1)}` });

    return (
        <Panel title={panelTitle} className="w-96 flex-shrink-0">
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3 text-sm">
            <h4 className="font-bold text-purple-300 flex items-center gap-2">
                Element Properties
                {element.draggable && (
                    <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                        draggable
                    </span>
                )}
            </h4>

            <label className="block">
                <span className="text-[var(--text-secondary)] text-xs">{t('hotZone.name')}</span>
                <input
                    type="text"
                    value={element.name}
                    onChange={e => onUpdate({ name: e.target.value })}
                    className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                />
            </label>

            <label className="block">
                <span className="text-[var(--text-secondary)] text-xs">{t('hotZone.elementType')}</span>
                <select
                    value={elType}
                    onChange={e => typedOnUpdate(convertInteractiveElementType(typedElement, e.target.value as HotZoneElementType))}
                    className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                >
                    <option value="image">{t('hotZone.typeImage')}</option>
                    <option value="text">{t('hotZone.typeText')}</option>
                    <option value="button">{t('hotZone.typeButton')}</option>
                    <option value="video">{t('hotZone.typeVideo')}</option>
                    <option value="textInput">{t('hotZone.typeTextInput')}</option>
                    <option value="draggableImageElement">{t('hotZone.typedraggableImageElement')}</option>
                </select>
            </label>

            {(elType === 'image' || elType === 'button' || elType === 'draggableImageElement') && (
                <label className="block">
                    <span className="text-[var(--text-secondary)] text-xs">{elType === 'button' ? 'Background Image' : elType === 'draggableImageElement' ? 'Map Background Image' : 'Image Asset'}</span>
                    <select
                        value={element.imageId}
                        onChange={e => onUpdate({ imageId: e.target.value as VNID })}
                        className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                    >
                        <option value="">{t('hotZone.selectImage')}</option>
                        {imageAssets.map((img: any) => (
                            <option key={img.id} value={img.id}>{img.name || img.id}</option>
                        ))}
                    </select>
                </label>
            )}

            {elType === 'draggableImageElement' && (
                <label className="block">
                    <span className="text-[var(--text-secondary)] text-xs">{t('hotZone.hoverStateImage')}</span>
                    <select
                        value={element.hoverImageId || ''}
                        onChange={e => onUpdate({ hoverImageId: (e.target.value || undefined) as VNID | undefined })}
                        className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                    >
                        <option value="">{t('hotZone.none')}</option>
                        {imageAssets.map((img: any) => (
                            <option key={img.id} value={img.id}>{img.name || img.id}</option>
                        ))}
                    </select>
                    <span className="text-[var(--text-muted)] text-[9px]">{t('hotZone.hoverClipNote')}</span>
                </label>
            )}

            {elType === 'video' && (
                <>
                    <label className="block">
                        <span className="text-[var(--text-secondary)] text-xs">{t('hotZone.videoAsset')}</span>
                        <select
                            value={element.videoId || ''}
                            onChange={e => onUpdate({ videoId: e.target.value as VNID })}
                            className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                        >
                            <option value="">{t('hotZone.selectVideo')}</option>
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
                    <VideoTrimFields className="mt-2" start={(element as any).videoTrimStart} end={(element as any).videoTrimEnd}
                        onChange={patch => onUpdate({ videoTrimStart: patch.trimStart, videoTrimEnd: patch.trimEnd } as any)} />
                </>
            )}

            {elType === 'textInput' && (
                <>
                    <label className="block">
                        <span className="text-[var(--text-secondary)] text-xs">{t('hotZone.bindToVariable')}</span>
                        <select
                            value={element.variableId || ''}
                            onChange={e => onUpdate({ variableId: e.target.value as VNID })}
                            className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                        >
                            <option value="">{t('hotZone.selectVariable')}</option>
                            {Object.values(project.variables).map((v: any) => (
                                <option key={v.id} value={v.id}>{v.name} ({v.type})</option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-[var(--text-secondary)] text-xs">{t('hotZone.placeholder')}</span>
                        <input
                            type="text"
                            value={element.placeholder || ''}
                            onChange={e => onUpdate({ placeholder: e.target.value })}
                            placeholder={t('hotZone.enterText')}
                            className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                        />
                    </label>
                    <label className="block">
                        <span className="text-[var(--text-secondary)] text-xs">{t('hotZone.maxLength')}</span>
                        <input
                            type="number"
                            value={element.maxLength || ''}
                            onChange={e => onUpdate({ maxLength: e.target.value ? Number(e.target.value) : undefined })}
                            placeholder={t('hotZone.noLimit')}
                            min={1}
                            className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                        />
                    </label>
                    <div className="grid grid-cols-2 gap-1">
                        <label className="block">
                            <span className="text-[var(--text-muted)] text-[10px]">{t('hotZone.background')}</span>
                            <ColorInput value={element.backgroundColor || '#1e293b'} onChange={v => onUpdate({ backgroundColor: v })} />
                        </label>
                        <label className="block">
                            <span className="text-[var(--text-muted)] text-[10px]">{t('hotZone.border')}</span>
                            <ColorInput value={element.borderColor || '#475569'} onChange={v => onUpdate({ borderColor: v })} />
                        </label>
                    </div>
                </>
            )}

            {elType === 'draggableImageElement' && (() => {
                const regions = element.draggableImageElementRegions || [];
                const addRegion = () => {
                    const newRegion: draggableImageElementRegion = {
                        id: generateId('imr') as VNID,
                        name: `Region ${regions.length + 1}`,
                        shape: 'rect',
                        coords: [25, 25, 50, 50],
                        actions: [],
                        tooltip: '',
                        cursor: 'pointer',
                        highlightColor: 'rgba(16,185,129,0.3)',
                    };
                    onUpdate({ draggableImageElementRegions: [...regions, newRegion] });
                };
                const updateRegion = (idx: number, patch: Partial<draggableImageElementRegion>) => {
                    const newRegions = [...regions];
                    newRegions[idx] = { ...newRegions[idx], ...patch };
                    onUpdate({ draggableImageElementRegions: newRegions });
                };
                const removeRegion = (idx: number) => {
                    onUpdate({ draggableImageElementRegions: regions.filter((_, i) => i !== idx) });
                };

                return (
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-[var(--text-secondary)] text-xs font-semibold">{t('hotZone.clickableRegions', { count: regions.length })}</span>
                            <button onClick={addRegion} className="flex items-center gap-1 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white px-1.5 py-0.5 rounded transition-colors">
                                <PlusIcon className="w-3 h-3" /> {t('hotZone.add')}
                            </button>
                        </div>

                        {regions.map((region, idx) => (
                            <div key={region.id} className="p-2 bg-[var(--bg-primary)] rounded border border-emerald-500/30 space-y-1">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-bold text-emerald-300">{t('hotZone.region', { n: idx + 1 })}</span>
                                    <button onClick={() => removeRegion(idx)} className="text-red-400 hover:text-red-300 p-0.5" title={t('hotZone.removeRegion')}>
                                        <TrashIcon className="w-3 h-3" />
                                    </button>
                                </div>

                                <label className="block">
                                    <span className="text-[var(--text-muted)] text-[10px]">{t('hotZone.name')}</span>
                                    <input type="text" value={region.name} onChange={e => updateRegion(idx, { name: e.target.value })}
                                        className="w-full mt-0.5 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]" />
                                </label>

                                <label className="block">
                                    <span className="text-[var(--text-muted)] text-[10px]">{t('hotZone.shape')}</span>
                                    <select value={region.shape} onChange={e => {
                                        const shape = e.target.value as 'rect' | 'circle' | 'poly';
                                        const defaultCoords = shape === 'rect' ? [25, 25, 50, 50] : shape === 'circle' ? [50, 50, 25] : [25, 25, 75, 25, 75, 75, 25, 75];
                                        updateRegion(idx, { shape, coords: defaultCoords });
                                    }} className="w-full mt-0.5 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]">
                                        <option value="rect">{t('hotZone.shapeRect')}</option>
                                        <option value="circle">{t('hotZone.shapeCircle')}</option>
                                        <option value="poly">{t('hotZone.shapePoly')}</option>
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
                                        <span className="text-[var(--text-muted)] text-[10px]">{t('hotZone.points')}</span>
                                        {Array.from({ length: Math.floor(region.coords.length / 2) }).map((_, pi) => (
                                            <div key={pi} className="grid grid-cols-3 gap-1 items-end">
                                                <input type="number" value={region.coords[pi * 2] ?? 0} onChange={e => { const c = [...region.coords]; c[pi * 2] = parseFloat(e.target.value) || 0; updateRegion(idx, { coords: c }); }}
                                                    className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]" title={`P${pi + 1} X`} />
                                                <input type="number" value={region.coords[pi * 2 + 1] ?? 0} onChange={e => { const c = [...region.coords]; c[pi * 2 + 1] = parseFloat(e.target.value) || 0; updateRegion(idx, { coords: c }); }}
                                                    className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]" title={`P${pi + 1} Y`} />
                                                <button onClick={() => { const c = [...region.coords]; c.splice(pi * 2, 2); updateRegion(idx, { coords: c.length >= 2 ? c : [50, 50] }); }}
                                                    className="text-red-400 hover:text-red-300 text-[10px] p-0.5" title={t('hotZone.removePoint')}>✕</button>
                                            </div>
                                        ))}
                                        <button onClick={() => updateRegion(idx, { coords: [...region.coords, 50, 50] })}
                                            className="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white px-1.5 py-0.5 rounded transition-colors">{t('hotZone.addPoint')}</button>
                                    </div>
                                )}

                                <label className="block">
                                    <span className="text-[var(--text-muted)] text-[10px]">{t('hotZone.tooltip')}</span>
                                    <input type="text" value={region.tooltip || ''} onChange={e => updateRegion(idx, { tooltip: e.target.value })} placeholder={t('hotZone.hoverText')}
                                        className="w-full mt-0.5 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]" />
                                </label>

                                <label className="block">
                                    <span className="text-[var(--text-muted)] text-[10px]">{t('hotZone.highlightColor')}</span>
                                    <ColorInput value={region.highlightColor?.startsWith('rgba') ? '#10b981' : (region.highlightColor || '#10b981')} onChange={v => updateRegion(idx, { highlightColor: v + '4D' })} />
                                </label>

                                <UIActionsListEditor
                                    actions={region.actions || []}
                                    project={project}
                                    targetableElements={targetable}
                                    onChange={actions => updateRegion(idx, { actions })}
                                    label={t('hotZone.onClickActions')}
                                />

                                <ConditionsEditor
                                    collapsible
                                    title={t('conditions.sectionTitle')}
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
                    <span className="text-[var(--text-secondary)] text-xs">{t('hotZone.text')}</span>
                    <input
                        type="text"
                        value={element.text || ''}
                        onChange={e => onUpdate({ text: e.target.value })}
                        placeholder={t('hotZone.displayText')}
                        className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                    />
                </label>
            )}

            {(elType === 'text' || elType === 'button' || elType === 'textInput') && (() => {
                const font = element.font || defaultFont;
                const updateFont = (updates: Partial<VNFontSettings>) => onUpdate({ font: { ...font, ...updates } });
                return (
                    <div className="space-y-1">
                        <span className="text-[var(--text-secondary)] text-xs font-semibold">{t('hotZone.font')}</span>
                        <div className="grid grid-cols-2 gap-1">
                            <input type="number" value={font.size} min={8} max={120}
                                onChange={e => updateFont({ size: Number(e.target.value) })}
                                className="bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]"
                                title={t('hotZone.fontSize')}
                            />
                            <ColorInput value={font.color} onChange={v => updateFont({ color: v })} />
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
                <span className="text-[var(--text-secondary)] text-xs font-semibold">{t('hotZone.sounds')}</span>
                <label className="block">
                    <span className="text-[var(--text-muted)] text-[10px]">{t('hotZone.clickSound')}</span>
                    <select
                        value={element.clickSoundId || ''}
                        onChange={e => onUpdate({ clickSoundId: (e.target.value || null) as VNID | null })}
                        className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]"
                    >
                        <option value="">{t('hotZone.noneOption')}</option>
                        {audioAssets.map((a: any) => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
                    </select>
                </label>
                <label className="block">
                    <span className="text-[var(--text-muted)] text-[10px]">{t('hotZone.hoverSound')}</span>
                    <select
                        value={element.hoverSoundId || ''}
                        onChange={e => onUpdate({ hoverSoundId: (e.target.value || null) as VNID | null })}
                        className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]"
                    >
                        <option value="">{t('hotZone.noneOption')}</option>
                        {audioAssets.map((a: any) => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
                    </select>
                </label>
            </div>

            <div className="space-y-1">
                <span className="text-[var(--text-secondary)] text-xs font-semibold">{t('hotZone.behavior')}</span>
                <label className="flex items-center gap-2 text-xs px-1 py-0.5 rounded hover:bg-[var(--bg-secondary)]">
                    <input
                        type="checkbox"
                        checked={element.draggable ?? false}
                        onChange={e => onUpdate({ draggable: e.target.checked })}
                    />
                    <span className="text-[var(--text-secondary)]">{t('hotZone.draggableByPlayer')}</span>
                </label>

                {element.draggable && (
                    <>
                        <label className="flex items-center gap-2 text-xs px-1 py-0.5 rounded hover:bg-[var(--bg-secondary)] ml-3">
                            <input
                                type="checkbox"
                                checked={element.snapBack ?? false}
                                onChange={e => onUpdate({ snapBack: e.target.checked })}
                            />
                            <span className="text-[var(--text-secondary)]">{t('hotZone.snapBack')}</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs px-1 py-0.5 rounded hover:bg-[var(--bg-secondary)] ml-3">
                            <input
                                type="checkbox"
                                checked={element.snapToHotSpot ?? false}
                                onChange={e => onUpdate({ snapToHotSpot: e.target.checked })}
                            />
                            <span className="text-[var(--text-secondary)]">{t('hotZone.snapCenter')}</span>
                        </label>
                        {element.snapToHotSpot && (
                            <label className="flex items-center gap-2 text-xs px-1 py-0.5 rounded hover:bg-[var(--bg-secondary)] ml-6">
                                <input
                                    type="checkbox"
                                    checked={element.hideOnDrop ?? false}
                                    onChange={e => onUpdate({ hideOnDrop: e.target.checked })}
                                />
                                <span className="text-[var(--text-secondary)]">{t('hotZone.hideOnDrop')}</span>
                            </label>
                        )}
                        <label className="block ml-3 mt-1">
                            <span className="text-[var(--text-secondary)] text-xs font-semibold">{t('hotZone.dragTagLabel', 'Drag tag')}</span>
                            <input
                                type="text"
                                list="flourish-drag-tags"
                                value={element.dragTag || ''}
                                placeholder={t('hotZone.dragTagPlaceholder', 'e.g. key')}
                                onChange={e => onUpdate({ dragTag: e.target.value || undefined })}
                                className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                            />
                            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{t('hotZone.dragTagHelp', 'Give this object a label so a drop zone can accept it by tag. Give several objects the same tag to make them interchangeable (e.g. all keys “key”). Optional.')}</p>
                        </label>
                        <label className="block ml-3 mt-1">
                            <span className="text-[var(--text-secondary)] text-xs font-semibold">{t('hotZone.boundItem', 'This object is an item (optional)')}</span>
                            <select
                                value={element.boundItemId || ''}
                                onChange={e => onUpdate({ boundItemId: (e.target.value || undefined) as VNID | undefined })}
                                className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                            >
                                <option value="">{t('hotZone.boundItemNone', '— none —')}</option>
                                {(Object.values(project.items || {}) as any[]).map(it => (
                                    <option key={it.id} value={it.id}>{it.name || it.id}</option>
                                ))}
                            </select>
                            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{t('hotZone.boundItemHelp', 'When set, dropping this on a hot spot consumes the item (unless it’s reusable) and runs its use-effect. If Drag tag is empty, the item’s own tag is used to match hot spots.')}</p>
                        </label>
                        <datalist id="flourish-drag-tags">
                            {dragTagOptions.map(tag => <option key={tag} value={tag} />)}
                        </datalist>
                    </>
                )}
                {/* Shown for EVERY interactive element (clickable or draggable) — not just draggables. */}
                <CursorSelect value={{ hoverCursor: (element as any).hoverCursor, hoverCursorImage: (element as any).hoverCursorImage }} onChange={patch => onUpdate(patch as any)} />
            </div>

            <div>
                <span className="text-[var(--text-secondary)] text-xs font-semibold">{t('hotZone.positionSize')}</span>
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

            <ConditionsEditor
                collapsible
                title={t('hotZone.visibilityConditions')}
                hint="Element is only shown when all conditions are met."
                conditions={element.conditions}
                project={project}
                onChange={conditions => onUpdate({ conditions })}
            />

            <hr className="border-[var(--border-subtle)]" />

            <UIActionsListEditor
                actions={element.actions || []}
                project={project}
                targetableElements={targetable}
                onChange={actions => onUpdate({ actions })}
                label={element.draggable ? t('hotZone.clickActionsNonDrag') : t('hotZone.clickActions')}
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
