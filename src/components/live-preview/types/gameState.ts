/**
 * Type definitions for the Live Preview game engine
 */

import React from 'react';
import { VNID, VNPosition, VNTransition } from '../../../types';
import { VNCommand } from '../../../features/scene/types';
import { ChoiceOption } from '../../../features/scene/types';
import type { PhoneReply, PhoneFollowUp, PhoneIncomingCallCommand, PhoneCallConversation } from '../../../features/scene/types';
import type { VNScreenOverlayEffect } from '../../../types';
import type { VNCharacterVisualEffect, VNDialogueTextEffect, VNParticleConfig, VNLight } from '../../../features/scene/types';
import type { PhonePortraitSource } from '../../../features/ui/types';

export type StageSize = { width: number; height: number };

export interface TextOverlay {
    id: VNID;
    /** Author stacking order (from the command's `layer`). Higher = nearer the viewer. */
    layer?: number;
    /** Parallax depth (0/undefined = locked); from the source command/element. */
    parallaxDepth?: number;
    text: string;
    /** Un-interpolated template (with {variable} tokens). When `live`, the renderer
     *  re-interpolates this against current variables each frame so values update live. */
    rawText?: string;
    x: number;
    y: number;
    fontSize: number;
    fontFamily: string;
    color: string;
    width?: number;
    height?: number;
    fontWeight?: 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';
    letterSpacing?: number;
    textShadow?: { enabled: boolean; offsetX: number; offsetY: number; blur: number; color: string };
    textGradient?: { enabled: boolean; type: 'linear' | 'radial'; angle: number; colors: string[] };
    textBorder?: { enabled: boolean; width: number; color: string };
    textAlign?: 'left' | 'center' | 'right';
    verticalAlign?: 'top' | 'middle' | 'bottom';
    transition?: VNTransition;
    duration?: number;
    action?: 'show' | 'hide';
    // Orientation
    rotation?: number;
    flipX?: boolean;
    flipY?: boolean;
    /** Live (reactive) conditions: when `live`, re-evaluated every render to show/hide. */
    conditions?: import('../../../types/shared').VNCondition[];
    live?: boolean;
}

export interface ImageOverlay {
    id: VNID;
    /** Author stacking order (from the command's `layer`). Higher = nearer the viewer. */
    layer?: number;
    /** Parallax depth (0/undefined = locked); from the source command/element. */
    parallaxDepth?: number;
    imageUrl?: string;
    videoUrl?: string;
    isVideo?: boolean;
    videoLoop?: boolean;
    /** Play only a [trimStart,trimEnd] slice of the video (seconds). */
    videoTrimStart?: number;
    videoTrimEnd?: number;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    opacity: number;
    scaleX: number;
    scaleY: number;
    flipX?: boolean;
    flipY?: boolean;
    transition?: VNTransition;
    duration?: number;
    /** When true, width/height are a max bound and the image + footprint shrink to the fitted art. */
    fitToContent?: boolean;
    action?: 'show' | 'hide';
    /** Live (reactive) conditions: when `live`, re-evaluated every render to show/hide. */
    conditions?: import('../../../types/shared').VNCondition[];
    live?: boolean;
}

