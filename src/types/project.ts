import { VNID } from './';
import { VNBackground, VNImage, VNAudio, VNVideo } from '../features/assets/types';
import { VNCharacter } from '../features/character/types';
import { VNScene } from '../features/scene/types';
import { VNProjectUI, VNUIScreen } from '../features/ui/types';
import { VNVariable } from '../features/variables/types';

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
}
