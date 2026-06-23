/**
 * Built-in icon library for the in-game Phone's bottom buttons. Plain glyphs so they render
 * identically in the editor and in exported games (no asset pipeline). A button can instead use a
 * custom uploaded image (PhoneButtonConfig.iconImage), which overrides the built-in glyph.
 */
export const PHONE_GLYPHS: Record<string, string> = {
    chat: '💬',
    contacts: '👥',
    gallery: '🖼️',
    map: '🗺️',
    call: '📞',
    heart: '❤️',
    star: '⭐',
    settings: '⚙️',
    home: '🏠',
    back: '‹',
    close: '✕',
    phone: '📱',
};

/** Ordered list for the editor's icon picker. */
export const PHONE_ICON_KEYS = Object.keys(PHONE_GLYPHS);