export interface ButtonOverlay {
    id: VNID;
    /** Author stacking order (from the command's `layer`). Higher = nearer the viewer. */
    layer?: number;
    /** Parallax depth (0/undefined = locked); from the source command/element. */
    parallaxDepth?: number;
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    anchorX: number;
    anchorY: number;
    backgroundColor: string;
    textColor: string;
    fontSize: number;
    fontWeight: 'normal' | 'bold';
    textAlign?: 'left' | 'center' | 'right';
    paddingX?: number;
    borderRadius: number;
    opacity: number;
    imageUrl: string | null;
    hoverImageUrl: string | null;
    onClick: import('../../../types/shared').VNUIAction;
    actions?: import('../../../types/shared').VNUIAction[]; // Multiple actions support
    clickSound: VNID | null;
    waitForClick?: boolean;
    /** Quick-menu mode — when true, clicks fire actions but never advance the
     *  dialogue and never consume the click. See ShowButtonCommand.quickMenuMode. */
    quickMenuMode?: boolean;
    transition?: VNTransition;
    duration?: number;
    action?: 'show' | 'hide';
    // Orientation
    rotation?: number;
    flipX?: boolean;
    flipY?: boolean;
    /** Live (reactive) conditions: when `live`, re-evaluated every render to show/hide. */
    conditions?: import('../../../types/shared').VNCondition[];
    live?: boolean;
    /** When true, the overlay removes itself once clicked (used by Show Item pickups). */
    removeAfterClick?: boolean;
    /** When set (a source command id), clicking records the pickup in `playerState.pickedUpItems`
     *  so a "pick up once" Show Item stays gone across scene revisits + saves. */
    pickUpOnceId?: VNID | null;
    /** Show Item pickups: the item to add to the player's inventory on click. The give is applied
     *  directly to playerState (atomic with removal/record), NOT via the UI-variable action buffer. */
    giveItemId?: VNID | null;
    /** Quantity to give on click (default 1; ignored for `unique` items, which clamp to 1). */
    giveQuantity?: number;
    /** Show Item drag-to-hot-spot: when true the icon can be press-dragged onto a drop-zone hot spot. */
    draggable?: boolean;
    /** The item id this overlay represents (for drag tag lookup), even when giveOnClick is off. */
    dragItemId?: VNID | null;
    /** Visible/clickable sub-region (inset fractions). For image buttons, restricts the in-game click
     *  hit-area to the visible art so transparent corners aren't clickable. Additive-optional. */
    contentBox?: import('../../../types').VNContentBox;
}

/** An interactive hot spot placed on the scene stage (from a ShowHotSpot command). */
export interface HotSpotOverlay {
    id: VNID;
    /** The ShowHotSpot command id that placed it (for HideHotSpot targeting). */
    commandId: VNID;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    shape: 'rect' | 'circle';
    trigger: 'click' | 'hover' | 'drag-drop';
    actions: import('../../../types/shared').VNUIAction[];
    conditions?: import('../../../types/shared').VNCondition[];
    acceptedTag?: string;
    highlightColor?: string;
    visible?: boolean;
    advanceOnTrigger?: boolean;
    /** Stage stacking order (from the command's `layer`). When set, the spot uses the shared layer
     *  band (1 + layer*100) so items/images can sit above it; when undefined it keeps the legacy
     *  fixed z (above characters, below dialogue) for back-compat. */
    layer?: number;
}

export interface StageCharacterTransition {
    type: VNTransition;
    duration: number;
    startPosition?: VNPosition;
    endPosition?: VNPosition;
    action: 'show' | 'hide';
}

export interface StageCharacterState {
    charId: VNID;
    /** Author stacking order (from the ShowCharacter command's `layer`). Higher = nearer. */
    layer?: number;
    /** Parallax depth (0/undefined = locked); from the source command/element. */
    parallaxDepth?: number;
    position: VNPosition;
    imageUrls: string[];
    videoUrls?: string[];
    isVideo?: boolean;
    videoLoop?: boolean;
    /** Per-video [start,end] trim (seconds), parallel to videoUrls. The base sprite's slice. */
    videoTrims?: Array<{ start?: number; end?: number }>;
    transition: StageCharacterTransition | null;
    expressionId?: VNID;
    layerVariableBindings?: Record<VNID, VNID>;
    /** Per-character visual effects — multiple can stack (shake, glow, tint, etc.) */
    visualEffects?: VNCharacterVisualEffect[];
    /** The ShowCharacter command ID that placed this character on stage (for drag-to-position) */
    sourceCommandId?: string;
    /** Character scale (1 = 100% original size) */
    scale?: number;
    /** When true, character sprite is flipped horizontally */
    inverted?: boolean;
    /** Rotation in degrees (positive = clockwise). */
    rotation?: number;
    /** When true, character sprite is flipped vertically. */
    flipY?: boolean;
    /** Live (reactive) conditions: when `live`, the character is shown only while met. */
    conditions?: import('../../../types/shared').VNCondition[];
    live?: boolean;
    /** Resolved per-layer asset selection (layerId → assetId|null) used to build the composite.
     *  Lets `SetCharacterLayer` patch one layer mid-scene and rebuild without re-running ShowCharacter. */
    layerSelections?: Record<VNID, VNID | null>;
}

