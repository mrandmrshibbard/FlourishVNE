/**
 * Inspector group taxonomy — single source of truth for the Properties Inspector
 * revamp (see PROPERTIES_INSPECTOR_REVAMP.md).
 *
 * Every command/element property belongs to exactly one GROUP. The same group
 * list drives three presentations: the docked accordion, the right-click radial
 * menu, and the group-scoped popover. Keeping the taxonomy here (pure data, no
 * JSX, no imports beyond types) means it has zero blast radius and can be
 * consumed anywhere.
 *
 * PILOT SCOPE: only `Dialogue` and `ShowButton` are mapped for now. Other command
 * types return an empty group list (radial disabled) until they're migrated.
 */
import { CommandType } from '../../features/scene/types';
import type { VNCommand } from '../../features/scene/types';

export type InspectorGroupId =
    | 'content'
    | 'transform'
    | 'appearance'
    | 'effects'
    | 'media'
    | 'animation'
    | 'audio'
    | 'logic'
    | 'conditions';

export interface InspectorGroupMeta {
    id: InspectorGroupId;
    /** i18n key under the `ui` namespace (added when the UI is wired). */
    i18nKey: string;
    /** English fallback label, used until the key is translated. */
    label: string;
    /** Short emoji/glyph placeholder; the radial/accordion can swap for real icons. */
    glyph: string;
}

/** Canonical group order (top-to-bottom in the accordion; clockwise in the radial). */
export const INSPECTOR_GROUPS: Record<InspectorGroupId, InspectorGroupMeta> = {
    content:    { id: 'content',    i18nKey: 'inspectorGroups.content',    label: 'Content',    glyph: '✎' },
    transform:  { id: 'transform',  i18nKey: 'inspectorGroups.transform',  label: 'Transform',  glyph: '✣' },
    appearance: { id: 'appearance', i18nKey: 'inspectorGroups.appearance', label: 'Appearance', glyph: '🎨' },
    effects:    { id: 'effects',    i18nKey: 'inspectorGroups.effects',    label: 'Effects',    glyph: '✦' },
    media:      { id: 'media',      i18nKey: 'inspectorGroups.media',      label: 'Media',      glyph: '🖼' },
    animation:  { id: 'animation',  i18nKey: 'inspectorGroups.animation',  label: 'Animation',  glyph: '↗' },
    audio:      { id: 'audio',      i18nKey: 'inspectorGroups.audio',      label: 'Audio',      glyph: '♪' },
    logic:      { id: 'logic',      i18nKey: 'inspectorGroups.logic',      label: 'Logic',      glyph: '⚙' },
    conditions: { id: 'conditions', i18nKey: 'inspectorGroups.conditions', label: 'Conditions', glyph: '⚑' },
};

// Top-to-bottom in the accordion / clockwise in the radial. Logic sits under Audio,
// and Conditions (run-conditions + live-evaluation) sits last, under Logic.
export const GROUP_ORDER: InspectorGroupId[] = [
    'content', 'transform', 'appearance', 'effects', 'media', 'animation', 'audio', 'logic', 'conditions',
];

/**
 * Per-command group membership for the pilot. Returned in canonical order.
 * Empty array = this command isn't migrated yet (radial/grouping disabled for it).
 *
 * NOTE: the `logic` group always includes the universal per-command pieces that
 * `PropertiesInspector` appends to *every* command — show/run conditions and the
 * async/stacking modifiers — so any migrated command should include `logic`.
 */
