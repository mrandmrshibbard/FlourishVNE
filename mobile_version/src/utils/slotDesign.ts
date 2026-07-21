import { UISlotDesign, UISlotDesignPart } from '../features/ui/types';

/** Minimal save info a slot-text token needs (the full GameStateSave carries much more). */
export interface SlotTokenData {
    timestamp?: number;
    sceneName?: string;
}

/**
 * Fill a slot-text template's tokens for one slot.
 *   {slot}  → slot number (1-based)
 *   {scene} → the saved scene's name ('' when empty)
 *   {date}  → save date in the player's locale ('' when empty)
 *   {time}  → save time in the player's locale ('' when empty)
 */
export function formatSlotText(template: string, slotNumber: number, save?: SlotTokenData | null): string {
    const d = save?.timestamp ? new Date(save.timestamp) : null;
    return (template || '')
        .replace(/\{slot\}/gi, String(slotNumber))
        .replace(/\{scene\}/gi, save?.sceneName ?? '')
        .replace(/\{date\}/gi, d ? d.toLocaleDateString() : '')
        .replace(/\{time\}/gi, d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
}

/** True when the element should render the author-designed slot instead of the classic card. */
export function isSlotDesignActive(design?: UISlotDesign): boolean {
    return !!design?.enabled && (!!design.background || (design.parts?.length ?? 0) > 0);
}

/** Should this part render for the slot's current occupied/empty state? */
export function slotPartVisible(part: UISlotDesignPart, occupied: boolean): boolean {
    const when = part.visibleWhen || 'always';
    return when === 'always' || (when === 'occupied' ? occupied : !occupied);
}

/** DOM event name that turns save-slot grid pages (fired by the Next/Previous page actions,
 *  heard by every mounted SaveSlotGrid). detail: { targetElementId?: string|null, delta: 1|-1 } */
export const SLOT_GRID_PAGE_EVENT = 'vn-saveslots-page';

/** Stable sample save for editor previews (fixed date so previews don't shift between opens). */
export const SAMPLE_SLOT_SAVE: SlotTokenData = { timestamp: new Date(2026, 0, 15, 18, 42).getTime(), sceneName: 'Chapter 2 — The Garden' };

/** Neutral inline-SVG placeholder standing in for the save's screenshot in editor previews. */
export const SAMPLE_SLOT_SCREENSHOT =
    'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#3b4a6b"/><stop offset="1" stop-color="#1c2233"/></linearGradient></defs>' +
        '<rect width="160" height="90" fill="url(#g)"/>' +
        '<circle cx="120" cy="24" r="10" fill="#f5e6a8" opacity="0.9"/>' +
        '<path d="M0 70 Q40 52 80 66 T160 62 V90 H0 Z" fill="#28324a"/>' +
        '</svg>'
    );