/** A live (reactive) conditional background candidate (from a live Set Background). */
export interface BackgroundLayer {
    commandId: VNID;
    conditions?: import('../../../types/shared').VNCondition[];
    url: string | null;
    color?: string;
    isVideo?: boolean;
    loop?: boolean;
    /** Play only a [trimStart,trimEnd] slice of the video (seconds). */
    trimStart?: number;
    trimEnd?: number;
    /** Parallax depth for this background candidate (0/undefined = locked). */
    parallaxDepth?: number;
    /** Stacking order of the background vs. stage visuals (default 0 = behind). */
    layer?: number;
}

/** One stacked background plane (SetBackground with `stack: true`). Renders as its own
 *  backdrop at `layer` (zIndex) with `parallaxDepth`, on top of the base background. */
export interface BackgroundStackPlane {
    commandId: VNID;
    url: string | null;
    color?: string;
    isVideo?: boolean;
    loop?: boolean;
    /** Play only a [trimStart,trimEnd] slice of the video (seconds). */
    trimStart?: number;
    trimEnd?: number;
    parallaxDepth?: number;
    layer?: number;
    /** Entry transition for this plane (plays once on mount). */
    transition?: string;
    duration?: number;
}

export interface StageState {
    backgroundUrl: string | null;
    backgroundIsVideo?: boolean;
    backgroundLoop?: boolean;
    /** Play only a [trimStart,trimEnd] slice of the background video (seconds). */
    backgroundTrimStart?: number;
    backgroundTrimEnd?: number;
    /** Solid color background (used when backgroundColor is set on the SetBackground command) */
    backgroundColor?: string;
    /** Parallax depth for the scene background (0/undefined = locked). Over-scaled when set so the shift never reveals edges. */
    backgroundParallaxDepth?: number;
    /** Stacking order of the scene background vs. stage visuals (default 0 = behind 0-layer overlays). */
    backgroundLayer?: number;
    /** Live conditional background candidates; render picks the last whose conditions match, else the base background. */
    backgroundLayers?: BackgroundLayer[];
    /** Stacked background planes (from SetBackground commands with `stack: true`), keyed by
     *  commandId. Each renders as its own backdrop at its `layer`/`parallaxDepth` ON TOP of the
     *  base background — enabling multi-plane parallax scrolling. Persist until scene change. */
    backgroundStack?: BackgroundStackPlane[];
    characters: Record<VNID, StageCharacterState>;
    textOverlays: TextOverlay[];
    imageOverlays: ImageOverlay[];
    buttonOverlays: ButtonOverlay[];
    /** Placed twinkling lights (PlaceLights). Optional/additive — old saves have none. */
    lights?: VNLight[];
    /** Whether the placed lights render in front of characters (from the PlaceLights command). */
    lightsAbove?: boolean;
    /** LIVE binding: number variable multiplying every placed light's brightness (0-2, 1 = as
     *  authored). Additive-optional. */
    lightsBrightnessVariableId?: VNID | null;
    /** Interactive scene hot spots (ShowHotSpot). Optional for back-compat with older saves. */
    hotSpotOverlays?: HotSpotOverlay[];
    /** Persistent movie overlays (transparent, looping) that play behind characters */
    movieOverlays?: Array<{
        url: string;
        loop: boolean;
        trimStart?: number;
        trimEnd?: number;
        holdLastFrame?: boolean;
        transition?: string;
        transitionDuration?: number;
        /** Source PlayMovie command id — lets TweenElement target this movie. */
        commandId?: string;
        /** Set true while the overlay is fading out (before removal). */
        exiting?: boolean;
        /** Parallax depth — shifts the placed video with the scene's parallax (0 = locked). */
        parallaxDepth?: number;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        opacity?: number;
        objectFit?: 'cover' | 'contain' | 'fill' | 'custom';
    }>;
    screen: {
        shake: { active: boolean; intensity: number };
        tint: string;
        /** Tint coverage 0-100 (undefined = 100 — old saves render identically). */
        tintOpacity?: number;
        /** LIVE binding: number variable driving tint opacity while the tint is on screen. */
        tintOpacityVariableId?: VNID | null;
        zoom: number;
        panX: number;
        panY: number;
        transitionDuration: number;
        overlayEffects: VNScreenOverlayEffect[];
    };
    /** Active particle effects on stage */
    particleEffects: Record<string, {
        tag: string;
        config: VNParticleConfig;
        /** Timestamp when this effect started */
        startTime: number;
        /** Auto-stop duration (0 = persistent) */
        duration: number;
        /** LIVE bindings: number variables driving emitter knobs while the effect runs
         *  (resolved into the config every render; static config values = fallbacks). */
        varBindings?: { emitRate?: VNID | null; wind?: VNID | null; gravity?: VNID | null; opacity?: VNID | null };
        /** Whether the effect is fading out */
        fadingOut?: boolean;
        /** Fade out duration remaining */
        fadeOutDuration?: number;
    }>;
}

