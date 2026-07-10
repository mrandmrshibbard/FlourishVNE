/**
 * applyPhoneSetup — turns the Systems-hub "Phone" quick-setup wizard into a working in-game
 * phone using only UPDATE_UI_CONFIG writes (everything lands on project.ui.phone* — the same
 * fields the In-Game UI → Phone panel edits, so authors can restyle afterwards).
 *
 * IDEMPOTENT: it fills gaps and merges — re-running never duplicates app icons, contacts, or
 * wallpapers, and never touches styling unless a preset was explicitly chosen.
 */
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import { PhoneButtonConfig, PhoneContact } from '../ui/types';
import { PHONE_APP_CHOICES } from '../../components/live-preview/phone/phoneApps';

const gid = (p: string) => `${p}-${Math.random().toString(36).substring(2, 9)}`;

export type PhoneStylePresetId = 'keep' | 'midnight' | 'blush' | 'mint';

/** The wizard's 2-3 theme bundles — each is just a batch of ordinary phone* style fields. */
export const PHONE_STYLE_PRESETS: Record<Exclude<PhoneStylePresetId, 'keep'>, { name: string; blurb: string; fields: Record<string, any> }> = {
    midnight: {
        name: 'Midnight', blurb: 'Sleek dark phone with blue chat bubbles.',
        fields: {
            phoneShellColor: '#1c1f2a', phoneScreenColor: '#0b0d12', phoneScreenBorderColor: 'rgba(255,255,255,0.12)',
            phoneStatusBarColor: 'rgba(255,255,255,0.06)', phoneStatusIconColor: '#e5e7eb',
            phoneIncomingBubbleColor: '#242a3a', phoneOutgoingBubbleColor: '#3b82f6', phoneBubbleTextColor: '#f3f4f6',
            phoneButtonBarColor: 'rgba(255,255,255,0.06)', phoneButtonIconColor: '#cbd5e1', phoneButtonActiveColor: '#3b82f6',
            phoneHomeIconBgColor: 'rgba(255,255,255,0.08)', phoneNotifColor: '#1f2430', phoneNotifTextColor: '#f3f4f6',
            phoneBadgeColor: '#ef4444', phoneCallBgColor: '#101320',
        },
    },
    blush: {
        name: 'Blush', blurb: 'Soft pink casing with a light screen.',
        fields: {
            phoneShellColor: '#f3c6d8', phoneScreenColor: '#fff7fb', phoneScreenBorderColor: 'rgba(0,0,0,0.08)',
            phoneStatusBarColor: 'rgba(236,72,153,0.10)', phoneStatusIconColor: '#831843',
            phoneIncomingBubbleColor: '#fde5ef', phoneOutgoingBubbleColor: '#ec4899', phoneBubbleTextColor: '#3b0a20',
            phoneButtonBarColor: 'rgba(236,72,153,0.10)', phoneButtonIconColor: '#9d2960', phoneButtonActiveColor: '#ec4899',
            phoneHomeIconBgColor: 'rgba(236,72,153,0.12)', phoneNotifColor: '#fce7f3', phoneNotifTextColor: '#500724',
            phoneBadgeColor: '#db2777', phoneCallBgColor: '#4a1030',
        },
    },
    mint: {
        name: 'Mint', blurb: 'Fresh teal-and-cream look.',
        fields: {
            phoneShellColor: '#134e4a', phoneScreenColor: '#f0fdfa', phoneScreenBorderColor: 'rgba(0,0,0,0.10)',
            phoneStatusBarColor: 'rgba(13,148,136,0.12)', phoneStatusIconColor: '#134e4a',
            phoneIncomingBubbleColor: '#ccfbf1', phoneOutgoingBubbleColor: '#0d9488', phoneBubbleTextColor: '#042f2e',
            phoneButtonBarColor: 'rgba(13,148,136,0.12)', phoneButtonIconColor: '#0f766e', phoneButtonActiveColor: '#0d9488',
            phoneHomeIconBgColor: 'rgba(13,148,136,0.14)', phoneNotifColor: '#d1faf5', phoneNotifTextColor: '#053b37',
            phoneBadgeColor: '#f59e0b', phoneCallBgColor: '#0b3b37',
        },
    },
};

