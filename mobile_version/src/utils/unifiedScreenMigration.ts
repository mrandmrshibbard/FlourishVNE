/**
 * Unified-screen migration
 * ────────────────────────
 * Converts pre-unified projects (which had a separate `screenType: 'hotzone'`
 * with side maps `hotZoneElements` / `hotSpots`) into the unified schema
 * where every screen holds hot spots, draggable elements, image maps, and
 * regular UI widgets together in `screen.elements`.
 *
 * History of the in-flight migration phases this file covers:
 *
 *  - Phase 1 (early) only stripped `screenType` and tucked it under
 *    `_legacyHotZone.screenType`. It did NOT move `hotZoneElements` /
 *    `hotSpots` data into `screen.elements`. Projects that loaded under
 *    Phase 1 then later under Phase 3 used to be stranded because Phase 3's
 *    idempotency check skipped any screen with a `_legacyHotZone` backup.
 *    This new version detects that case and re-runs promotion.
 *
 *  - Phase 3 promoted the data into `screen.elements` as typed entries and
 *    moved the original arrays into `_legacyHotZone` as a rollback escape
 *    hatch.
 *
 *  - Phase 4.5 added an `interactive: boolean` flag on `BaseUIElement` that
 *    pins migrated/quick-added elements to the hot zone editor even when
 *    `draggable` is toggled off. A recovery pass at the bottom of this file
 *    backfills the flag onto already-promoted elements based on the
 *    `_legacyHotZone` backup, so projects that ran an older Phase 3 still
 *    get the corrected behavior.
 *
 * Everything here is idempotent: an already-quiet screen passes through
 * unchanged.
 */

import { VNID } from '../types';
import { VNProject } from '../types/project';
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
    UIHotSpotElement,
    UIdraggableImageElementElement,
    VNFontSettings,
} from '../features/ui/types';
import { UIActionType } from '../types/shared';

const DEFAULT_FONT: VNFontSettings = {
    family: 'Inter, system-ui, sans-serif',
    size: 16,
    color: '#ffffff',
    weight: 'normal',
    italic: false,
};

/** Translate a legacy `VNHotZoneElement` into a concrete `VNUIElement` subtype.
 *  All produced entries carry `interactive: true` so they stay in the hot zone
 *  editor even when the user toggles `draggable` off. */
function migrateHotZoneElement(hz: VNHotZoneElement): VNUIElement | null {
    const baseProps = {
        id: hz.id,
        name: hz.name || 'Element',
        x: hz.x,
        y: hz.y,
        width: hz.width,
        height: hz.height,
        anchorX: 0,
        anchorY: 0,
        conditions: hz.conditions,
        interactive: true,
        draggable: hz.draggable,
        snapBack: hz.snapBack,
        snapToHotSpot: hz.snapToHotSpot,
        hideOnDrop: hz.hideOnDrop,
        actions: hz.actions,
        clickSoundId: hz.clickSoundId ?? null,
        hoverSoundId: hz.hoverSoundId ?? null,
    } as const;

    const elType = hz.elementType || 'image';
    switch (elType) {
        case 'image': {
            const out: UIImageElement = {
                ...baseProps,
                type: UIElementType.Image,
                background: hz.imageId
                    ? { type: 'image', assetId: hz.imageId }
                    : { type: 'color', value: '#00000000' },
                image: hz.imageId ? { type: 'image', id: hz.imageId } : null,
                objectFit: 'contain',
            };
            return out;
        }
        case 'video': {
            const out: UIImageElement = {
                ...baseProps,
                type: UIElementType.Image,
                background: hz.videoId
                    ? { type: 'video', assetId: hz.videoId }
                    : { type: 'color', value: '#00000000' },
                image: null,
                objectFit: 'contain',
            };
            return out;
        }
        case 'text': {
            const out: UITextElement = {
                ...baseProps,
                type: UIElementType.Text,
                text: hz.text || hz.name || '',
                font: hz.font || DEFAULT_FONT,
                textAlign: 'center',
                verticalAlign: 'middle',
            };
            return out;
        }
        case 'button': {
            const out: UIButtonElement = {
                ...baseProps,
                type: UIElementType.Button,
                text: hz.text || hz.name || '',
                font: hz.font || DEFAULT_FONT,
                action: (hz.actions && hz.actions[0]) || { type: UIActionType.None },
                actions: hz.actions,
                image: hz.imageId ? { type: 'image', id: hz.imageId } : null,
                hoverImage: null,
                clickSoundId: hz.clickSoundId ?? null,
                hoverSoundId: hz.hoverSoundId ?? null,
                backgroundColor: hz.backgroundColor,
            };
            return out;
        }
        case 'textInput': {
            const out: UITextInputElement = {
                ...baseProps,
                type: UIElementType.TextInput,
                placeholder: hz.placeholder || '',
                variableId: hz.variableId as VNID,
                font: hz.font || DEFAULT_FONT,
                backgroundColor: hz.backgroundColor,
                borderColor: hz.borderColor,
                maxLength: hz.maxLength,
            };
            return out;
        }
        case 'draggableImageElement': {
            const out: UIdraggableImageElementElement = {
                ...baseProps,
                type: UIElementType.draggableImageElement,
                image: hz.imageId ? { type: 'image', id: hz.imageId } : null,
                hoverImage: hz.hoverImageId ? { type: 'image', id: hz.hoverImageId } : null,
                draggableImageElementRegions: hz.draggableImageElementRegions,
            };
            return out;
        }
    }
    return null;
}

