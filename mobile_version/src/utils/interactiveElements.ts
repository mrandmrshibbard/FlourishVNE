/**
 * Interactive-element runtime adapters
 * ────────────────────────────────────
 * Every screen stores its widgets — hot spots, image maps, and draggable
 * elements included — as `VNUIElement` entries in `screen.elements` (the old
 * separate "hot zone" screen type was retired and migrated away).
 *
 * The interactive runtime in LivePreview was originally written against the
 * older `VNHotSpot` / draggable-element shapes, so this module:
 *   - classifies unified elements (`isHotSpotElement`, `isInteractiveElement`), and
 *   - derives the legacy runtime-adapter shapes the runtime still consumes
 *     (`deriveHotSpotsFromScreen`, `deriveInteractiveElementsFromScreen`).
 *
 * The adapter shapes are an internal implementation detail of the runtime — they
 * are NOT a screen concept and never touch save/load (export deep-clones
 * `screen.elements` as-is).
 */

import { VNID } from '../types';
import {
    VNUIScreen,
    VNUIElement,
    VNHotSpot,
    VNHotZoneElement,
    UIElementType,
    UIButtonElement,
    UITextElement,
    UIImageElement,
    UITextInputElement,
    UIdraggableImageElementElement,
    UIHotSpotElement,
} from '../features/ui/types';

/** Returns true if this element is a hot spot. */
export function isHotSpotElement(el: VNUIElement): el is UIHotSpotElement {
    return el.type === UIElementType.HotSpot;
}

/** Returns true if this element is an interactive element (handled by the
 *  interactive overlays/runtime rather than the standard renderer).
 *  - HotSpot / draggableImageElement entries are always interactive (no other editor renders them).
 *  - Any element explicitly tagged `interactive: true` stays interactive even when
 *    its `draggable` flag is currently off — this prevents users from accidentally
 *    orphaning a migrated element by unchecking one box.
 *  - Legacy fallback: an element with `draggable: true` but no explicit tag is
 *    also treated as interactive, so projects predating the `interactive` flag
 *    still light up correctly until the recovery pass tags them. */
export function isInteractiveElement(el: VNUIElement): boolean {
    if (el.type === UIElementType.HotSpot || el.type === UIElementType.draggableImageElement) return true;
    const anyEl = el as any;
    if (anyEl.interactive === true) return true;
    if (anyEl.draggable === true) return true;
    return false;
}

/** Translate a `UIHotSpotElement` into the legacy `VNHotSpot` runtime shape — used
 *  internally by `deriveHotSpotsFromScreen`. Field names already match. */
function hotSpotElementToLegacy(el: UIHotSpotElement): VNHotSpot {
    return {
        id: el.id, name: el.name, shape: el.shape, trigger: el.trigger || 'click',
        x: el.x, y: el.y, width: el.width, height: el.height,
        acceptedElementIds: el.acceptedElementIds,
        acceptTag: el.acceptTag,
        actions: el.actions || [],
        conditions: el.conditions,
        highlightColor: el.highlightColor,
        visible: el.visible,
        visibleOpacity: el.visibleOpacity,
    };
}

/** Translate a unified element back into the legacy `VNHotZoneElement` runtime
 *  shape consumed by the interactive runtime. Used internally by
 *  `deriveInteractiveElementsFromScreen`. */
