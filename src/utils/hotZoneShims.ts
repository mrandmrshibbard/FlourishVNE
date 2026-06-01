/**
 * Hot zone runtime derivation helpers
 * ───────────────────────────────────
 * The unified screen schema stores hot spots, image maps, and draggable
 * elements as `VNUIElement` entries in `screen.elements`. The HotZoneRuntime
 * inside LivePreview was written against the legacy `VNHotSpot` /
 * `VNHotZoneElement` shapes, so this module derives those shapes on the fly
 * from the unified data.
 *
 * Phase 4.5 retired the legacy *update* translators that lived here — the
 * inspector components now own their own conversion internally and the
 * canvas overlays consume typed `VNUIElement` props directly. What's left
 * here is purely the runtime derivation needed by HotZoneRuntime, plus the
 * two predicates that consumers use to filter `screen.elements`.
 *
 * Phase 5 (future) will refactor HotZoneRuntime to consume `screen.elements`
 * directly and this module can be deleted.
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
    UIImageMapElement,
    UIHotSpotElement,
} from '../features/ui/types';

/** Returns true if this element is a hot spot. */
export function isHotSpotElement(el: VNUIElement): el is UIHotSpotElement {
    return el.type === UIElementType.HotSpot;
}

/** Returns true if this element belongs to the hot zone editor.
 *  - HotSpot / ImageMap entries are always interactive (no other editor renders them).
 *  - Any element explicitly tagged `interactive: true` stays in the hot zone editor
 *    even when its `draggable` flag is currently off — this prevents users from
 *    accidentally orphaning a migrated hot zone element by unchecking one box.
 *  - Legacy fallback: an element with `draggable: true` but no explicit tag is
 *    also treated as interactive, so projects predating the `interactive` flag
 *    still light up correctly until the recovery pass tags them. */
export function isInteractiveElement(el: VNUIElement): boolean {
    if (el.type === UIElementType.HotSpot || el.type === UIElementType.ImageMap) return true;
    const anyEl = el as any;
    if (anyEl.interactive === true) return true;
    if (anyEl.draggable === true) return true;
    return false;
}

/** Translate a `UIHotSpotElement` into the legacy `VNHotSpot` shape — used
 *  internally by `deriveHotSpotsFromScreen`. Field names already match. */
function hotSpotElementToLegacy(el: UIHotSpotElement): VNHotSpot {
    return {
        id: el.id, name: el.name, shape: el.shape, trigger: el.trigger,
        x: el.x, y: el.y, width: el.width, height: el.height,
        acceptedElementIds: el.acceptedElementIds,
        actions: el.actions || [],
        conditions: el.conditions,
        highlightColor: el.highlightColor,
        visible: el.visible,
    };
}

/** Translate a unified element back into the legacy `VNHotZoneElement` shape
 *  used by `HotZoneRuntime`. Used internally by `deriveHotZoneElementsFromScreen`. */
function elementToLegacyHotZoneElement(el: VNUIElement): VNHotZoneElement | null {
    const anyEl = el as any;
    switch (el.type) {
        case UIElementType.ImageMap: {
            const m = el as UIImageMapElement;
            return {
                id: m.id, name: m.name, elementType: 'imageMap',
                imageId: (m.image?.id ?? '') as VNID,
                hoverImageId: m.hoverImage?.id,
                imageMapRegions: m.imageMapRegions,
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

/** Derive the legacy `hotSpots` map from a screen by scanning `screen.elements`
 *  for `UIHotSpotElement` entries. */
export function deriveHotSpotsFromScreen(screen: VNUIScreen): Record<VNID, VNHotSpot> {
    const out: Record<VNID, VNHotSpot> = {};
    for (const el of Object.values(screen.elements || {}) as VNUIElement[]) {
        if (isHotSpotElement(el)) {
            out[el.id] = hotSpotElementToLegacy(el);
        }
    }
    return out;
}

/** Derive the legacy `hotZoneElements` map from a screen by scanning
 *  `screen.elements` for image maps and draggable elements. */
export function deriveHotZoneElementsFromScreen(screen: VNUIScreen): Record<VNID, VNHotZoneElement> {
    const out: Record<VNID, VNHotZoneElement> = {};
    for (const el of Object.values(screen.elements || {}) as VNUIElement[]) {
        if (el.type === UIElementType.HotSpot) continue;
        if (el.type === UIElementType.ImageMap || (el as any).draggable === true) {
            const legacy = elementToLegacyHotZoneElement(el);
            if (legacy) out[el.id] = legacy;
        }
    }
    return out;
}
