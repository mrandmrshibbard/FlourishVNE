# Content Wizard Service Contract

**Service**: Guided Content Creation System  
**Version**: 1.0.0  
**Protocol**: Internal TypeScript interfaces (client-side only)

## Interface: ContentWizardService

### getAvailableWizards()

**Purpose**: Retrieve list of available content creation wizards

**Input**:
```typescript
interface GetAvailableWizardsRequest {
  contentType?: 'scene' | 'character' | 'choice' | 'custom';
  userExperience: 'beginner' | 'intermediate' | 'advanced';
  projectContext?: {
    existingScenes: number;
    existingCharacters: number;
    templateUsed?: string;
  };
}
```

**Output**:
```typescript
interface GetAvailableWizardsResponse {
  wizards: ContentWizard[];
  recommendedWizards: string[];
  estimatedTime: Record<string, number>; // minutes
  prerequisites: Record<string, string[]>;
}
```

**Behavior**:
- Lists wizards appropriate for user experience level
- Recommends wizards based on project context
- Provides time estimates for completion
- Identifies any missing prerequisites

---

### startWizard()

**Purpose**: Initialize and begin guided content creation process

**Input**:
```typescript
interface StartWizardRequest {
  wizardId: string;
  targetContentType: ContentType;
  initialData?: Record<string, any>;
  options?: {
    skipIntro?: boolean;
    customizeSteps?: boolean;
    saveProgress?: boolean;
  };
}
```

**Output**:
```typescript
interface StartWizardResponse {
  sessionId: string;
  currentStep: WizardStep;
  totalSteps: number;
  estimatedTimeRemaining: number;
  canSkipSteps: boolean;
  progressSaveInterval: number; // seconds
}
```

**Behavior**:
- Creates new wizard session
- Loads first step with appropriate inputs
- Sets up progress tracking
- Configures step navigation options

---

### processWizardStep()

**Purpose**: Handle user input and advance to next step

**Input**:
```typescript
interface ProcessWizardStepRequest {
  sessionId: string;
  stepResponse: StepResponse;
  navigationAction: 'next' | 'back' | 'skip' | 'jump';
  targetStepIndex?: number;
  saveProgress?: boolean;
}
```

**Output**:
```typescript
interface ProcessWizardStepResponse {
  validationResult: ValidationResult;
  nextStep?: WizardStep;
  isComplete: boolean;
  generatedContent?: ContentPreview;
  canGoBack: boolean;
  warnings: string[];
}
```

**Behavior**:
- Validates current step input
- Generates preview if applicable
- Advances to next step or completes wizard
- Maintains step history for navigation

---

### generateWizardPreview()

**Purpose**: Show real-time preview of content being created

**Input**:
```typescript
interface GenerateWizardPreviewRequest {
  sessionId: string;
  includePartialData?: boolean;
  previewFormat: 'visual' | 'code' | 'both';
  highlightChanges?: boolean;
}
```

**Output**:
```typescript
interface GenerateWizardPreviewResponse {
  visualPreview?: VisualPreview;
  codePreview?: string;
  previewValid: boolean;
  changedElements: string[];
  estimatedFinalSize: number; // bytes
  performance: PerformanceEstimate;
}
```

**Behavior**:
- Generates real-time content preview
- Shows both visual and code representations
- Highlights recent changes
- Provides performance estimates

---

### completeWizard()

**Purpose**: Finalize wizard session and create actual content

**Input**:
```typescript
interface CompleteWizardRequest {
  sessionId: string;
  finalizeOptions: {
    addToProject: boolean;
    openInEditor?: boolean;
    generateBackup?: boolean;
    applyOptimizations?: boolean;
  };
  customizations?: Record<string, any>;
}
```

**Output**:
```typescript
interface CompleteWizardResponse {
  createdContent: VNContent;
  contentId: string;
  backupLocation?: string;
  optimizationsApplied: string[];
  nextSteps: string[];
  relatedWizards: string[];
}
```

**Behavior**:
- Creates final content from wizard data
- Integrates with existing project
- Applies optimizations if requested
- Suggests next steps or related wizards

---

### saveWizardProgress()

**Purpose**: Save current wizard state for later continuation

**Input**:
```typescript
interface SaveWizardProgressRequest {
  sessionId: string;
  savePoint: 'auto' | 'manual' | 'step-complete';
  includePreview?: boolean;
  expirationTime?: Date;
}
```

**Output**:
```typescript
interface SaveWizardProgressResponse {
  saved: boolean;
  saveId: string;
  expiresAt: Date;
  resumeUrl: string;
  saveSize: number; // bytes
  canShare: boolean;
}
```

**Behavior**:
- Persists current wizard state
- Creates resumable session link
- Sets expiration for saved data
- Enables progress sharing if appropriate

---

### loadWizardProgress()

**Purpose**: Resume previously saved wizard session

**Input**:
```typescript
interface LoadWizardProgressRequest {
  saveId: string;
  validateExpiration?: boolean;
  mergeWithCurrent?: boolean;
}
```

**Output**:
```typescript
interface LoadWizardProgressResponse {
  sessionId: string;
  resumedStep: WizardStep;
  stepsCompleted: number;
  dataIntegrity: 'valid' | 'partial' | 'corrupted';
  mergConflicts?: string[];
  timeElapsed: number; // minutes since save
}
```

**Behavior**:
- Restores saved wizard session
- Validates data integrity
- Handles expiration and conflicts
- Resumes at appropriate step

## Error Handling

```typescript
interface WizardError {
  code: string;
  message: string;
  stepIndex?: number;
  fieldName?: string;
  severity: 'blocking' | 'warning' | 'info';
  suggestedAction: string;
  canRetry: boolean;
}

// Error codes:
// INVALID_INPUT, STEP_VALIDATION_FAILED, SESSION_EXPIRED,
// CONTENT_GENERATION_FAILED, SAVE_FAILED, LOAD_FAILED
```