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

/** A character's typing sound: a short blip per revealed letter (or word) while their dialogue
 *  types out, Undertale-style. `audioId: null` = the built-in beep (works with no uploads).
 *  Volume rides the player's Voice slider × `volume`. All fields optional with safe defaults. */
export interface VNTypingBlip {
    /** Project audio asset to blip with; null = the built-in beep. */
    audioId: VNID | null;
    /** 'letter' (default): blip on revealed letters. 'word': one blip at the start of each word. */
    mode?: 'letter' | 'word';
    /** Letter mode: blip every Nth eligible letter (default 2 — every letter can get frantic). */
    everyN?: number;
    /** 0..1, multiplied by the player's Voice volume (default 1). */
    volume?: number;
    /** Random pitch wobble per blip, 0..0.5 (± fraction of normal pitch, default 0). */
    pitchWobble?: number;
    /** Skip spaces/punctuation so only letters and digits blip (default true). */
    skipPunctuation?: boolean;
    /** Sound shaping: `speed` + `reverse` are honored (keepPitch is not — blips are sample-level
     *  ticks, rate IS pitch there). Reverse on compressed files follows the SFX desktop rule
     *  (WAVs reverse everywhere; mp3/ogg reverse in browsers only). Additive-optional. */
    audioAdjust?: import('../scene/types').VNAudioAdjust;
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

/** Where one piece sits inside the sprite box (the Pose Studio's unit of layout).
 *  All numbers are PERCENT of the sprite box. Absent = the whole box — exactly today's
 *  rendering, so projects without boxes stay byte-identical AND pixel-identical.
 *  Never store a full box (0/0/100/100, no rotation, no flip) — normalizeLayerBox in
 *  features/character/layout.ts turns it back into absence. */
export interface VNLayerBox {
    x: number;
    y: number;
    width: number;
    height: number;
    /** Degrees, clockwise, pivoting at the box center. Absent/0 = none. */
    rotation?: number;
    /** Mirror left↔right. Absent/false = none. */
    flipH?: boolean;
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
    /** Per-PIECE layout override (Pose Studio "just this piece" pin) for the Default pose.
     *  Wins over the layer's box. Additive-optional. */
    box?: VNLayerBox;
    /** Per-piece per-pose layout overrides (poseId → box). Wins over everything. */
    poseBoxes?: Record<VNID, VNLayerBox>;
}
export interface VNCharacterLayer {
    id: VNID;
    name: string;
    assets: Record<VNID, VNLayerAsset>;
    /** Pose Studio layout for this whole layer in the Default pose. Additive-optional. */
    box?: VNLayerBox;
    /** Per-pose layout overrides for this layer (poseId → box). */
    poseBoxes?: Record<VNID, VNLayerBox>;
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
    /** Front/back order of layers in THIS pose (layer ids, back → front). Absent = the
     *  character's base order. Dangling-safe: deleted ids are skipped, missing layers are
     *  appended in base order (see layout.ts layerOrderForPose). Additive-optional. */
    layerOrder?: VNID[];
    /** Layers hidden in THIS pose (a hat that's off while sleeping). Per-pose only — the
     *  Default pose always shows every piece. Additive-optional. */
    hiddenLayers?: VNID[];
}
/** One step-keyframe track of an animation: at `atMs`, the layer switches to showing `assetId`
 *  (null = the piece is hidden at that moment). Step keys only — sprite frame animation swaps
 *  art at times; there is nothing to interpolate between two drawings. */
export interface VNAnimationTrack {
    layerId: VNID;
    keys: Array<{ atMs: number; assetId: VNID | null }>;
    /** Spin/Tilt keys: at `atMs` the layer is rotated `deg` degrees (clockwise, pivoting at the
     *  layer box's centre — the same pivot as the authored Pose Studio rotation, which this
     *  COMPOSES with rather than replaces). Unlike image keys these INTERPOLATE linearly between
     *  keys, wrapping across the loop point when the animation loops — so 0ms:0° → end:360° with
     *  loop = a continuous smooth spin. The rotation is computed per frame and never written to
     *  the layer/pose data: stop the animation and the layer is back at its authored transform.
     *  Additive-optional. */
    rotationKeys?: Array<{ atMs: number; deg: number }>;
    /** Move the piece while THIS animation is active, in percent of the character frame.
     *  Ephemeral like the rotation — the layer's authored box/position is never written; the
     *  moment the animation stops the piece is back where the author put it. Additive-optional. */
    offsetX?: number;
    offsetY?: number;
    /** Where the Spin/Tilt rotation pivots, in percent of the LAYER'S OWN BOX (default 50/50 =
     *  the box centre). Lets authors put the pivot ON the art when the drawing sits off-centre
     *  inside its box (object-contain letterboxing), so a spin doesn't swing the piece sideways.
     *  Additive-optional. */
    pivotX?: number;
    pivotY?: number;
}

/** A character animation: one or more layer tracks played on a shared timeline.
 *  Frames are LAYER-ASSET ids, so they inherit per-pose art (poseArt) and Pose Studio boxes
 *  automatically. Convention: a key at 0ms is the resting frame; keys sorted by atMs. */
export interface VNCharacterAnimation {
    id: VNID;
    name: string;
    /** Timeline length in ms. */
    durationMs: number;
    tracks: VNAnimationTrack[];
    /** Repeat from the start when the timeline ends (usual for 'always'). */
    loop?: boolean;
    /** When it plays: 'manual' (a command starts it — the default), 'always' (whenever the
     *  character is on stage), 'idle' (replays at random intervals — blinking), 'speaking'
     *  (only while this character's dialogue is typing — a talking mouth). */
    trigger?: 'manual' | 'always' | 'idle' | 'speaking';
    /** 'idle': random gap between replays, ms (defaults 2000–6000). */
    idleMinMs?: number;
    idleMaxMs?: number;
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
    /** Frame animations (blinking, talking, always-on loops, command-triggered) built from
     *  layer assets as frames. Additive-optional; NEVER auto-initialized. */
    animations?: Record<VNID, VNCharacterAnimation>;
    /** Default text effect for this character's dialogue */
    textEffect?: VNDialogueTextEffect;
    /** Default voice audio clip ID for this character (can be overridden per-line) */
    defaultVoiceId?: VNID | null;
    /** Typing sound: a short blip per revealed letter/word while this character's dialogue types
     *  out (Undertale-style). Per-line override on the Dialogue command wins; suppressed when the
     *  line has a real voice clip (unless the line overrides explicitly). Additive-optional. */
    typingBlip?: VNTypingBlip;
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
