import { VNID } from './';
import { VNBackground, VNImage, VNAudio, VNVideo } from '../features/assets/types';
import { VNCharacter, VNTextboxTheme } from '../features/character/types';
import { VNScene, VNCustomTransition } from '../features/scene/types';
import { VNProjectUI, VNUIScreen, VNFontSettings } from '../features/ui/types';
import { VNVariable, VNVariableFolder } from '../features/variables/types';
import { VNScript } from './scripting';
import { VNCommonEvent } from './commonEvents';
import { PluginRegistryEntry, VNPlugin } from './plugins';
import { VNItem, VNItemCollection } from '../features/items/types';
import { VNStat } from '../features/stats/types';
import { VNMiniGameConfig, VNArtPalette } from './miniGames';

export * from './miniGames';

/** One color-grade layer of a day/night phase (applied to the background OR the sprites). */
export interface VNGradeLayer {
    /** When false, this target is left untouched at this phase (e.g. tint bg but not sprites). */
    enabled: boolean;
    tint: string;        // hex
    tintOpacity: number; // 0–1 (overlay/tint strength)
    brightness: number;  // multiplier, 1 = normal
    saturation: number;  // multiplier, 1 = normal
}

/** A keyed point in the day/night cycle (peaks at `atHour`); the engine interpolates between phases. */
export interface VNDayNightPhase {
    id: VNID;
    name: string;
    atHour: number;          // 0–24
    background: VNGradeLayer;
    sprites: VNGradeLayer;
}

/** Project-level day/night cycle config. Absent/`enabled:false` = no grading (old projects unaffected). */
export interface VNDayNightCycle {
    enabled: boolean;
    /** Managed internal number variable (0–24) the cycle reads/writes; created when first enabled. */
    timeVariableId?: VNID;
    /** Optional real-time auto-advance: `secondsPerHour` real seconds advance the clock by 1 hour. */
    autoAdvance?: { enabled: boolean; secondsPerHour: number };
    /** Phases sorted by `atHour`; seeded with warm→cold defaults; fully recolorable. */
    phases: VNDayNightPhase[];
}

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

/** One song in the Music Gallery. */
export interface MusicGalleryEntry {
    id: VNID;
    /** Song title shown to players */
    name: string;
    /** The music file (ref into project.audio) */
    audioId: VNID | null;
    /** Cover art shown while the song plays (ref into project.images or project.backgrounds).
     *  MUST stay an asset ID (never a raw URL) — export/build pipelines pack the asset
     *  libraries wholesale, so ID refs ride along for free. */
    artworkAssetId?: VNID | null;
    /** Optional "By …" line under the title */
    artist?: string;
    /** Whether this song must be unlocked before players can play it */
    unlockable: boolean;
    /** Boolean variable that tracks unlock status (true = unlocked). Required if unlockable=true */
    unlockVariableId?: VNID | null;
    /** Category/group for filtering (e.g. "Chapter 1", "Battle themes") */
    category?: string;
    /** Sort order within the list */
    order?: number;
}

/** Music Gallery configuration for the project. Additive-optional — absent = feature unused. */
export interface MusicGalleryConfig {
    /** All songs */
    entries: Record<VNID, MusicGalleryEntry>;
    /** Cover art stand-in for songs without their own (asset ID ref, same packing rule as above) */
    defaultArtworkAssetId?: VNID | null;
}

/** One touchable location on a map (the phone Map app + the Show Map command). */
export interface VNMapLocation {
    id: VNID;
    name: string;
    /** Marker anchor, % of the map image. */
    x: number;
    y: number;
    /** Region size (%, for markerStyle 'region'). */
    width?: number;
    height?: number;
    /** 'icon' (default, a pin glyph) | 'image' (custom marker art) | 'region' (invisible touch area). */
    markerStyle?: 'icon' | 'image' | 'region';
    builtinIcon?: string;
    markerImage?: { type: 'image'; id: VNID } | null;
    /** Caption under the marker (default = name); interpolates {variables}. */
    label?: string;
    /** Per-location label text style; falls back to the map's labelFont, then the built-in default. */
    labelFont?: VNFontSettings;
    /** Show the caption under the marker (default true — unset = shown). Off = tappable marker, no text. */
    showLabel?: boolean;
    /** Use an image as the label instead of text (shown only while unlocked). */
    labelImage?: { type: 'image'; id: VNID } | null;
    /** Legacy single scene jump. Folded into `actions` as a trailing JumpToScene by migrateMapLocationActions. */
    targetSceneId?: VNID | null;
    /** Ordered list of actions run when the location is tapped (JumpToScene is just one entry). */
    actions?: any[];
    /** Location is unlocked when these pass (empty = always). */
    conditions?: any[];
    /** How a LOCKED location looks: hidden entirely, dimmed, or a lock icon. Default 'hidden'. */
    lockedAppearance?: 'hidden' | 'dimmed' | 'lockedIcon';
    /** Label shown while locked (e.g. "???"). */
    lockedLabel?: string;
}

