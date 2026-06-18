import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import defaultProfiles from '../src/config/defaultValidationProfiles.js';

const VALID_SCOPES = new Set(['full', 'selection', 'smoke']);
const CONFIG_FILENAME = 'validation-profiles.json';

export async function loadValidationProfiles(options = {}) {
    const { fsImpl = fs, osImpl = os, pathImpl = path } = options;
    const warnings = [];

    const builtinProfiles = normalizeProfiles(defaultProfiles);
    let profiles = builtinProfiles.slice();
    let sourcePath = null;

    for (const candidate of candidatePaths(pathImpl, osImpl)) {
        try {
            await fsImpl.access(candidate);
        } catch (error) {
            continue;
        }

        try {
            const raw = await fsImpl.readFile(candidate, 'utf-8');
            const parsed = JSON.parse(raw);
            const fromConfig = normalizeProfiles(parsed?.profiles ?? parsed);
            if (fromConfig.length === 0) {
                warnings.push(`Config at ${candidate} does not define any profiles.`);
            }
            profiles = mergeProfiles(builtinProfiles, fromConfig);
            sourcePath = candidate;
            break;
        } catch (error) {
            warnings.push(`Failed to read validation profiles from ${candidate}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    return { profiles, sourcePath, warnings };
}

export function resolveProfileById(profiles, profileId) {
    if (!profileId || typeof profileId !== 'string') {
        return null;
    }
    const target = profileId.trim();
    if (!target) {
        return null;
    }
    const lower = target.toLowerCase();
    return profiles.find((profile) =>
        profile.profileId === target || profile.profileId.toLowerCase() === lower
    ) ?? null;
}

function candidatePaths(pathImpl, osImpl) {
    const explicitFile = process.env.FLOURISH_VALIDATION_CONFIG;
    const explicitDir = process.env.FLOURISH_HOME;
    const cwd = process.cwd();

    const paths = new Set();

    if (explicitFile) {
        paths.add(pathImpl.resolve(explicitFile));
    }
    if (explicitDir) {
        paths.add(pathImpl.resolve(explicitDir, CONFIG_FILENAME));
    }

    paths.add(pathImpl.resolve(cwd, CONFIG_FILENAME));
    paths.add(pathImpl.resolve(cwd, 'config', CONFIG_FILENAME));
    paths.add(pathImpl.resolve(osImpl.homedir(), '.flourish', CONFIG_FILENAME));

    return paths;
}

function mergeProfiles(baseProfiles, overrideProfiles) {
    const map = new Map();
    baseProfiles.forEach((profile) => {
        map.set(profile.profileId.toLowerCase(), profile);
    });
    overrideProfiles.forEach((profile) => {
        map.set(profile.profileId.toLowerCase(), profile);
    });
    return Array.from(map.values());
}

function normalizeProfiles(raw) {
    if (!Array.isArray(raw)) {
        return [];
    }
    const result = [];
    const seen = new Set();
    raw.forEach((candidate) => {
        const parsed = normalizeProfile(candidate);
        if (!parsed) {
            return;
        }
        const key = parsed.profileId.toLowerCase();
        if (seen.has(key)) {
            const index = result.findIndex((profile) => profile.profileId.toLowerCase() === key);
            if (index >= 0) {
                result[index] = parsed;
            }
            return;
        }
        seen.add(key);
        result.push(parsed);
    });
    return result;
}

function normalizeProfile(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const data = raw;

    const profileId = readString(data.profileId ?? data.id);
    if (!profileId) {
        return null;
    }
    const scope = readScope(data.sceneScope ?? data.scope);
    if (!scope) {
        return null;
    }

    const name = readString(data.name) ?? profileId;
    const selectedSceneIds = readStringArray(data.selectedSceneIds);
    const commandFilters = readStringArray(data.commandFilters);
    const maxDurationMs = readOptionalNumber(data.maxDurationMs, { allowNull: true, min: 1 });
    const maxSteps = readOptionalNumber(data.maxSteps, { min: 1 });
    const allowSceneRevisit = typeof data.allowSceneRevisit === 'boolean' ? data.allowSceneRevisit : undefined;
    const maxSceneVisits = readOptionalNumber(data.maxSceneVisits, { min: 1 });
    const createdAt = readTimestamp(data.createdAt);
    const updatedAt = readTimestamp(data.updatedAt) ?? createdAt ?? new Date().toISOString();

    return {
        profileId,
        name,
        sceneScope: scope,
        selectedSceneIds,
        commandFilters,
        maxDurationMs: maxDurationMs === undefined ? null : maxDurationMs,
        ...(typeof maxSteps === 'number' ? { maxSteps } : {}),
        ...(allowSceneRevisit !== undefined ? { allowSceneRevisit } : {}),
        ...(typeof maxSceneVisits === 'number' ? { maxSceneVisits } : {}),
        createdAt: createdAt ?? updatedAt,
        updatedAt,
    };
}

function readString(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

function readScope(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toLowerCase();
    return VALID_SCOPES.has(normalized) ? normalized : null;
}

function readStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    const seen = new Set();
    const result = [];
    value.forEach((item) => {
        if (typeof item !== 'string') {
            return;
        }
        const normalized = item.trim();
        if (!normalized || seen.has(normalized)) {
            return;
        }
        seen.add(normalized);
        result.push(normalized);
    });
    return result;
}

function readOptionalNumber(value, options = {}) {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return options.allowNull ? null : undefined;
    }
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return undefined;
    }
    if (typeof options.min === 'number' && value < options.min) {
        return undefined;
    }
    return value;
}

function readTimestamp(value) {
    const str = readString(value);
    if (!str) {
        return null;
    }
    const date = new Date(str);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default loadValidationProfiles;