export interface MusicState {
    audioId: VNID | null;
    loop: boolean;
    currentTime: number;
    isPlaying: boolean;
}

export interface PlayerState {
    mode: 'menu' | 'playing' | 'paused';
    currentSceneId: VNID;
    currentCommands: VNCommand[];
    currentIndex: number;
    commandStack: Array<{
        sceneId: VNID;
        commands: VNCommand[];
        index: number;
        /** Common Event id this frame is running (for cycle detection). */
        commonEventId?: VNID;
        /** Prior values of variables this CE call overrode, to restore on return (true local param scope). */
        savedVariables?: Record<VNID, string | number | boolean>;
        /** Keys that did NOT exist before the call (param ids) — delete on return. */
        clearedVariables?: VNID[];
    }>;
    variables: Record<VNID, string | number | boolean>;
    stageState: StageState;
    musicState: MusicState;
    /** Player's positional inventory layout: index = slot, value = item id (or null for an empty
     *  slot). Lets items sit in any slot with gaps. Persists in saves. Items not placed here fall
     *  into the first empty slots in registry order. */
    inventorySlots?: (VNID | null)[];
    /** The item the player has selected in an inventory grid (for a "Use selected item" button). */
    selectedItemId?: VNID | null;
    /** Which grid element owns the current selection — so two grids showing the same item don't both
     *  highlight it. The selected-item actions still use `selectedItemId` (the most recent selection). */
    selectedElementId?: VNID | null;
    /** Command ids of "pick up once" Show Item pickups the player has already collected, so they don't
     *  reappear on scene revisits. Persisted in saves; reset on a new game. */
    pickedUpItems?: VNID[];
    /** Palette→UI restyle from a won coloring mini game: UI-target → hex color (e.g.
     *  dialogueBg → the color the player painted the "dress" slot). Consulted by
     *  DialogueBox/ChoiceMenu over the authored colors; cleared by the Clear UI Palette
     *  action. Additive-optional; persisted in saves (old saves simply have none). */
    uiPaletteOverride?: Record<string, string> | null;
    history: HistoryEntry[];
    /** Saved choice/input responses for skip-backward replay (keyed by `sceneId:commandIndex`) */
    savedInputs: Record<string, { type: 'choice'; choice: ChoiceOption } | { type: 'textInput'; value: string }>;
    uiState: {
        dialogue: {
            characterName: string;
            characterColor: string;
            characterId: VNID | null;
            text: string;
            /** Voice audio clip ID to play for this line */
            voiceAudioId?: VNID | null;
            /** Text effect for this dialogue line */
            textEffect?: VNDialogueTextEffect;
            /** Per-line textbox theme override id (from the Dialogue command); resolved at render. */
            textboxThemeId?: VNID | null;
            /** Per-line text-speed override (1-100); unset = use the global Text Speed setting. */
            textSpeed?: number;
            /** Per-line auto-advance timer, SECONDS, counted from typewriter completion. */
            timeLimit?: number;
            /** Timer-only advance: clicks/keys reveal text but never advance the line. */
            timeLimitLocked?: boolean;
            /** Show a countdown bar while the timer runs. */
            showTimer?: boolean;
        } | null;
        choices: ChoiceOption[] | null;
        /** Layout for the active choice menu (from the Choice command). undefined = vertical stack. */
        choiceLayout?: 'vertical' | 'horizontal' | 'free';
        /** Time-limited choice config (from the Choice command). When choiceTimeLimit > 0 a countdown
         *  runs while the choices are shown and auto-resolves on expiry. */
        choiceTimeLimit?: number;
        choiceShowTimer?: boolean;
        choiceTimeoutBehavior?: 'option' | 'actions';
        choiceTimeoutOptionId?: VNID;
        choiceTimeoutActions?: import('../../../types/shared').VNUIAction[];
        textInput: {
            variableId: VNID;
            prompt: string;
            placeholder: string;
            maxLength: number;
        } | null;
        movieUrl: string | null;
        movieLoop?: boolean;
        movieTrimStart?: number;
        movieTrimEnd?: number;
        movieHoldLastFrame?: boolean;
        movieTransition?: string;
        movieTransitionDuration?: number;
        /** Set true while a fullscreen movie is fading out (before clearing). */
        movieExiting?: boolean;
        isWaitingForInput: boolean;
        isTransitioning: boolean;
        transitionElement: React.ReactNode | null;
        flash: { color: string, duration: number } | null;
        showHistory: boolean;
        screenSceneId: VNID | null; // Track which scene a UI screen was opened from
        /** Whether skip-forward is currently active */
        isSkipping: boolean;
        /** A full-screen travel map overlay (TRANSIENT — not saved; like choices, a paused Show
         *  Map command re-presents on load). `fromCommand` = the scene is paused on it (tap/cancel
         *  must advance); false = opened by a button action (closing just closes). */
        mapOverlay?: { mapId: VNID; allowCancel?: boolean; fromCommand?: boolean } | null;
        /** A full-screen mini game overlay (TRANSIENT — not saved; a paused Show Mini Game
         *  command re-presents on load, so progress deliberately never enters saves).
         *  `fromCommand` = the scene is paused on it (win/skip/fail exits must advance);
         *  false = opened by a button action (resolving just closes). */
        miniGameOverlay?: { gameId: VNID; fromCommand?: boolean } | null;
        /** In-game phone: open state + accumulated chat history. Persists in saves. */
        phone?: {
            open: boolean;
            messages: PhoneMessage[];
            /** True while a chat message is presenting reply choices. */
            waiting?: boolean;
            /** Reply options for the current chat prompt (rendered as in-phone reply buttons). */
            pendingChoices?: ChoiceOption[];
            /** Richer reply options (text + follow-up sender messages + actions) for incoming texts. */
            pendingReplies?: PhoneReply[];
            /** Which phone APP is showing. The legacy union values ('home'|'chat'|'history'|
             *  'contacts') double as app ids VERBATIM, so saves from before the app registry load
             *  unchanged; newer apps just add ids. Unknown/disabled ids fall back to 'home' at
             *  render (see PHONE_APPS). */
            view?: PhoneAppId;
            /** The contact whose chat thread is currently open (filters the chat view). null = all messages. */
            activeContactId?: VNID | null;
            /** An in-progress OUTGOING call (player tapped Call in Contacts) → "Calling…" screen. */
            outgoingCall?: { contactId: VNID } | null;
            /** A pending incoming-text banner (non-blocking notification the player can tap to read). */
            notification?: PhoneNotification | null;
            /** A live "…" typing indicator shown on the sender side before a message lands. */
            typing?: { senderId: VNID | 'player' } | null;
            /** An active incoming call (ringing) or the just-ended call awaiting teardown. */
            incomingCall?: PhoneIncomingCallState | null;
            /** A LIVE scripted call (post-accept / post-dialing): the voiced transcript playing on
             *  the call screen. Rides the saved phone slice — a save mid-call resumes (the next
             *  line's timer is re-armed on load; 'dialing' is dropped like outgoingCall).
             *  Additive-optional. */
            activeCall?: PhoneActiveCallState | null;
            /** Persistent log of calls (accepted / declined / missed) for the recents view. */
            callLog?: PhoneCallLogEntry[];
            /** Unread/notification badge flag (drives the dialogue-box / HUD badge). */
            unread?: boolean;
            /** Photos received via texts — the Gallery app's "Photos" tab. Additive-optional. */
            cameraRoll?: PhoneCameraRollEntry[];
            /** The player's wallpaper pick (Settings app; a phoneWallpapers entry id). Rides the
             *  save. Unset / stale / condition-failing → the author's default wallpaper. */
            wallpaperId?: VNID | null;
            /** Notification history (texts, missed calls, Phone Notification command) — listed at
             *  the top of the Recents app; opening the phone marks them read. Additive-optional. */
            notifications?: PhoneNotificationEntry[];
            /** Per-thread "messages seen" counts for the Messages inbox unread pills. Key = the
             *  thread's contact/character id ('' = legacy unfiled messages). Value = how many of
             *  that thread's messages the player had seen when they last opened it. Missing on
             *  old saves → seeded from current counts at load (everything reads as seen). */
            threadLastRead?: Record<string, number>;
            /** Conversation-list entries (calls + texts) that already played — `once` entries in
             *  this list are skipped by the picker. Marked when a conversation STARTS. */
            playedConversations?: VNID[];
            /** A scripted text conversation currently playing in a chat thread. */
            activeTextConvo?: PhoneActiveTextState | null;
        } | null;
    };
}

