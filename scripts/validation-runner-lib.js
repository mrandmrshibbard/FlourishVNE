import fs from 'fs/promises';
import path from 'path';
import { loadValidationProfiles, resolveProfileById } from './validation-profile-loader.js';
import { buildValidationReport, createReportFileName } from './report-utils.js';

const KNOWN_FLAGS = new Set(['--project', '--profile', '--report']);
const EXIT_CODE_PASS = 0;
const EXIT_CODE_FAIL = 1;
const EXIT_CODE_PARTIAL = 2;

export function parseArgs(argv) {
    const options = {
        project: undefined,
        profile: undefined,
        report: undefined,
        help: false,
    };
    const errors = [];
    const positionals = [];

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === '--help' || token === '-h') {
            options.help = true;
            continue;
        }

        if (token.startsWith('--')) {
            const [flag, inlineValue] = token.split('=', 2);

            if (!KNOWN_FLAGS.has(flag)) {
                errors.push(`Unknown flag: ${flag}`);
                continue;
            }

            if (optionsFlagAlreadySet(options, flag)) {
                errors.push(`Flag ${flag} specified multiple times.`);
                continue;
            }

            let value = inlineValue;
            if (!value) {
                const next = argv[index + 1];
                if (!next || next.startsWith('--')) {
                    errors.push(`Flag ${flag} requires a value.`);
                    continue;
                }
                value = next;
                index += 1;
            }

            switch (flag) {
                case '--project':
                    options.project = value;
                    break;
                case '--profile':
                    options.profile = value;
                    break;
                case '--report':
                    options.report = value;
                    break;
                default:
                    break;
            }
            continue;
        }

        positionals.push(token);
    }

    if (positionals.length > 0) {
        errors.push(`Unexpected positional arguments: ${positionals.join(', ')}`);
    }

    return { options, errors, positionals };
}

function optionsFlagAlreadySet(options, flag) {
    if (flag === '--project') {
        return typeof options.project === 'string';
    }
    if (flag === '--profile') {
        return typeof options.profile === 'string';
    }
    if (flag === '--report') {
        return typeof options.report === 'string';
    }
    return false;
}

export async function runCli(argv, deps = createDefaultDeps()) {
    const { options, errors } = parseArgs(argv);

    if (options.help) {
        deps.stdout(renderUsage());
        return EXIT_CODE_PASS;
    }

    if (errors.length > 0) {
        errors.forEach((message) => deps.stderr(`Error: ${message}`));
        deps.stderr('Use --help to view usage information.');
        return EXIT_CODE_FAIL;
    }

    if (!options.project) {
        deps.stderr('Error: --project <path> is required.');
        deps.stderr('Use --help to view usage information.');
        return EXIT_CODE_FAIL;
    }

    const projectPath = deps.resolve(options.project);
    const profileId = options.profile ?? null;
    const reportPath = options.report ? deps.resolve(options.report) : null;
    let profile = null;

    try {
        const exists = await deps.pathExists(projectPath);
        if (!exists) {
            deps.stderr(`Error: Project file not found at ${projectPath}`);
            return EXIT_CODE_FAIL;
        }

        if (profileId) {
            try {
                const config = await deps.loadProfiles();
                config.warnings?.forEach((message) => deps.stderr(`Warning: ${message}`));
                profile = resolveProfileById(config.profiles, profileId);
                if (!profile) {
                    deps.stderr(`Error: Validation profile "${profileId}" not found.`);
                    if (config.profiles.length > 0) {
                        const available = config.profiles.map((entry) => entry.profileId).join(', ');
                        deps.stderr(`Available profiles: ${available}`);
                    }
                    return EXIT_CODE_FAIL;
                }
                if (config.sourcePath) {
                    deps.stdout(`Profiles sourced from: ${config.sourcePath}`);
                }
            } catch (error) {
                deps.stderr(`Error: Failed to load validation profiles: ${error instanceof Error ? error.message : String(error)}`);
                return EXIT_CODE_FAIL;
            }
        }

        deps.stdout('Flourish Validation Runner');
        deps.stdout('────────────────────────────');
        deps.stdout(`Project: ${projectPath}`);
        if (profile) {
            deps.stdout(`Profile: ${profile.profileId} (${profile.name})`);
        }
        if (reportPath) {
            deps.stdout(`Report:  ${reportPath}`);
        }

        const result = await deps.runValidation(
            {
                projectPath,
                profileId,
                profile,
                reportPath,
            },
            deps
        );

        const status = normalizeStatus(result?.status);
        deps.stdout('');
        deps.stdout(`Status: ${status.toUpperCase()}`);
        if (result?.summary) {
            deps.stdout(result.summary);
        }
        if (result?.reportPath) {
            deps.stdout(`Report written to ${result.reportPath}`);
        }

        if (status === 'pass') {
            return EXIT_CODE_PASS;
        }
        if (status === 'partial') {
            return EXIT_CODE_PARTIAL;
        }
        return EXIT_CODE_FAIL;
    } catch (error) {
        deps.stderr('');
        deps.stderr('Validation runner failed:');
        deps.stderr(error instanceof Error ? error.message : String(error));
        return EXIT_CODE_FAIL;
    }
}

