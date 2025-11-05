# Tasks: Runtime Logic Stabilization

**Input**: Design documents from `/specs/001-fix-runtime-logic/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Regression harnesses are included where required by functional requirements; no additional automated tests are mandated beyond those tasks.

**Organization**: Tasks are grouped by user story so each increment can be implemented and validated independently.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Catalogue existing runtime surfaces and prepare shared fixtures without introducing new frameworks

- [X] T001 Document current runtime entry points (`src/components/LivePreview.tsx`, `public/game-engine.js`, `scripts/generate-engine-bundle.js`) in `docs/runtime/runtime-audit.md`
- [X] T002 Copy `character-customization-sample.json` into `tests/runtime/fixtures/character-sample.json` for editor-accessible test flows
- [X] T003 [P] Create runtime test harness bootstrap in `tests/runtime/setupRuntimeHarness.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extract reusable helpers from the existing runtime before feature-specific fixes

- [X] T004 Create command scheduler helper extracted from `LivePreview` in `src/components/live-preview/runtime/commandScheduler.ts`
- [X] T005 Build runtime variable store utilities in `src/components/live-preview/runtime/runtimeVariableStore.ts`
- [X] T006 Implement diagnostics feed backbone in `src/components/live-preview/runtime/runtimeDiagnostics.ts`
- [X] T007 Refactor `src/components/live-preview/command-handlers/index.ts` to consume the shared runtime context helpers

**Checkpoint**: Runtime primitives ready – user story implementation can begin

---

## Phase 3: User Story 1 - Reliable command execution in editor playthroughs (Priority: P1) 🎯 MVP

**Goal**: Ensure editor playthroughs execute commands exactly once in order with up-to-date variable state

**Independent Test**: Run `tests/runtime/commandExecution.spec.ts` against a multi-scene sample and verify sequential command logs match script order without duplicates or skips.

### Implementation

- [ ] T008 [US1] Wire deterministic scheduler helper into `src/components/LivePreview.tsx`
- [ ] T009 [US1] Integrate runtime variable store updates before conditional evaluation in `src/components/LivePreview.tsx`
- [ ] T010 [US1] Synchronize command handlers with scheduler context in `src/components/live-preview/command-handlers/index.ts`
- [ ] T011 [US1] Ensure exported runtime mirrors scheduler logic via `scripts/generate-engine-bundle.js`
- [ ] T012 [P] [US1] Surface command order diagnostics in `src/components/live-preview/CommandStackComponents.tsx`
- [ ] T013 [US1] Create `tests/runtime/commandExecution.spec.ts` using the character customization sample scene flow available in the editor

**Parallel Opportunities (US1)**: T012 and T013 can run in parallel once T008–T010 land.

---

## Phase 4: User Story 2 - Branching logic behaves identically across platforms (Priority: P2)

**Goal**: Guarantee identical branching outcomes for identical inputs across editor preview, test play, and exported builds

**Independent Test**: Execute `tests/runtime/branchingParity.spec.ts` in editor and exported build contexts to confirm matching branch trails.

### Implementation

- [ ] T014 [US2] Consolidate branching evaluation logic between editor and export in `src/utils/gameEngineBundle.ts`
- [ ] T015 [US2] Update `public/game-engine.js` generation pipeline via `scripts/generate-engine-bundle.js` to consume shared helpers
- [ ] T016 [P] [US2] Rebuild `public/game-engine.js` and `dist-standalone/game-engine.js` with the stabilized runtime
- [ ] T017 [US2] Author `tests/runtime/branchingParity.spec.ts` validating identical branch trails using editor-accessible choice paths

**Parallel Opportunities (US2)**: T016 can proceed while T017 is authored once T014 completes.

---

## Phase 5: User Story 3 - Scenes clean up state between play sessions (Priority: P3)

**Goal**: Ensure scene transitions reset audio, timers, overlays, and scoped variables before the next scene runs

**Independent Test**: Run `tests/runtime/sceneCleanup.spec.ts` to verify timers, audio, and overlays are cleared on scene restart across editor and standalone adapters.

### Implementation

- [ ] T018 [US3] Implement scene lifecycle manager extracted from existing cleanup logic in `src/components/live-preview/runtime/sceneLifecycleManager.ts`
- [ ] T019 [US3] Hook lifecycle manager into scheduler transitions within `src/components/live-preview/runtime/commandScheduler.ts`
- [ ] T020 [P] [US3] Register audio and timer disposables through lifecycle manager inside `src/components/LivePreview.tsx`
- [ ] T021 [P] [US3] Ensure exported runtime invokes lifecycle cleanup via `src/utils/gameEngineBundle.ts`
- [ ] T022 [US3] Add `tests/runtime/sceneCleanup.spec.ts` covering restart flows using editor-driven scene navigation

**Parallel Opportunities (US3)**: Once T018 is merged, T020 and T021 can proceed in parallel.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, QA evidence, and follow-up improvements that span stories

- [ ] T023 Update runtime workflow guidance in `docs/Quick-start-guide.txt`
- [ ] T024 [P] Document diagnostics usage for QA in `docs/runtime/diagnostics.md`
- [ ] T025 Capture parity QA results and notes in `specs/001-fix-runtime-logic/output_logs.md`

---

## Dependencies & Execution Order

- **Phase Order**: Phase 1 → Phase 2 → (Phases 3–5 in priority order) → Phase 6
- **Story Dependencies**: US1 depends on foundational runtime primitives; US2 depends on US1 scheduler artifacts; US3 depends on lifecycle hooks introduced in US1 and parity checks from US2 for validation contexts.
- **Task Dependencies**: Within each story, scheduler and store tasks precede adapters and UI wiring; regression harness tasks assume implementation tasks are complete.

## Parallel Execution Examples

- **US1**: After T008–T010, run T012 (UI diagnostics integration) and T013 (harness) concurrently.
- **US2**: While T016 rebuilds exported bundles, author T017 parity harness in parallel.
- **US3**: Following T018, divide T020 and T021 between team members to integrate lifecycle manager in both editor and standalone adapters simultaneously.

## Implementation Strategy

1. Complete Phases 1 and 2 to unblock all runtime work.
2. Deliver MVP by finishing Phase 3 (US1) and validating deterministic execution via the new harness.
3. Extend parity to exported builds (Phase 4) before tackling cleanup behaviors.
4. Finalize cleanup reliability (Phase 5), then wrap with documentation and QA evidence (Phase 6).
5. Each user story remains independently testable, enabling staged releases if needed.