/** The phone's app ids. The first four are the legacy `view` values (saved games store them, so
 *  they must never be renamed); the rest are the app-registry additions. The registry itself
 *  (render functions, icons, enablement) lives in live-preview/phone/phoneApps.tsx. */
export type PhoneAppId = 'home' | 'chat' | 'history' | 'contacts' | 'gallery' | 'map' | 'settings' | 'call';

/** One chat bubble in the in-game phone. `senderId` = a character id, or 'player' for the player's
 *  own (right-aligned) message. Stored in player state so the conversation persists across save/load. */
export interface PhoneMessage {
    id: VNID;
    senderId: VNID | 'player';
    text: string;
    /** Optional per-message avatar source (base sprite / chosen pose / custom). Unset = base. */
    portrait?: PhonePortraitSource;
    /** The contact thread this message belongs to (a character id). Character messages = senderId;
     *  player replies = the active thread. Lets the Contacts app filter per-conversation. */
    contactId?: VNID;
    /** Photo/video attached to the message (tap = fullscreen; collected into the camera roll). */
    image?: { type: 'image' | 'video'; id: VNID } | null;
}

/** One photo in the phone Gallery's camera roll (received via texts). Per-playthrough; rides the
 *  saved phone slice. De-duped by the originating message id. */
export interface PhoneCameraRollEntry {
    id: VNID;
    image: { type: 'image' | 'video'; id: VNID };
    senderId?: VNID | 'player';
    contactId?: VNID;
    caption?: string;
    order: number;
}