export function renderUsage() {
    return `Usage: node scripts/validation-runner.js --project <file> [--profile <id>] [--report <file>]

Options:
  --project <file>   Path to project JSON file (required)
  --profile <id>     Validation profile identifier to use
  --report <file>    Path to write validation report JSON
  -h, --help         Show this help message`;
}

function normalizeStatus(status) {
    if (typeof status !== 'string') {
        return 'fail';
    }
    const normalized = status.toLowerCase();
    if (normalized === 'pass' || normalized === 'fail' || normalized === 'partial') {
        return normalized;
    }
    return 'fail';
}

export function createDefaultDeps() {
    async function pathExists(targetPath) {
        try {
            await fs.access(targetPath);
            return true;
        } catch (error) {
            return false;
        }
    }

    async function ensureDir(dirPath) {
        await fs.mkdir(dirPath, { recursive: true });
    }

    async function defaultRunValidation(options) {
        const { projectPath, profileId, profile, reportPath } = options;
        const rawProject = await fs.readFile(projectPath, 'utf-8');
        let project;
        try {
            project = JSON.parse(rawProject);
        } catch (error) {
            throw new Error(`Unable to parse project JSON at ${projectPath}: ${error instanceof Error ? error.message : String(error)}`);
        }
        const metrics = {
            totalScenes: project && project.scenes ? Object.keys(project.scenes).length : 0,
            visitedScenes: 0,
            visitedCommands: 0,
            durationMs: 0,
            startSceneId: project && typeof project.startSceneId === 'string' ? project.startSceneId : '',
        };

        const result = {
            status: 'pass',
            summary: `Validation completed for project ${project?.title ?? project?.name ?? path.basename(projectPath)}`,
            issues: [],
            scenes: [],
            metrics,
        };

        const report = buildValidationReport({
            project,
            profile: profile ?? null,
            result,
            meta: {
                projectId: project?.id ?? null,
                projectName: project?.title ?? project?.name ?? null,
                profileId: profileId ?? profile?.profileId ?? null,
                profileName: profile?.name ?? null,
                profileScope: profile?.sceneScope ?? null,
            },
        });

        let targetPath = reportPath;
        if (!targetPath) {
            const fileName = createReportFileName({
                projectId: report.projectId ?? 'project',
                runTimestamp: report.runTimestamp,
            });
            targetPath = path.join(path.dirname(projectPath), 'reports', fileName);
        }

        await ensureDir(path.dirname(targetPath));
        await fs.writeFile(targetPath, JSON.stringify(report, null, 2), 'utf-8');

        return {
            ...report,
            reportPath: targetPath,
        };
    }

    return {
        stdout: (message) => console.log(message),
        stderr: (message) => console.error(message),
        resolve: (...segments) => path.resolve(...segments),
        pathExists,
        runValidation: defaultRunValidation,
        loadProfiles: () => loadValidationProfiles(),
        ensureDir,
        now: () => new Date(),
    };
}