function elementToLegacyHotZoneElement(el: VNUIElement, items?: Record<VNID, { icon?: { type: string; id: VNID } | null; dragTag?: string; countVariableId?: VNID } | undefined>): VNHotZoneElement | null {
    const anyEl = el as any;
    switch (el.type) {
        case UIElementType.Item: {
            // A draggable ITEM element becomes an image-shaped draggable whose art is the item's
            // icon and whose drag identity IS the item: boundItemId feeds the drop pipeline's
            // consume/use-effect, and the item's own dragTag is the fallback matcher.
            const item = anyEl.itemId ? items?.[anyEl.itemId] : undefined;
            const iconIsVideo = item?.icon?.type === 'video';
            return {
                id: el.id, name: el.name,
                elementType: iconIsVideo ? 'video' : 'image',
                imageId: (!iconIsVideo ? (item?.icon?.id ?? '') : '') as VNID,
                videoId: iconIsVideo ? item?.icon?.id : undefined,
                x: el.x, y: el.y, width: el.width, height: el.height,
                draggable: anyEl.draggable, snapBack: anyEl.snapBack ?? true,
                snapToHotSpot: anyEl.snapToHotSpot, hideOnDrop: anyEl.hideOnDrop,
                dragTag: anyEl.dragTag || item?.dragTag,
                boundItemId: anyEl.itemId ?? anyEl.boundItemId,
                // "Only show while the player has it" — the interactive runtime evaluates
                // `conditions` live, so ownership becomes a count-variable condition (the
                // non-draggable render path gates on the same count).
                conditions: anyEl.onlyWhileOwned && item?.countVariableId
                    ? [...(el.conditions || []), { variableId: item.countVariableId, operator: '>=' as const, value: 1 }]
                    : el.conditions,
                actions: anyEl.actions,
                clickSoundId: anyEl.clickSoundId, hoverSoundId: anyEl.hoverSoundId,
            };
        }
        case UIElementType.draggableImageElement: {
            const m = el as UIdraggableImageElementElement;
            return {
                id: m.id, name: m.name, elementType: 'draggableImageElement',
                imageId: (m.image?.id ?? '') as VNID,
                hoverImageId: m.hoverImage?.id,
                draggableImageElementRegions: m.draggableImageElementRegions,
                x: m.x, y: m.y, width: m.width, height: m.height,
                draggable: anyEl.draggable, snapBack: anyEl.snapBack,
                snapToHotSpot: anyEl.snapToHotSpot, hideOnDrop: anyEl.hideOnDrop,
                conditions: m.conditions, actions: anyEl.actions,
                clickSoundId: anyEl.clickSoundId, hoverSoundId: anyEl.hoverSoundId,
            };
        }
        case UIElementType.Image: {
            const img = el as UIImageElement;
            const bg = img.background;
            const isVideo = bg?.type === 'video';
            const isImage = bg?.type === 'image';
            const assetId = (bg && (bg.type === 'image' || bg.type === 'video') ? bg.assetId : null) ?? img.image?.id ?? null;
            return {
                id: img.id, name: img.name,
                elementType: isVideo ? 'video' : 'image',
                imageId: (isImage ? assetId : '') as VNID,
                videoId: isVideo ? (assetId ?? undefined) as VNID | undefined : undefined,
                videoLoop: anyEl.videoLoop, videoMuted: anyEl.videoMuted,
                x: img.x, y: img.y, width: img.width, height: img.height,
                draggable: anyEl.draggable, snapBack: anyEl.snapBack,
                snapToHotSpot: anyEl.snapToHotSpot, hideOnDrop: anyEl.hideOnDrop,
                conditions: img.conditions, actions: anyEl.actions,
                clickSoundId: anyEl.clickSoundId, hoverSoundId: anyEl.hoverSoundId,
            };
        }
        case UIElementType.Text: {
            const t = el as UITextElement;
            return {
                id: t.id, name: t.name, elementType: 'text',
                imageId: '' as VNID, text: t.text, font: t.font,
                x: t.x, y: t.y, width: t.width, height: t.height,
                draggable: anyEl.draggable, snapBack: anyEl.snapBack,
                snapToHotSpot: anyEl.snapToHotSpot, hideOnDrop: anyEl.hideOnDrop,
                conditions: t.conditions, actions: anyEl.actions,
                clickSoundId: anyEl.clickSoundId, hoverSoundId: anyEl.hoverSoundId,
            };
        }
        case UIElementType.Button: {
            const b = el as UIButtonElement;
            return {
                id: b.id, name: b.name, elementType: 'button',
                imageId: (b.image?.id ?? '') as VNID, text: b.text, font: b.font,
                backgroundColor: b.backgroundColor,
                x: b.x, y: b.y, width: b.width, height: b.height,
                draggable: anyEl.draggable, snapBack: anyEl.snapBack,
                snapToHotSpot: anyEl.snapToHotSpot, hideOnDrop: anyEl.hideOnDrop,
                conditions: b.conditions,
                actions: b.actions ?? anyEl.actions,
                clickSoundId: b.clickSoundId ?? null,
                hoverSoundId: b.hoverSoundId ?? null,
            };
        }
        case UIElementType.TextInput: {
            const ti = el as UITextInputElement;
            return {
                id: ti.id, name: ti.name, elementType: 'textInput',
                imageId: '' as VNID,
                placeholder: ti.placeholder, variableId: ti.variableId,
                font: ti.font,
                backgroundColor: ti.backgroundColor,
                borderColor: ti.borderColor,
                maxLength: ti.maxLength,
                x: ti.x, y: ti.y, width: ti.width, height: ti.height,
                draggable: anyEl.draggable, snapBack: anyEl.snapBack,
                snapToHotSpot: anyEl.snapToHotSpot, hideOnDrop: anyEl.hideOnDrop,
                conditions: ti.conditions, actions: anyEl.actions,
                clickSoundId: anyEl.clickSoundId, hoverSoundId: anyEl.hoverSoundId,
            };
        }
        default:
            return null;
    }
}

/** Derive the legacy `hotSpots` runtime map from a screen by scanning
 *  `screen.elements` for `UIHotSpotElement` entries. */
export function deriveHotSpotsFromScreen(screen: VNUIScreen): Record<VNID, VNHotSpot> {
    const out: Record<VNID, VNHotSpot> = {};
    for (const el of Object.values(screen.elements || {}) as VNUIElement[]) {
        if (isHotSpotElement(el)) {
            out[el.id] = hotSpotElementToLegacy(el);
        }
    }
    return out;
}

/** Derive the legacy interactive-element runtime map from a screen by scanning
 *  `screen.elements` for image maps and draggable elements. */
export function deriveInteractiveElementsFromScreen(screen: VNUIScreen, items?: Record<VNID, { icon?: { type: string; id: VNID } | null; dragTag?: string } | undefined>): Record<VNID, VNHotZoneElement> {
    const out: Record<VNID, VNHotZoneElement> = {};
    for (const el of Object.values(screen.elements || {}) as VNUIElement[]) {
        if (el.type === UIElementType.HotSpot) continue;
        if (el.type === UIElementType.draggableImageElement || (el as any).draggable === true) {
            const legacy = elementToLegacyHotZoneElement(el, items);
            if (legacy) out[el.id] = legacy;
        }
    }
    return out;
}