/** A non-blocking notification banner (incoming texts, missed calls, and the generic
 *  Phone Notification command). senderId became optional when generic notifications arrived —
 *  old saves always have it, so nothing breaks. */
export interface PhoneNotification {
    senderId?: VNID | 'player';
    text: string;
    portrait?: PhonePortraitSource;
    visible: boolean;
    /** Generic-notification extras (additive). */
    title?: string;
    icon?: string;                                 // PHONE_GLYPHS key
    iconImage?: { type: 'image'; id: VNID } | null;
    /** Tapping the banner runs these (default = open the phone, today's behavior). */
    tapActions?: any[];
}

/** One row in the phone's notification list (top of the Recents app). */
export interface PhoneNotificationEntry {
    id: VNID;
    title?: string;
    text: string;
    icon?: string;
    iconImage?: { type: 'image'; id: VNID } | null;
    portrait?: PhonePortraitSource;
    senderId?: VNID | 'player';
    read?: boolean;
    tapActions?: any[];
    order: number;
}

/** Live state of an incoming call. Carries the originating command so a save can fully restore the
 *  call (accept/decline/timeout actions, ringtone, duration) and re-arm the ring on load. */
export interface PhoneIncomingCallState {
    callerId: VNID | 'player';
    portrait?: PhonePortraitSource;
    /** 'ringing' while awaiting accept/decline/timeout; 'ended' briefly after. */
    phase: 'ringing' | 'ended';
    /** Whether the call rings as a modal overlay (pauses) or in the corner (non-blocking). */
    modal?: boolean;
    /** The command that started the call (for save/load restore of actions + ringtone + timeout). */
    cmd?: PhoneIncomingCallCommand;
}

/** One entry in the phone's recents/call log. */
export interface PhoneCallLogEntry {
    id: VNID;
    callerId: VNID | 'player';
    status: 'accepted' | 'declined' | 'missed';
    portrait?: PhonePortraitSource;
    order: number;
    /** Which way the call went (additive; unset = legacy incoming). */
    direction?: 'incoming' | 'outgoing';
    /** How long a transcript call lasted (additive; unset for legacy/no-transcript calls). */
    durationMs?: number;
}

