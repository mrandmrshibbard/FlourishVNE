<!--
  Sync Impact Report - Constitution Update
  =========================================
  Version Change: 1.0.0 → 1.1.0
  Date: 2025-11-03
  
  Changes:
  - MINOR UPDATE: Enhanced testing discipline guidance in Quality Standards
  - Added explicit rule against test manipulation to force passing results
  - Clarified requirement for root-cause fixes over symptomatic workarounds
  
  Modified Principles: N/A
  Added Sections:
    - Quality Standards > Testing Discipline (new subsection)
  
  Removed Sections: N/A
  
  Templates Status:
  - ✅ plan-template.md: No changes required - constitution checks remain valid
  - ✅ spec-template.md: No changes required - acceptance criteria format unchanged
  - ✅ tasks-template.md: No changes required - test task structure compatible
  
  Follow-up TODOs: None - amendment maintains backward compatibility
  
  Previous Update: 1.0.0 (2025-11-02)
  - INITIAL RATIFICATION: Established 7 core principles, quality standards, development workflow, and governance
-->

# Flourish Visual Novel Engine Constitution

## Core Principles

### I. Feature Completeness & Reliability (NON-NEGOTIABLE)

Every feature MUST be fully functional and reliable for commercial use. Features are not "done" until they work correctly under normal and edge-case conditions. Partial implementations, known bugs affecting core functionality, and unreliable behavior are forbidden in production code.

**Rationale**: The engine is a creative tool for commercial visual novel development. Broken features damage user trust, corrupt projects, and prevent creators from shipping finished products. Commercial viability depends on reliability.

**Rules**:
- All features MUST handle edge cases (empty data, missing assets, invalid input)
- Variable persistence across screens and scenes MUST be reliable
- Save/load system MUST preserve complete game state
- Asset management MUST handle all supported formats without corruption
- UI interactions MUST provide immediate feedback and prevent invalid states

### II. Backward Compatibility

Breaking changes to project file formats, saved games, or exported games are prohibited except during MAJOR version releases. When breaking changes are necessary, migration tools MUST be provided, and changes MUST be documented with upgrade paths.

**Rationale**: Users invest significant time creating visual novels. Breaking their projects destroys trust and makes the tool unsuitable for serious development work.

**Rules**:
- Project JSON schemas MUST maintain backward compatibility within major versions
- New features MUST work with existing project files (graceful defaults)
- Save file format changes require migration utilities
- API changes follow semantic versioning strictly (MAJOR.MINOR.PATCH)

### III. Component Modularity

Components exceeding 500 lines MUST be refactored into focused, reusable modules. Each module MUST have a single clear responsibility and well-defined boundaries. Complex components MUST be broken into hooks, sub-components, utilities, and type definitions.

**Rationale**: Large monolithic components are unmaintainable, difficult to test, and prone to bugs. Modular architecture enables parallel development, easier debugging, and confident refactoring.

**Rules**:
- Components > 500 lines trigger refactoring requirement
- Extract business logic into custom hooks (e.g., `useGameEngine`, `useAudioManager`)
- Extract rendering logic into sub-components (e.g., renderers/, inspectors/)
- Extract utilities into pure functions (e.g., systems/, utils/)
- Shared types live in dedicated type definition files
- Reference: `REFACTORING_PLAN.md` for approved patterns

### IV. State Management Discipline

Application state MUST be managed predictably with clear ownership. React Context for cross-cutting concerns, local state for component-specific data, refs for non-reactive values. State mutations MUST be explicit and traceable. Race conditions and stale closures are forbidden.

**Rationale**: Visual novel engines manage complex state (game progression, variables, asset loading, UI stacks). Poor state management causes bugs like variables not persisting, UI desync, and data loss.

**Rules**:
- Use `flushSync()` when state updates MUST complete before subsequent actions
- Variable updates MUST be synchronous when followed by navigation/jumps
- Menu variables and player variables MUST stay synchronized during transitions
- State setters MUST use functional updates when depending on previous state
- Refs for audio, timeouts, and non-rendering data only

### V. Asset Pipeline Integrity

All asset types (images, audio, video, fonts) MUST be validated on import, stored reliably, and resolved correctly at runtime. Asset URLs MUST be normalized to handle browser differences. Missing assets MUST degrade gracefully without crashing.

**Rationale**: Visual novels are asset-heavy. Broken asset handling corrupts projects, prevents export, and causes runtime failures in shipped games.

**Rules**:
- Validate file types and formats on upload (MIME types, file extensions)
- Store assets as data URLs or properly managed file references
- Asset resolution MUST handle both editor and standalone modes
- Missing assets MUST show placeholders or warnings, never crash
- Character layer system MUST validate sprite assignments before rendering

### VI. Export & Standalone Integrity

Exported games MUST be fully self-contained HTML files that work offline without external dependencies. The standalone engine bundle MUST replicate all editor preview functionality. Exported games MUST NOT require server infrastructure, build tools, or runtime environments.

**Rationale**: The core value proposition is one-click export to distributable games. Broken exports make the tool worthless for shipping finished products.

