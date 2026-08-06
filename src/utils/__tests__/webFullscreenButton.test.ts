/**
 * Web-build fullscreen button: opt-in via project.buildOptions.webFullscreenButton.
 * The chip is injected only when the web pipeline asks for it — absent option
 * (old projects, desktop/android builds) must leave the HTML untouched.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildFullscreenButtonHtml, generateStandaloneHTML } from '../gameBundler';

const project: any = {
    id: 'p1', title: 'Test',
    backgrounds: {}, images: {}, audio: {}, videos: {}, fonts: {},
    ui: {}, scenes: {}, variables: {}, items: {}, uiScreens: {}, characters: {},
};

describe('buildFullscreenButtonHtml', () => {
    it('emits the button, both icons, and the toggle script', () => {
        const html = buildFullscreenButtonHtml();
        expect(html).toContain('id="vn-fullscreen-btn"');
        expect(html).toContain('vn-fs-icon-expand');
        expect(html).toContain('vn-fs-icon-compress');
        expect(html).toContain('requestFullscreen');
        expect(html).toContain('exitFullscreen');
        expect(html).toContain('fullscreenchange');
        // hidden until the script confirms the browser allows fullscreen
        expect(html).toContain('display: none');
    });

    it('places the button in the requested corner (default top-right)', () => {
        expect(buildFullscreenButtonHtml()).toContain('top: 12px; right: 12px;');
        expect(buildFullscreenButtonHtml('bottom-left')).toContain('bottom: 12px; left: 12px;');
        expect(buildFullscreenButtonHtml('top-left')).toContain('top: 12px; left: 12px;');
        expect(buildFullscreenButtonHtml('bottom-right')).toContain('bottom: 12px; right: 12px;');
        // unknown value falls back rather than emitting broken CSS
        expect(buildFullscreenButtonHtml('sideways' as any)).toContain('top: 12px; right: 12px;');
    });
});

describe('generateStandaloneHTML fullscreen gating', () => {
    it('includes the button only when the web pipeline opts in', async () => {
        // Offline-safe: vendor fetches fall back to CDN script tags.
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
        try {
            const withBtn = await generateStandaloneHTML(project, { fullscreenButton: { corner: 'bottom-right' } });
            expect(withBtn).toContain('vn-fullscreen-btn');
            expect(withBtn).toContain('bottom: 12px; right: 12px;');

            // No options at all (desktop/android callers) and explicit null (web, unchecked)
            const plain = await generateStandaloneHTML(project);
            expect(plain).not.toContain('vn-fullscreen-btn');
            const off = await generateStandaloneHTML(project, { fullscreenButton: null });
            expect(off).not.toContain('vn-fullscreen-btn');
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
