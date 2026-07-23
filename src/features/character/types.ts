import { VNID } from '../../types';
import type { VNDialogueTextEffect } from '../scene/types';
import type { UIAsset, VNFontSettings } from '../ui/types';

/**
 * Optional per-character dialogue textbox / nameplate appearance overrides. Every field is
 * optional; any left undefined falls back to the project-global dialogue UI (VNProjectUI).
 * APPEARANCE ONLY — box/namebox position & size stay global so layouts can't drift per speaker.
 * Additive-optional: characters without a `textbox` render exactly as before.
 */
export interface VNCharacterTextbox {
    // Dialogue box background
    dialogueBoxImage?: UIAsset | null;
    dialogueBoxBorderImage?: UIAsset | null;
    dialogueBorderPadding?: number;
    dialogueBoxColor?: string;
    dialogueBoxOpacity?: number;
    dialogueBoxBorderRadius?: number;
    dialogueBoxSizeMode?: 'stretch' | 'contain' | 'cover' | 'tile' | 'nine-slice';
    dialogueBoxSlice?: number;
    // Namebox background
    nameboxImage?: UIAsset | null;
    nameboxColor?: string;
    nameboxOpacity?: number;
    nameboxBorderRadius?: number;
    nameboxSizeMode?: 'stretch' | 'contain' | 'cover' | 'nine-slice';
    nameboxPadding?: number;
    nameboxHorizontalPadding?: number;
    // Text fonts (full overrides; per-character fontFamily/size on VNCharacter still layer on top)
    dialogueTextFont?: VNFontSettings;
    dialogueNameFont?: VNFontSettings;
}

/**
 * A reusable, named textbox design stored on the project (project.textboxThemes). Characters point
 * at one via `textboxThemeId`, and a Dialogue command can override per-line via its own themeId.
 * It is just a VNCharacterTextbox with an id + name, so the same resolver/renderer handles both.
 */
export interface VNTextboxTheme extends VNCharacterTextbox {
    id: VNID;
    name: string;
}

/** Art override for one layer asset in one pose. All fields optional; an entry with neither
 *  image nor video counts as absent — everything falls back to the asset's default art.
 *  Additive-optional (older projects have none). */
export interface VNPoseArt {
    imageUrl?: string;
    videoUrl?: string;
    isVideo?: boolean;
    loop?: boolean;
    trimStart?: number;
    trimEnd?: number;
}

export interface VNLayerAsset {
    id: VNID;
    name: string;
    imageUrl?: string;
    videoUrl?: string;
    isVideo?: boolean;
    loop?: boolean;
    autoplay?: boolean;
    /** Default video clip (seconds) for this layer asset — one long video, many expressions. */
    trimStart?: number;
    trimEnd?: number;
    /** Per-POSE art for this same asset (poseId → art). One "Red Dress" asset can look
     *  head-on in one pose and 3/4-turned in another — the asset ID never changes, so a
     *  player's dress-up choice carries across poses automatically. Additive-optional. */
    poseArt?: Record<VNID, VNPoseArt>;
}
export interface VNCharacterLayer {
    id: VNID;
    name: string;
    assets: Record<VNID, VNLayerAsset>;
}
export interface VNCharacterExpression {
    id: VNID;
    name: string;
    layerConfiguration: Record<VNID, VNID | null>; // layerId -> assetId
}
/** An ADDITIONAL view of the character — any stance or angle the author wants (side view,
 *  sitting, arms crossed, chibi…). The character's existing base fields ARE the "Default"
 *  pose; a pose only stores what differs (its own base art; per-asset art lives in
 *  VNLayerAsset.poseArt). Expressions and outfit selections are pose-agnostic and carry
 *  over automatically. Additive-optional. */
export interface VNCharacterPose {
    id: VNID;
    name: string;
    baseImageUrl?: string | null;
    baseVideoUrl?: string | null;
    isBaseVideo?: boolean;
    baseVideoLoop?: boolean;
    baseVideoTrimStart?: number;
    baseVideoTrimEnd?: number;
}
export interface VNCharacter {
    id: VNID;
    name: string;
    color: string;
    fontFamily?: string;
    fontUrl?: string; // Custom TTF/OTF font file URL
    fontSize?: number; // Font size override
    fontWeight?: 'normal' | 'bold';
    fontItalic?: boolean;
    baseImageUrl?: string | null;
    baseVideoUrl?: string | null;
    isBaseVideo?: boolean;
    baseVideoLoop?: boolean;
    /** Base video clip (seconds) — store several sprite animations in one video. */
    baseVideoTrimStart?: number;
    baseVideoTrimEnd?: number;
    layers: Record<VNID, VNCharacterLayer>;
    expressions: Record<VNID, VNCharacterExpression>;
    /** Alternate views of this character (any number, any meaning). Absent = the character
     *  has only its Default pose — nothing changes for existing projects. Additive-optional;
     *  NEVER auto-initialized (absence keeps project JSON byte-identical). */
    poses?: Record<VNID, VNCharacterPose>;
    /** Default text effect for this character's dialogue */
    textEffect?: VNDialogueTextEffect;
    /** Default voice audio clip ID for this character (can be overridden per-line) */
    defaultVoiceId?: VNID | null;
    /** Default ringtone for an Incoming Call from this character (per-call override wins; then the
     *  project-wide themed default). Additive-optional. */
    phoneRingtoneAudioId?: VNID | null;
    /** Optional per-character dialogue textbox / nameplate appearance overrides (custom, inline). */
    textbox?: VNCharacterTextbox;
    /** Optional reusable textbox theme this character uses by default (project.textboxThemes).
     *  When both are set, the inline `textbox` layers on top of the theme. */
    textboxThemeId?: VNID;
    /** Speaker-tinted dialogue: render this character's LINES in a color — 'character' uses
     *  their name color, 'custom' uses dialogueTextColor. Off/absent = no tint (default).
     *  Additive-optional; wins over theme/global text color, loses to a palette→UI restyle. */
    dialogueTextColorMode?: 'off' | 'character' | 'custom';
    dialogueTextColor?: string;
}