**Rules**:
- Game engine bundle (`gameEngineBundle.ts`) MUST be kept in sync with `LivePreview.tsx`
- All assets MUST be embedded as data URLs in exported HTML
- No external script references (CDNs, APIs) in exported games
- Variable handling MUST work identically in editor and standalone
- Build process MUST validate bundle integrity before export

### VII. Documentation & Examples

Every feature MUST have user-facing documentation with examples. Complex features MUST include quickstart guides. Error messages MUST guide users toward solutions. Code comments MUST explain "why" not "what".

**Rationale**: Visual novel creators are artists and writers, not programmers. Without clear documentation, features are unusable and support burden becomes unsustainable.

**Rules**:
- New features require corresponding documentation in `docs/` before merge
- Character system, conditionals, variables, UI builder MUST have dedicated guides
- Common issues section in README MUST address frequent problems
- Error messages MUST be actionable (e.g., "Character not showing? Check expression assignments")
- Code comments explain business logic, edge cases, and architectural decisions

### VIII. Must User Existing Setup

Any work done MUST integrate with the existing project setup, tools, and workflows. Introducing new dependencies, build steps, or runtime requirements is forbidden unless absolutely necessary and approved through governance.

**Rationale**: Users rely on a setup that is reliable and easy to use. Changing the setup creates friction, confusion, and potential abandonment of the tool.

**Rules**:
- MUST use existing build tools (Vite, TypeScript)
- No new runtime dependencies without governance approval
- MUST integrate with existing project structure, conventions, and application features
- New code MUST follow existing coding standards and patterns

## Quality Standards

### Testing Requirements

- Critical user flows MUST be tested manually before release
- Variable persistence, scene jumps, save/load MUST be verified across scenarios
- Character rendering with multiple expressions MUST be tested
- Export functionality MUST produce working standalone games
- Automated testing encouraged but not mandatory (pragmatic approach)

### Testing Discipline

**Test Integrity Rule**: When tests fail, you MUST fix the underlying code to make features work correctly. It is FORBIDDEN to:
- Alter tests to make them pass without fixing the actual problem
- Remove failing assertions to hide issues
- Mock or stub away real failures to achieve green status
- Apply workarounds that make problems disappear without addressing root causes

**Rationale**: Tests are truth-tellers about code health. Manipulating tests to pass creates false confidence, hides technical debt, and allows bugs to reach users. Features must genuinely work at full functionality before tests can legitimately pass.

**Enforcement**:
- Code reviews MUST verify that test changes correspond to legitimate requirement changes or genuine bug fixes
- Test modifications without accompanying functional fixes trigger rejection
- "Make the red test green by fixing the code" is the only acceptable workflow

### Performance Standards

- Editor UI MUST remain responsive with 100+ assets
- Game runtime MUST handle 60 FPS rendering
- Asset loading MUST show progress feedback
- Large projects (50+ scenes) MUST load within reasonable time (<10 seconds)
- Memory leaks MUST be identified and fixed (video elements, audio, timeouts)

### Error Handling

- User errors MUST show helpful messages with recovery actions
- System errors MUST log to console with context for debugging
- Asset errors MUST degrade gracefully (placeholders, warnings)
- Invalid state MUST be prevented at UI level (disabled buttons, validation)

## Development Workflow

### Branch Strategy

- `main` branch for stable releases
- Feature branches: `###-feature-name` format
- Bug fixes: `fix-description` format
- Refactoring: `refactor-component-name` format

### Code Review Requirements

- Constitution compliance MUST be verified
- Breaking changes MUST be justified and documented
- Refactoring MUST preserve functionality (test before/after behavior)
- Variable handling changes MUST be tested across UI screens and scenes

### Release Process

- Version bumps follow semantic versioning
- MAJOR: Breaking project format or API changes
- MINOR: New features, non-breaking enhancements
- PATCH: Bug fixes, refactoring, documentation
- Release notes MUST document breaking changes and migration steps

## Governance

This constitution supersedes all other development practices and coding standards. When conflicts arise between convenience and constitutional principles, principles take precedence.

**Amendment Process**:
- Proposed amendments MUST include rationale and impact analysis
- Breaking changes to principles require documentation of alternatives considered
- Constitution updates increment version number (semantic versioning applies)
- All changes MUST be documented in Sync Impact Report

**Compliance Review**:
- Pull requests MUST reference relevant principles
- Large refactorings MUST include "Constitution Check" section in plan
- Complexity additions MUST be justified with "Simpler Alternative Rejected Because" reasoning
- Documentation updates MUST accompany feature changes

**Version Control**:
- Constitution changes tracked via version number
- Sync Impact Report documents all modifications
- Templates updated to reflect principle changes
- Historical versions preserved via git history

**Runtime Guidance**:
Use `REFACTORING_PLAN.md`, `REFACTORING_PROGRESS.md`, and `REFACTORING_STATUS.md` for active refactoring guidance and tracking. See `.specify/templates/` for specification, planning, and task templates.

**Version**: 1.1.0 | **Ratified**: 2025-11-02 | **Last Amended**: 2025-11-03
