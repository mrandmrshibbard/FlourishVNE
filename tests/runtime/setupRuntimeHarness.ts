import fs from 'node:fs';
import path from 'node:path';

import { VNProject } from '../../src/types/project';
import { VNCommand } from '../../src/features/scene/types';

export interface RuntimeHarness {
    project: VNProject;
    loadSceneCommands: (sceneId: string) => VNCommand[];
    cloneProject: () => VNProject;
}

const fixtureFileName = 'character-sample.json';

/**
 * Loads the editor-facing sample project from fixtures. This ensures automated
 * tests exercise flows that creators can reproduce directly inside the visual editor.
 */
export function loadSampleProject(): VNProject {
    const fixturePath = path.resolve(__dirname, 'fixtures', fixtureFileName);
    const raw = fs.readFileSync(fixturePath, 'utf-8');
    const parsed = JSON.parse(raw) as VNProject;
    return parsed;
}

/**
 * Creates a reusable harness that offers helper accessors for runtime tests.
 * Provides immutable snapshots so each test runs against a clean project clone.
 */
export function createRuntimeHarness(project?: VNProject): RuntimeHarness {
    const baseProject = project ?? loadSampleProject();

    const loadSceneCommands = (sceneId: string): VNCommand[] => {
        const scene = baseProject.scenes[sceneId];
        if (!scene) {
            throw new Error(`Scene ${sceneId} not found in project ${baseProject.id}`);
        }
        return scene.commands;
    };

    const cloneProject = (): VNProject => JSON.parse(JSON.stringify(baseProject));

    return {
        project: baseProject,
        loadSceneCommands,
        cloneProject,
    };
}