/**
 * Story Flow Map layout. Editor-only; the engine never reads it.
 * Keys are `${kind}:${id}` (see `nodeKey()` in src/utils/storyGraph.ts) so scenes, screens, common
 * events, mini-games and maps can all be positioned from ONE place — a single additive-optional
 * field means no migration, and "Tidy up" is a single undoable dispatch.
 */
export interface VNFlowMapLayout {
    nodes?: Record<string, { x: number; y: number; color?: string }>;
}

/** An author-designed travel map: a backdrop + touchable locations. */
export interface VNMapConfig {
    id: VNID;
    name: string;
    backgroundImage: { type: 'image' | 'video'; id: VNID } | null;
    locations: VNMapLocation[];
    markerColor?: string;
    /** Marker size, % of the map's width (default 6). */
    markerSize?: number;
    /** Map-wide default label text style (per-location labelFont overrides it). */
    labelFont?: VNFontSettings;
    /** Ask "Travel to {name}?" before jumping (default false). */
    confirmTravel?: boolean;
    confirmText?: string;
    /** Let players zoom & pan this map at runtime (default true — unset = on). Set false for a fixed map. */
    allowZoom?: boolean;
    /** How far players can zoom in, as a multiple of the fit-to-screen size (default 3). */
    maxZoom?: number;
}

/** One sub-note under a Story Bible section. Content is markdown-lite plain text. */
export interface VNStoryBibleSubsection {
    id: VNID;
    name: string;
    content: string;
}
/** One writer's-notes section in the Story Bible (Synopsis, Characters, …). */
export interface VNStoryBibleSection {
    id: VNID;
    name: string;
    content: string;
    subsections: VNStoryBibleSubsection[];
}

/** One glossary term: highlighted in the dialogue box at runtime with a hover tooltip. */
export interface VNGlossaryEntry {
    id: VNID;
    /** The word or phrase to highlight. */
    term: string;
    /** Other spellings/forms that also trigger this entry (plural, nickname…). */
    alternatives?: string[];
    /** Match capital letters exactly (default false = any capitalisation matches). */
    caseSensitive?: boolean;
    /** Tooltip heading (empty = the term itself). */
    title?: string;
    /** Tooltip body text. */
    description?: string;
    /** Small footnote under the description. */
    extra?: string;
    /** Highlight colour for this term (unset = the glossary's default colour). */
    color?: string;
    /** Show this term in the game (default true; false keeps the entry but disables it). */
    enabled?: boolean;
}
export interface VNGlossarySettings {
    /** Master switch: highlight glossary terms in the game (default true). */
    enabled?: boolean;
    /** Default highlight colour (default '#7ee7ff'). */
    defaultColor?: string;
    /** How terms stand out in the text (default 'underline'). */
    highlightStyle?: 'color' | 'glow' | 'underline';
}

/** One language the finished game can be played in. */
export interface VNLanguage {
    /** BCP-47-ish code the game and the browser both understand — 'es', 'pt-BR', 'ja'. */
    code: string;
    /** What the player sees in the language picker, written in that language ("Español"). */
    name: string;
    /** Off = translated but not yet offered to players. Lets an author work in private. */
    enabled: boolean;
}

/**
 * One translated string.
 *
 * `origin` and `sourceHash` exist so a translation can go **stale** rather than silently wrong:
 * machine drafts are flagged for review everywhere they appear, and when the author later edits
 * the English, the hash stops matching and the row is shown as out-of-date instead of shipping
 * a translation of a line that no longer exists.
 */
export interface VNTranslatedString {
    text: string;
    /** Machine drafts are marked so they can never be mistaken for reviewed work. */
    origin?: 'human' | 'machine';
    /** Cleared when a human approves or edits it. */
    needsReview?: boolean;
    /** Hash of the source text this was translated FROM. */
    sourceHash?: string;
}

