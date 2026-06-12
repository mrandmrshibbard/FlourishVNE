import { VNID } from './';
import { VNBackground, VNImage, VNAudio, VNVideo } from '../features/assets/types';
import { VNCharacter } from '../features/character/types';
import { VNScene } from '../features/scene/types';
import { VNProjectUI, VNUIScreen } from '../features/ui/types';
import { VNVariable } from '../features/variables/types';
import { VNScript } from './scripting';
import { VNCommonEvent } from './commonEvents';
import { PluginRegistryEntry, VNPlugin } from './plugins';
import { VNItem, VNItemCollection } from '../features/items/types';
import { VNStat } from '../features/stats/types';

export interface VNProjectFont {
    id: VNID;
    name: string;
    fontFamily: string;
    fontUrl: string; // data URL in-editor/imported projects; may be rewritten to assets/* during export
    fileName?: string;
}

/** A single entry in the CG Gallery */
export interface CGGalleryEntry {
    id: VNID;
    /** Display name shown in the gallery */
    name: string;
    /** Asset ID of the image/video to display (from images or backgrounds) */
    assetId: VNID | null;
    /** Optional thumbnail asset (if different from main asset) */
    thumbnailAssetId?: VNID | null;
    /** Whether this entry requires unlocking to view */
    unlockable: boolean;
    /** Variable ID that tracks unlock status (boolean). When true, the entry is unlocked. Required if unlockable=true */
    unlockVariableId?: VNID | null;
    /** Category/group for organizing entries (e.g. "Chapter 1", "Characters") */
    category?: string;
    /** Sort order within category */
    order?: number;
}

/** CG Gallery configuration for the project */
export interface CGGalleryConfig {
    /** All gallery entries */
    entries: Record<VNID, CGGalleryEntry>;
    /** Whether unlocked items are saved per-save-slot or globally */
    unlockScope: 'global' | 'per-save';
    /** Number of columns in the gallery grid */
    columns: number;
    /** Placeholder image shown for locked entries (asset ID) */
    lockedPlaceholderAssetId?: VNID | null;
    /** Background color for the gallery viewer */
    viewerBackgroundColor?: string;
}

export interface VNProject {
    id: VNID;
    title: string;
    description?: string;
    author?: string;
    version?: string;
    engineVersion?: string;
    startSceneId: VNID;
    scenes: Record<VNID, VNScene>;
    characters: Record<VNID, VNCharacter>;
    backgrounds: Record<VNID, VNBackground>;
    images: Record<VNID, VNImage>;
    audio: Record<VNID, VNAudio>;
    videos: Record<VNID, VNVideo>;
    variables: Record<VNID, VNVariable>;
    fonts: Record<VNID, VNProjectFont>;
    ui: VNProjectUI;
    uiScreens: Record<VNID, VNUIScreen>;
    gameResolution?: {
        width: number;
        height: number;
        aspectRatio: string;
    };
    /** CG Gallery configuration for unlockable art gallery */
    cgGallery?: CGGalleryConfig;
    /** Inventory/shop item registry. Each item is backed by a count variable. */
    items?: Record<VNID, VNItem>;
    /** Independent item lists (player bag, shop stock, library, chest…). Each holds per-list quantities
     *  backed by their own count variables. Additive-optional; the player's own inventory stays the
     *  global item counts (not a collection). */
    itemCollections?: Record<VNID, VNItemCollection>;
    /** Gameplay stat registry (affection, health, XP…). Each stat is backed by one number
     *  variable per target (global, or one per character). Additive-optional. */
    stats?: Record<VNID, VNStat>;
    /** User-defined scripts */
    scripts?: Record<VNID, VNScript>;
    /** Common Events — reusable command sequences callable from any scene */
    commonEvents?: Record<VNID, VNCommonEvent>;
    /** Installed plugins */
    plugins?: Record<string, VNPlugin>;
    /** Plugin registry (enabled state + config per plugin) */
    pluginRegistry?: Record<string, PluginRegistryEntry>;
    /** Plugin-scoped persistent storage (api.getStorage/setStorage). Travels with the project
     *  so a plugin's saved data is portable — replaces the old localStorage approach. */
    pluginStorage?: Record<string, Record<string, any>>;
    /** When true, characters sharing the same preset position are automatically spread apart */
    autoArrangeCharacters?: boolean;
}