export function getCommandGroups(command: VNCommand | null | undefined): InspectorGroupId[] {
    if (!command) return [];
    switch (command.type) {
        case CommandType.Dialogue:
            // character + text + voice + keep-open; text effect; run-conditions + live.
            return order(['content', 'effects', 'conditions']);
        case CommandType.ShowButton:
            // text; x/y/w/h/anchor/orientation; colors/font/radius/opacity; images;
            // transition; click sound; waitForClick/quickMenu/onClick/actions/showConditions;
            // run-conditions + live.
            return order(['content', 'transform', 'appearance', 'media', 'animation', 'audio', 'logic', 'conditions']);
        case CommandType.ShowItem:
            // item + quantity; x/y/w/h/anchor/orientation; opacity; image override; transition;
            // click sound; give/disappear/pick-up-once + extra actions + showConditions; run-conditions.
            return order(['content', 'transform', 'appearance', 'media', 'animation', 'audio', 'logic', 'conditions']);
        case CommandType.ShowText:
            // text; x/y/max-w/h/orientation; font/colour/align; shadow/gradient/border; transition.
            return order(['content', 'transform', 'appearance', 'effects', 'animation', 'conditions']);
        case CommandType.ShowImage:
            // image asset; x/y/w/h/scale/orientation; opacity; transition.
            return order(['content', 'transform', 'appearance', 'animation', 'conditions']);
        case CommandType.ShowCharacter:
            // character + expression; position/scale/orientation; visual effects; transition.
            return order(['content', 'transform', 'effects', 'animation', 'conditions']);
        case CommandType.SetCharacterLayer:
            // character + the layers to change; optional transition.
            return order(['content', 'animation', 'conditions']);
        case CommandType.HideCharacter:
        case CommandType.HideText:
        case CommandType.HideImage:
        case CommandType.HideButton:
            return order(['content', 'animation', 'conditions']);
        case CommandType.HideHotSpot:
        case CommandType.StopMovie:
            return order(['content', 'conditions']);
        case CommandType.PlayMovie:
            // video + displayMode + loop + wait; objectFit + custom position/size; opacity.
            return order(['content', 'transform', 'appearance', 'conditions']);
        case CommandType.ShowHotSpot:
            // name/shape/trigger/advance; x/y/w/h; visible outline + colour; actions; conditions.
            return order(['content', 'transform', 'appearance', 'logic', 'conditions']);
        case CommandType.ShowPhoneText:
        case CommandType.ShowPhone:
        case CommandType.HidePhone:
        case CommandType.HidePhoneText:
        case CommandType.PhoneIncomingText:
        case CommandType.PhoneIncomingCall:
            return order(['content', 'conditions']);
        case CommandType.CreditRoll:
            // entries; bg/text colours; slideshow + foreground media; playback (speed/duration/skip/onComplete).
            return order(['content', 'appearance', 'media', 'logic', 'conditions']);
        case CommandType.SpawnParticles:
            // tag/preset/duration; full particle config; conditions.
            return order(['content', 'effects', 'conditions']);
        case CommandType.TweenElement:
            // target/duration/easing/wait; tweened transform props; opacity/colours; conditions.
            return order(['content', 'transform', 'appearance', 'conditions']);
        case CommandType.SetBackground:
            return order(['content', 'animation', 'conditions']);
        case CommandType.PlayMusic:
        case CommandType.StopMusic:
        case CommandType.PlaySoundEffect:
        case CommandType.StopSoundEffect:
            return order(['audio', 'conditions']);
        case CommandType.SetVariable:
            return order(['logic', 'conditions']);
        case CommandType.Choice:
            return order(['content', 'conditions']);
        case CommandType.Jump:
        case CommandType.Wait:
        case CommandType.TextInput:
        case CommandType.ShakeScreen:
        case CommandType.TintScreen:
        case CommandType.PanZoomScreen:
        case CommandType.ResetScreenEffects:
        case CommandType.FlashScreen:
        case CommandType.Lightning:
        case CommandType.Flashlight:
        case CommandType.Fireworks:
        case CommandType.PlaceLights:
        case CommandType.ClearLights:
        case CommandType.SetScreenOverlayEffect:
        case CommandType.ShowScreen:
        case CommandType.Label:
        case CommandType.JumpToLabel:
        case CommandType.Group:
        case CommandType.RunScript:
        case CommandType.StopParticles:
        case CommandType.CallCommonEvent:
        case CommandType.BranchStart:
            return order(['content', 'conditions']);
        case CommandType.BranchEnd:
            return order(['content']);
        default:
            return [];
    }
}

/** True when a command participates in the new grouped/radial UI. */
export function isCommandGrouped(command: VNCommand | null | undefined): boolean {
    return getCommandGroups(command).length > 0;
}

function order(ids: InspectorGroupId[]): InspectorGroupId[] {
    return GROUP_ORDER.filter(id => ids.includes(id));
}
