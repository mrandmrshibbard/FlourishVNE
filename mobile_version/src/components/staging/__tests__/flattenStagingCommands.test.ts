/**
 * flattenStagingCommands — the staging canvas's Call Common Event expansion. Pass-through
 * identity for CE-less scenes, correct provenance metadata, nesting anchored to the OUTERMOST
 * scene call, cycle/depth cuts, disabled-skip, and the first-call-wins duplicate rule.
 */
import { describe, it, expect } from 'vitest';
import { flattenStagingCommands } from '../flattenStagingCommands';
import { CommandType } from '../../../features/scene/types';

const cmd = (id: string, type: string = 'ShowText', extra: any = {}): any => ({ id, type, ...extra });
const call = (id: string, commonEventId: string): any => ({ id, type: CommandType.CallCommonEvent, commonEventId });
const event = (id: string, name: string, commands: any[], enabled = true): any =>
    ({ id, name, enabled, trigger: 'called', commands, parameters: [] });

describe('flattenStagingCommands', () => {
    it('CE-less lists pass through IDENTICALLY (same command references, no ce tags)', () => {
        const cmds = [cmd('a'), cmd('b', 'ShowImage')];
        const flat = flattenStagingCommands(cmds, {});
        expect(flat).toHaveLength(2);
        expect(flat[0].cmd).toBe(cmds[0]);
        expect(flat[1].cmd).toBe(cmds[1]);
        expect(flat.every(e => e.ce === undefined)).toBe(true);
    });

    it('expands a call in place, tagging each command with event + call + index', () => {
        const events = { hud: event('hud', 'HUD', [cmd('t1'), cmd('t2', 'ShowButton')]) };
        const flat = flattenStagingCommands([cmd('a'), call('c1', 'hud'), cmd('z')], events);
        expect(flat.map(e => e.cmd.id)).toEqual(['a', 't1', 't2', 'z']);
        expect(flat[1].ce).toEqual({ eventId: 'hud', eventName: 'HUD', callCommandId: 'c1', ceIndex: 0 });
        expect(flat[2].ce).toEqual({ eventId: 'hud', eventName: 'HUD', callCommandId: 'c1', ceIndex: 1 });
        expect(flat[0].ce).toBeUndefined();
        expect(flat[3].ce).toBeUndefined();
    });

    it('nested calls expand, but callCommandId stays the OUTERMOST scene call', () => {
        const events = {
            outer: event('outer', 'Outer', [cmd('o1'), call('inner-call', 'inner')]),
            inner: event('inner', 'Inner', [cmd('i1')]),
        };
        const flat = flattenStagingCommands([call('c1', 'outer')], events);
        expect(flat.map(e => e.cmd.id)).toEqual(['o1', 'i1']);
        expect(flat[1].ce).toEqual({ eventId: 'inner', eventName: 'Inner', callCommandId: 'c1', ceIndex: 0 });
    });

    it('cycles are cut without throwing', () => {
        const events = {
            a: event('a', 'A', [cmd('a1'), call('ca', 'b')]),
            b: event('b', 'B', [cmd('b1'), call('cb', 'a')]),
        };
        const flat = flattenStagingCommands([call('c1', 'a')], events);
        expect(flat.map(e => e.cmd.id)).toEqual(['a1', 'b1']);
    });

    it('the same event called twice expands ONCE (first call wins — no duplicate overlay ids)', () => {
        const events = { hud: event('hud', 'HUD', [cmd('t1')]) };
        const flat = flattenStagingCommands([call('c1', 'hud'), cmd('mid'), call('c2', 'hud')], events);
        expect(flat.map(e => e.cmd.id)).toEqual(['t1', 'mid']);
        expect(flat[0].ce!.callCommandId).toBe('c1');
    });

    it('disabled, empty, and dangling events are skipped silently', () => {
        const events = {
            off: event('off', 'Off', [cmd('x1')], false),
            empty: event('empty', 'Empty', []),
        };
        const flat = flattenStagingCommands([call('c1', 'off'), call('c2', 'empty'), call('c3', 'gone'), cmd('a')], events);
        expect(flat.map(e => e.cmd.id)).toEqual(['a']);
    });
});
