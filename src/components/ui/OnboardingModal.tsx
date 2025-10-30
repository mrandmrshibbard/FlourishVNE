import React, { useState, useEffect } from 'react';
import Button from './Button';

interface OnboardingStep {
    title: string;
    content: string;
    target?: string; // CSS selector for highlighting
    action?: string; // What the user should do
}

const onboardingSteps: OnboardingStep[] = [
    {
        title: "Welcome to Flourish!",
        content: "Welcome to Flourish Visual Novel Engine! This quick tour will help you get started with creating your first visual novel.",
        action: "Click Next to continue"
    },
    {
        title: "Navigation Tabs",
        content: "Use these tabs to switch between different aspects of your project: Scenes (story), Characters, UI (menus), Assets (images/audio), Variables, and Settings.",
        target: "[data-onboarding='tabs']",
        action: "Try clicking on the Scenes tab"
    },
    {
        title: "Creating Scenes",
        content: "Scenes contain your story's dialogue and commands. Click 'Add Scene' to create your first scene, then double-click to edit the scene name.",
        target: "[data-onboarding='add-scene']",
        action: "Add a new scene to get started"
    },
    {
        title: "Scene Editor",
        content: "The scene editor shows your commands as a list. Click the + button to add dialogue, character appearances, backgrounds, and more.",
        target: "[data-onboarding='scene-editor']",
        action: "Try adding a dialogue command"
    },
    {
        title: "Assets & Characters",
        content: "Switch to the Characters tab to create characters with layered sprites. Use the Assets tab to upload images, audio, and videos.",
        target: "[data-onboarding='assets-tab']",
        action: "Upload some character images or backgrounds"
    },
    {
        title: "Live Preview",
        content: "Click the 'Play' button anytime to see your game in action. Make changes and hit play again to test them. For a more detailed preview, use the Staging Area to see how scenes flow together.",
        target: "[data-onboarding='play-button']",
        action: "Try playing your project"
    },
    {
        title: "Save Your Work",
        content: "Remember to save your project regularly using the 'Save' button. Your work is stored in your browser until you do so.",
        target: "[data-onboarding='save-button']",
        action: "Save your project now"
    }
];

interface OnboardingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onComplete: () => void;
}

const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onClose, onComplete }) => {
    const [currentStep, setCurrentStep] = useState(0);

    useEffect(() => {
        if (isOpen) {
            setCurrentStep(0);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const step = onboardingSteps[currentStep];
    const isLastStep = currentStep === onboardingSteps.length - 1;

    const handleNext = () => {
        if (isLastStep) {
            onComplete();
            onClose();
        } else {
            setCurrentStep(currentStep + 1);
        }
    };

    const handleSkip = () => {
        onComplete();
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-[var(--bg-secondary)] p-6 rounded-lg max-w-lg w-full mx-4">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-[var(--accent-cyan)] rounded-full flex items-center justify-center text-white font-bold">
                            {currentStep + 1}
                        </div>
                        <h2 className="text-xl font-bold text-[var(--text-primary)]">
                            {step.title}
                        </h2>
                    </div>
                    <button
                        onClick={handleSkip}
                        className="text-slate-400 hover:text-white transition-colors"
                        title="Skip tutorial"
                    >
                        ✕
                    </button>
                </div>

                <p className="text-[var(--text-secondary)] mb-6 leading-relaxed">
                    {step.content}
                </p>

                {step.action && (
                    <div className="bg-[var(--bg-tertiary)] p-3 rounded-md mb-6">
                        <p className="text-sm text-[var(--accent-cyan)] font-medium">
                            💡 {step.action}
                        </p>
                    </div>
                )}

                <div className="flex justify-between items-center">
                    <div className="text-sm text-slate-400">
                        Step {currentStep + 1} of {onboardingSteps.length}
                    </div>
                    <div className="flex gap-3">
                        <Button
                            onClick={handleSkip}
                            variant="ghost"
                            size="sm"
                        >
                            Skip Tutorial
                        </Button>
                        <Button
                            onClick={handleNext}
                            variant="primary"
                            size="sm"
                        >
                            {isLastStep ? 'Get Started!' : 'Next'}
                        </Button>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="mt-4 w-full bg-slate-700 rounded-full h-2">
                    <div
                        className="bg-[var(--accent-cyan)] h-2 rounded-full transition-all duration-300"
                        style={{ width: `${((currentStep + 1) / onboardingSteps.length) * 100}%` }}
                    />
                </div>
            </div>
        </div>
    );
};

export default OnboardingModal;