export interface VNLocalization {
    /** The language the project is authored in — the "Source" column translators work from. */
    sourceLanguage: string;
    languages: VNLanguage[];
    /** translation key → language code → the translation. Keys come from `translationKeys.ts`
     *  and are built from stable ids, so editing or reordering the story never detaches one. */
    strings: Record<string, Record<string, VNTranslatedString>>;
    /** Per-language art swaps: language code → original asset id → replacement asset id.
     *  For signs, logos and anything with words baked into the picture. */
    assetOverrides?: Record<string, Record<VNID, VNID>>;
    /** When the game offers its language picker (default 'firstRun'). */
    showLanguageScreen?: 'firstRun' | 'everyBoot' | 'never';
    /** Start in the player's own language if the game has it (default true). */
    autoDetectLanguage?: boolean;
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
    /** Music Gallery configuration for unlockable songs (the Music Gallery element plays these) */
    musicGallery?: MusicGalleryConfig;
    /** Story Flow Map layout (hand-placed node positions). EDITOR-ONLY — the game engine never reads
     *  it. Additive-optional: absent = every node auto-laid-out. */
    flowMap?: VNFlowMapLayout;
    /** Travel maps (Show Map command + the phone's Map app). Additive-optional. */
    maps?: Record<VNID, VNMapConfig>;
    /** Mini games (Show Mini Game command/action + the Mini Games tab). Additive-optional. */
    miniGames?: Record<VNID, VNMiniGameConfig>;
    /** Named color schemes (Art Studio swatches, shared with coloring mini games). Additive-optional. */
    artPalettes?: VNArtPalette[];
    /** Inventory/shop item registry. Each item is backed by a count variable. */
    items?: Record<VNID, VNItem>;
    /** Independent item lists (player bag, shop stock, library, chest…). Each holds per-list quantities
     *  backed by their own count variables. Additive-optional; the player's own inventory stays the
     *  global item counts (not a collection). */
    itemCollections?: Record<VNID, VNItemCollection>;
    /** Gameplay stat registry (affection, health, XP…). Each stat is backed by one number
     *  variable per target (global, or one per character). Additive-optional. */
    stats?: Record<VNID, VNStat>;
    /** Reusable dialogue textbox themes (project-global). Characters/dialogue lines reference one
     *  by id; missing/deleted ids safely fall back to the global dialogue UI. Additive-optional. */
    textboxThemes?: Record<VNID, VNTextboxTheme>;
    /** Author-made scene transitions (closing + opening animation pairs, e.g. a theatre curtain).
     *  Scenes/jumps reference one as `custom:<id>`; missing ids fall back to fade. Additive-optional. */
    customTransitions?: Record<VNID, VNCustomTransition>;
    /** Writer's private Story Bible notes (markdown-lite). EDITOR-ONLY — stripped from exported
     *  games by gameBundler. Additive-optional. */
    storyBible?: { sections: VNStoryBibleSection[] };
    /** Glossary: terms auto-highlighted in the dialogue box with hover tooltips. SHIPS with
     *  exported games. Additive-optional. */
    glossary?: { entries: Record<VNID, VNGlossaryEntry>; settings?: VNGlossarySettings };
    /** Translations of every player-facing string, plus which languages the game offers.
     *  SHIPS with exported games. Absent = today's behavior exactly (one language, no
     *  language picker). Additive-optional. */
    localization?: VNLocalization;
    /** Editor-side variable folders (Variables tab organisation; engine ignores them).
     *  Variables reference one via `folderId`. Additive-optional. */
    variableFolders?: Record<VNID, VNVariableFolder>;
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
    /** Day/night cycle: a time-of-day value drives a color grade over background + sprites. Additive-optional. */
    dayNightCycle?: VNDayNightCycle;
    /** Build-time options chosen in the Build Game screen. Additive-optional — absent means all defaults. */
    buildOptions?: VNBuildOptions;
}

/** Options for game builds (web/desktop/android). All fields optional so old projects are untouched. */
export interface VNBuildOptions {
    /** Web builds: show a floating fullscreen toggle button over the game. */
    webFullscreenButton?: boolean;
    /** Which corner the fullscreen button sits in. Default 'top-right'. */
    webFullscreenCorner?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}