/** A LIVE scripted call (the voiced in-call transcript). The RINGING stage stays on
 *  `incomingCall` (so its save/load re-arm is untouched); this begins at accept / after dialing.
 *  The whole object rides the saved phone slice; `conversation` is carried like
 *  `incomingCall.cmd` so a load can resume from `lineIndex`/`queue`. */
export interface PhoneActiveCallState {
    contactId: VNID | 'player';
    direction: 'incoming' | 'outgoing';
    portrait?: PhonePortraitSource;
    /** dialing (outgoing connect beat) → active (lines playing) → ended (brief "Call ended" beat). */
    phase: 'dialing' | 'active' | 'ended';
    /** The authored conversation being played. */
    conversation?: PhoneCallConversation;
    /** Next conversation line to land (index into conversation.lines). */
    lineIndex: number;
    /** Reply-injected follow-up lines pending before lineIndex resumes. */
    queue?: PhoneFollowUp[];
    /** Call-styled bubbles spoken so far (kept separate from texting messages). */
    transcript: PhoneMessage[];
    /** Replies currently offered (playback paused until a tap). */
    pendingReplies?: PhoneReply[];
    /** Accumulated talk time in ms — snapshotted at save; the live timer adds (now − resumedAt). */
    elapsedMs: number;
    /** Scene waits for the call to end (advance on end). */
    blocking?: boolean;
}

/** A LIVE scripted TEXT conversation (a contact's gated textConversations entry playing out in
 *  the chat thread: typing dots → lines land as messages → pauses on replies). Mirrors the
 *  activeCall save/load contract: rides the phone slice verbatim; a load re-arms the next-line
 *  timer unless it's paused on replies (landed lines are already in `messages`). */
export interface PhoneActiveTextState {
    contactId: VNID;
    /** The authored conversation being played (carried like activeCall.conversation). */
    conversation: PhoneCallConversation;
    /** Next conversation line to land (index into conversation.lines). */
    lineIndex: number;
    /** The contact-list entry that started this (for the editor / debugging). */
    entryId?: VNID;
}

export interface GameStateSave {
    timestamp: number;
    sceneName: string;
    /** Base64 data URL of a screenshot thumbnail */
    screenshot?: string;
    playerStateData: {
        currentSceneId: VNID;
        currentCommands: VNCommand[];
        currentIndex: number;
        commandStack: Array<{sceneId: VNID, commands: VNCommand[], index: number}>;
        variables: Record<VNID, string | number | boolean>;
        stageState: StageState;
        musicState: MusicState;
        /** In-game phone runtime state (additive-optional; older saves lack it). Persisted in full so
         *  an in-progress conversation, pending replies, a notification, and an active call all restore
         *  exactly as they were. */
        phone?: PlayerState['uiState']['phone'];
    }
}

export interface HistoryEntry {
    timestamp: number;
    type: 'dialogue' | 'choice' | 'textInput';
    characterName?: string;
    characterColor?: string;
    text: string;
    choiceText?: string; // For tracking which choice was selected
    inputValue?: string; // For tracking text input values
    /** Scene + command index snapshot for skip-backward navigation */
    sceneId?: VNID;
    commandIndex?: number;
    /** For choice entries: the full choice option so we can replay it */
    choiceOption?: ChoiceOption;
    /** For textInput entries: the variable that was set */
    variableId?: VNID;
    /** Full stage state snapshot for backward navigation (background, characters, overlays) */
    stageSnapshot?: StageState;
    /** Variables snapshot for backward navigation */
    variablesSnapshot?: Record<VNID, string | number | boolean>;
    /** Music state snapshot for backward navigation */
    musicSnapshot?: MusicState;
}

export interface GameSettings {
    textSpeed: number;
    musicVolume: number;
    sfxVolume: number;
    voiceVolume: number;
    ambientVolume: number;
    enableSkip: boolean;
    autoAdvance: boolean;
    autoAdvanceDelay: number; // in seconds
}

export const defaultSettings: GameSettings = {
    textSpeed: 50,
    musicVolume: 0.8,
    sfxVolume: 0.8,
    voiceVolume: 0.8,
    ambientVolume: 0.8,
    enableSkip: true,
    autoAdvance: false,
    autoAdvanceDelay: 3,
};
