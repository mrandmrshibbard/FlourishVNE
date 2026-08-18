/**
 * The engine contract.
 *
 * The previous converter invented condition operator names ("equals", "greater_than") that the
 * engine's evaluator does not recognise. Its `default:` branch returns FALSE, so 653/653
 * conditional branches always took the false path and ~632 story branches never ran — silently.
 * The same class of bug wrote `elementId` where HideImage reads `targetCommandId` (73/73 dead).
 *
 * `tsc` already catches these through `ir/engineContract.ts` (type-only imports of the real
 * engine shapes). These tests catch the other half: the engine RENAMING something out from
 * under us, which types alone cannot see because our mirror would still be self-consistent.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CT, OPERATORS, RENPY, OVERLAY_REFERENCE, SPRITE_FRAME } from '../ir/engineContract';
import { CommandType } from '../../../src/features/scene/types';
import { validateProjectForBuild } from '../../../src/utils/buildValidator';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '..', '..', '..', 'src');

describe('CommandType mirror', () => {
    it('every type this converter emits is a real CommandType member, spelled identically', () => {
        const real = new Set(Object.values(CommandType) as string[]);
        for (const [key, value] of Object.entries(CT)) {
            expect(real.has(value), `CT.${key} = "${value}" is not a CommandType member`).toBe(true);
            // The enum is `Name = 'Name'` throughout; a mirror key that disagrees with its value
            // would still typecheck but would read confusingly at every call site.
            expect(key, 'CT keys must equal their values').toBe(value);
        }
    });
});

describe('condition operators', () => {
    /** The union is a TYPE, so it cannot be enumerated at runtime — read it from the source. */
    const readOperatorUnion = (): Set<string> => {
        const src = fs.readFileSync(path.join(SRC, 'types', 'shared.ts'), 'utf8');
        const m = src.match(/export type VNConditionOperator\s*=\s*([\s\S]*?);/);
        expect(m, 'VNConditionOperator declaration not found — the engine moved it').toBeTruthy();
        return new Set([...m![1].matchAll(/'([^']+)'/g)].map(x => x[1]));
    };

    it('every operator this converter can emit exists in the engine union', () => {
        const real = readOperatorUnion();
        expect(real.size).toBeGreaterThan(5);
        for (const [key, value] of Object.entries(OPERATORS)) {
            expect(real.has(value), `OPERATORS.${key} = "${value}" is not a VNConditionOperator`).toBe(true);
        }
    });

    it('rejects the invented names that caused the 653-dead-branch bug', () => {
        const real = readOperatorUnion();
        for (const bogus of ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal']) {
            expect(real.has(bogus), `"${bogus}" must NOT be a valid operator`).toBe(false);
            expect(Object.values(OPERATORS as Record<string, string>)).not.toContain(bogus);
        }
    });
});

describe('validator is reachable and enforced', () => {
    it('validateProjectForBuild reports errors on an empty project (so a real run cannot pass by accident)', () => {
        // Shaped enough for the validator to walk (it dereferences project.ui), but empty of
        // content — so "zero errors" can never be a false pass caused by an unwalkable project.
        const empty = { scenes: {}, startSceneId: '', ui: {}, variables: {}, characters: {} } as any;
        const result = validateProjectForBuild(empty);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });
});

describe('geometry constants match the engine', () => {
    it('the sprite frame constants are self-consistent', () => {
        // Frame: 90% of stage height, 3:4 aspect. In Ren'Py virtual px at 1920x1080.
        expect(SPRITE_FRAME.heightPx).toBeCloseTo(RENPY.height * SPRITE_FRAME.heightFraction, 6);
        expect(SPRITE_FRAME.widthPx).toBeCloseTo(SPRITE_FRAME.heightPx * SPRITE_FRAME.aspect, 6);
        // 1920 * 0.675 * 9/16 = 729 — the frame width expressed against stage width.
        expect(SPRITE_FRAME.widthPx).toBeCloseTo(RENPY.width * 0.675 * (9 / 16), 6);
    });

    it('the overlay reference is exactly 2/3 of the Ren\'Py space on BOTH axes', () => {
        // This is why ShowImage needs only ONE scalar and has no pillarbox/letterbox case.
        expect(OVERLAY_REFERENCE.width / RENPY.width).toBeCloseTo(2 / 3, 12);
        expect(OVERLAY_REFERENCE.height / RENPY.height).toBeCloseTo(2 / 3, 12);
    });

    it('the engine really does render ShowImage against 1280x720', () => {
        const lp = fs.readFileSync(path.join(SRC, 'components', 'LivePreview.tsx'), 'utf8');
        expect(lp).toMatch(/\/\s*1280\s*\)\s*\*\s*100|1280\s*\*\s*100|\/\s*1280/);
        expect(lp).toMatch(/\/\s*720/);
    });
});