export interface PhoneSetupConfig {
    /** 'keep' = leave every style field exactly as it is (only wiring is added). */
    stylePreset: PhoneStylePresetId;
    /** Apps to put on the home screen (grid icons). Empty = leave buttons/layout untouched. */
    appIds: string[];
    /** Characters to seed as contacts (skips ones that already have a contact). */
    contactCharacterIds: VNID[];
    /** Image/video assets offered as player wallpapers in the Settings app. */
    wallpaperImageIds: VNID[];
}

type Dispatch = (action: any) => void;

export interface PhoneSetupResult {
    addedButtons: number;
    addedContacts: number;
    addedWallpapers: number;
}

export function applyPhoneSetup(config: PhoneSetupConfig, project: VNProject, dispatch: Dispatch): PhoneSetupResult {
    const ui = project.ui;
    const set = (key: string, value: any) => dispatch({ type: 'UPDATE_UI_CONFIG', payload: { key, value } });

    // 1. Turn the feature on.
    if (!ui.phoneEnabled) set('phoneEnabled', true);

    // 2. Style preset (explicit choice only — 'keep' never touches a style field).
    if (config.stylePreset !== 'keep') {
        const preset = PHONE_STYLE_PRESETS[config.stylePreset];
        Object.entries(preset.fields).forEach(([key, value]) => set(key, value));
    }

    // 3. Home-screen app icons — merge into phoneButtons by appId (existing buttons kept as-is).
    let addedButtons = 0;
    if (config.appIds.length > 0) {
        const existing = ui.phoneButtons || [];
        const have = new Set(existing.map(b => b.appId).filter(Boolean));
        const additions: PhoneButtonConfig[] = config.appIds
            .filter(appId => !have.has(appId))
            .map(appId => {
                const choice = PHONE_APP_CHOICES.find(c => c.id === appId);
                return { id: gid('pbtn'), appId, builtinIcon: choice?.glyph || 'phone', label: choice?.label || appId };
            });
        addedButtons = additions.length;
        if (additions.length > 0) set('phoneButtons', [...existing, ...additions]);
        // The wizard's app picker is a home-grid design choice; only flip the layout when the
        // author hasn't picked one themselves (bar/free stay put on re-runs).
        if (!ui.phoneButtonLayout) set('phoneButtonLayout', 'grid');
    }

    // 4. Seed contacts from characters — one per character that doesn't already have one.
    let addedContacts = 0;
    if (config.contactCharacterIds.length > 0) {
        const existing = ui.phoneContacts || [];
        const have = new Set(existing.map(c => c.characterId));
        const additions: PhoneContact[] = config.contactCharacterIds
            .filter(chId => project.characters[chId] && !have.has(chId))
            .map(chId => ({ id: gid('contact'), characterId: chId }));
        addedContacts = additions.length;
        if (additions.length > 0) set('phoneContacts', [...existing, ...additions]);
    }

    // 5. Starter wallpapers for the player's Settings app — merge by image id.
    let addedWallpapers = 0;
    if (config.wallpaperImageIds.length > 0) {
        const existing = ui.phoneWallpapers || [];
        const have = new Set(existing.map(w => w.image?.id));
        const additions = config.wallpaperImageIds
            .filter(id => !have.has(id))
            .map(id => ({ id: gid('wp'), image: { type: 'image' as const, id } }));
        addedWallpapers = additions.length;
        if (additions.length > 0) set('phoneWallpapers', [...existing, ...additions]);
    }

    return { addedButtons, addedContacts, addedWallpapers };
}
