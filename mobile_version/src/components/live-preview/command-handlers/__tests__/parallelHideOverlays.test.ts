/**
 * Parallel hide commands must COMPOSE: three async Hide Image/Text/Button commands with
 * fades all mark their overlays hiding — the classic race was each handler building the
 * overlay list from its own STALE closure, so the last stagePatch clobbered the others'
 * hide flags (only one piece faded; the rest vanished abruptly later).
 */
import { describe, it, expect, vi } from 'vitest';
import { handleHideImage, handleHideText, handleHideButton } from '../overlayHandler';
import { CommandType } from '../../../../features/scene/types';

const mkOverlay = (id: string): any => ({ id, x: 50, y: 50, width: 10, height: 10, opacity: 1 });

const ctxWithStage = (stage: any): any => ({
    playerState: { stageState: stage },
    setPlayerState: vi.fn(),
    advance: vi.fn(),
});

const hideCmd = (type: any, targetCommandId: string): any => ({
    id: `h-${targetCommandId}`, type, targetCommandId, transition: 'fade', duration: 0.5,
});

describe('parallel overlay hides compose (stagePatch reads LATEST stage)', () => {
    it('three image hides sharing one STALE snapshot all land their hide flags', () => {
        const stale = { imageOverlays: [mkOverlay('a'), mkOverlay('b'), mkOverlay('c')], textOverlays: [], buttonOverlays: [] };
        // All three handlers see the SAME stale state (the async chain reality).
        const results = ['a', 'b', 'c'].map(id =>
            handleHideImage(hideCmd(CommandType.HideImage, id), ctxWithStage(stale)));
        // Apply their patches SEQUENTIALLY onto an evolving live state.
        let live: any = { ...stale };
        for (const r of results) live = { ...live, ...r.stagePatch!(live) };
        expect(live.imageOverlays.map((o: any) => o.action)).toEqual(['hide', 'hide', 'hide']);
        // And each still schedules its cleanup.
        for (const r of results) { expect(r.advance).toBe(false); expect(r.delay).toBeGreaterThan(0); expect(typeof r.callback).toBe('function'); }
    });

    it('text and button hides follow the same contract', () => {
        const stale = { imageOverlays: [], textOverlays: [mkOverlay('t1'), mkOverlay('t2')], buttonOverlays: [mkOverlay('b1'), mkOverlay('b2')] };
        const tr = ['t1', 't2'].map(id => handleHideText(hideCmd(CommandType.HideText, id), ctxWithStage(stale)));
        const br = ['b1', 'b2'].map(id => handleHideButton(hideCmd(CommandType.HideButton, id), ctxWithStage(stale)));
        let live: any = { ...stale };
        for (const r of [...tr, ...br]) live = { ...live, ...r.stagePatch!(live) };
        expect(live.textOverlays.map((o: any) => o.action)).toEqual(['hide', 'hide']);
        expect(live.buttonOverlays.map((o: any) => o.action)).toEqual(['hide', 'hide']);
    });

    it('instant hides still remove immediately and compose', () => {
        const stale = { imageOverlays: [mkOverlay('a'), mkOverlay('b')], textOverlays: [], buttonOverlays: [] };
        const results = ['a', 'b'].map(id =>
            handleHideImage({ id: `h-${id}`, type: CommandType.HideImage, targetCommandId: id, transition: 'instant' } as any, ctxWithStage(stale)));
        let live: any = { ...stale };
        for (const r of results) { expect(r.advance).toBe(true); live = { ...live, ...r.stagePatch!(live) }; }
        expect(live.imageOverlays).toEqual([]);
    });
});