/** Translate a legacy `VNHotSpot` into a `UIHotSpotElement`. */
function migrateHotSpot(spot: VNHotSpot): UIHotSpotElement {
    return {
        id: spot.id,
        name: spot.name || 'Hot Spot',
        type: UIElementType.HotSpot,
        x: spot.x,
        y: spot.y,
        width: spot.width,
        height: spot.height,
        anchorX: 0,
        anchorY: 0,
        interactive: true,
        shape: spot.shape,
        trigger: spot.trigger,
        acceptedElementIds: spot.acceptedElementIds,
        actions: spot.actions,
        conditions: spot.conditions,
        highlightColor: spot.highlightColor,
        visible: spot.visible,
    };
}

/** Migrate a single screen to the unified schema. Idempotent.
 *
 *  Two passes:
 *    1. Promote legacy hot zone data into `screen.elements` if it's still on
 *       the screen object (handles fresh loads and Phase-1-stranded screens).
 *    2. Backfill `interactive: true` on already-promoted elements by matching
 *       IDs against `_legacyHotZone` (handles older Phase 3 promotions that
 *       predate the interactive flag).
 */
export function migrateScreenToUnified(screen: VNUIScreen): VNUIScreen {
    const legacy = screen as any;

    let result: VNUIScreen = screen;

    // ── Pass 1: type promotion ──────────────────────────────────────────
    const hasLegacyHotZoneElements = legacy.hotZoneElements && Object.keys(legacy.hotZoneElements).length > 0;
    const hasLegacyHotSpots = legacy.hotSpots && Object.keys(legacy.hotSpots).length > 0;
    const stillCarriesLegacyData = legacy.screenType === 'hotzone' || hasLegacyHotZoneElements || hasLegacyHotSpots;

    if (stillCarriesLegacyData) {
        const newElements: Record<VNID, VNUIElement> = { ...(screen.elements || {}) };

        // Defensive: if the element ID already exists in `screen.elements` (a previous
        // migration promoted it and the user may have edited it since), don't overwrite.
        // Only promote freshly-stranded entries.
        for (const hz of Object.values((legacy.hotZoneElements || {}) as Record<VNID, VNHotZoneElement>)) {
            const migrated = migrateHotZoneElement(hz);
            if (migrated && !newElements[migrated.id]) newElements[migrated.id] = migrated;
        }
        for (const spot of Object.values((legacy.hotSpots || {}) as Record<VNID, VNHotSpot>)) {
            if (!newElements[spot.id]) newElements[spot.id] = migrateHotSpot(spot);
        }

        const { screenType, hotZoneElements, hotSpots, ...rest } = legacy;
        const prevBackup = (rest._legacyHotZone || {}) as VNUIScreen['_legacyHotZone'];
        result = {
            ...rest,
            elements: newElements,
            _legacyHotZone: {
                // Prefer the freshly-stripped data; fall back to anything previously stashed
                // (Phase 1 saved `screenType` here without the maps, so the maps may live
                // either in legacy fields we just stripped or in the existing backup).
                hotSpots: hotSpots ?? prevBackup?.hotSpots,
                hotZoneElements: hotZoneElements ?? prevBackup?.hotZoneElements,
                screenType: screenType ?? prevBackup?.screenType,
            },
        } as VNUIScreen;
    } else if (legacy.screenType !== undefined) {
        // No hot zone data, just a stale `screenType` flag. Strip it.
        const { screenType, ...rest } = legacy;
        const prevBackup = (rest._legacyHotZone || {}) as VNUIScreen['_legacyHotZone'];
        result = {
            ...rest,
            _legacyHotZone: {
                ...prevBackup,
                screenType: prevBackup?.screenType ?? screenType,
            },
        } as VNUIScreen;
    }

    // ── Pass 2: interactive-flag recovery ───────────────────────────────
    // For projects that ran an older Phase 3 (which didn't set the interactive flag),
    // walk the `_legacyHotZone` backup and tag the corresponding promoted elements.
    const backup = result._legacyHotZone;
    if (backup && (backup.hotZoneElements || backup.hotSpots)) {
        const shouldBeInteractive = new Set<string>();
        for (const id of Object.keys(backup.hotZoneElements || {})) shouldBeInteractive.add(id);
        for (const id of Object.keys(backup.hotSpots || {})) shouldBeInteractive.add(id);

        if (shouldBeInteractive.size > 0) {
            let changed = false;
            const recovered: Record<VNID, VNUIElement> = {};
            for (const [id, el] of Object.entries(result.elements || {})) {
                if (shouldBeInteractive.has(id) && !(el as any).interactive) {
                    recovered[id as VNID] = { ...el, interactive: true } as VNUIElement;
                    changed = true;
                } else {
                    recovered[id as VNID] = el as VNUIElement;
                }
            }
            if (changed) {
                result = { ...result, elements: recovered };
            }
        }
    }

    return result;
}

/** Migrate every screen in a project. Returns a new project; the input is not mutated. */
export function migrateProjectToUnifiedScreens(project: VNProject): VNProject {
    if (!project || !project.uiScreens) return project;

    let anyChanged = false;
    const newScreens: Record<VNID, VNUIScreen> = {};
    for (const [id, screen] of Object.entries(project.uiScreens)) {
        const migrated = migrateScreenToUnified(screen as VNUIScreen);
        if (migrated !== screen) anyChanged = true;
        newScreens[id as VNID] = migrated;
    }

    if (!anyChanged) return project;

    return {
        ...project,
        uiScreens: newScreens,
    };
}
