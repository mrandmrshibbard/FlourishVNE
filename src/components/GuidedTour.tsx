import React, { useState, useEffect, useCallback } from 'react';

interface GuidedTourProps {
    isActive: boolean;
    onComplete: () => void;
}

interface TourStep {
    title: string;
    description: string;
    position: {
        top?: string;
        bottom?: string;
        left?: string;
        right?: string;
    };
    arrowDirection?: 'left' | 'right' | 'up' | 'down' | 'none';
}

const TOUR_STEPS: TourStep[] = [
    {
        title: 'Scene Editor',
        description: 'This is your scene editor. Build your story by adding dialogue, choices, and effects to each scene.',
        position: { top: '35%', left: '22%' },
        arrowDirection: 'left',
    },
    {
        title: 'Live Preview',
        description: 'See your visual novel in real-time as you build it. Changes appear instantly!',
        position: { top: '35%', left: '50%' },
        arrowDirection: 'none',
    },
    {
        title: 'Characters & Assets',
        description: 'Manage your characters, backgrounds, music, and images in the asset panels.',
        position: { top: '35%', right: '5%' },
        arrowDirection: 'right',
    },
    {
        title: 'Command Palette',
        description: 'Add dialogue, choices, branching paths, sound effects, and 30+ other commands to your scenes.',
        position: { top: '18%', left: '10%' },
        arrowDirection: 'up',
    },
    {
        title: 'Game Settings',
        description: "Configure your game's resolution, title, author info, and starting scene.",
        position: { top: '12%', left: '50%' },
        arrowDirection: 'up',
    },
    {
        title: 'Build & Export',
        description: "When you're ready, build your game as a standalone web page or desktop app - no coding needed!",
        position: { top: '12%', right: '5%' },
        arrowDirection: 'up',
    },
    {
        title: "You're Ready!",
        description: "That's the basics! Explore the editor, experiment freely, and create something amazing.",
        position: { top: '50%', left: '50%' },
        arrowDirection: 'none',
    },
];

const STORAGE_KEY = 'flourish:tourCompleted';

const GuidedTour: React.FC<GuidedTourProps> = ({ isActive, onComplete }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [isVisible, setIsVisible] = useState(false);
    const [isFading, setIsFading] = useState(false);

    useEffect(() => {
        if (isActive) {
            setCurrentStep(0);
            requestAnimationFrame(() => setIsVisible(true));
        } else {
            setIsVisible(false);
        }
    }, [isActive]);

    const completeTour = useCallback(() => {
        setIsFading(true);
        try {
            localStorage.setItem(STORAGE_KEY, 'true');
        } catch {}
        setTimeout(() => {
            setIsVisible(false);
            setIsFading(false);
            onComplete();
        }, 300);
    }, [onComplete]);

    const handleNext = useCallback(() => {
        if (currentStep < TOUR_STEPS.length - 1) {
            setIsFading(true);
            setTimeout(() => {
                setCurrentStep(prev => prev + 1);
                setIsFading(false);
            }, 200);
        } else {
            completeTour();
        }
    }, [currentStep, completeTour]);

    const handleSkip = useCallback(() => {
        completeTour();
    }, [completeTour]);

    if (!isActive || !isVisible) return null;

    const step = TOUR_STEPS[currentStep];
    const isLastStep = currentStep === TOUR_STEPS.length - 1;
    const isCentered = currentStep === TOUR_STEPS.length - 1;

    const tooltipPositionStyle: React.CSSProperties = isCentered
        ? { top: step.position.top, left: step.position.left, transform: 'translate(-50%, -50%)' }
        : {
            ...step.position,
            transform: step.position.left === '50%' ? 'translateX(-50%)' : undefined,
        };

    const arrowStyle = (): React.CSSProperties | null => {
        const base: React.CSSProperties = {
            position: 'absolute',
            width: 0,
            height: 0,
        };
        switch (step.arrowDirection) {
            case 'left':
                return {
                    ...base,
                    left: -10,
                    top: '50%',
                    marginTop: -8,
                    borderTop: '8px solid transparent',
                    borderBottom: '8px solid transparent',
                    borderRight: '10px solid var(--bg-secondary, #1e1b2e)',
                };
            case 'right':
                return {
                    ...base,
                    right: -10,
                    top: '50%',
                    marginTop: -8,
                    borderTop: '8px solid transparent',
                    borderBottom: '8px solid transparent',
                    borderLeft: '10px solid var(--bg-secondary, #1e1b2e)',
                };
            case 'up':
                return {
                    ...base,
                    top: -10,
                    left: '50%',
                    marginLeft: -8,
                    borderLeft: '8px solid transparent',
                    borderRight: '8px solid transparent',
                    borderBottom: '10px solid var(--bg-secondary, #1e1b2e)',
                };
            case 'down':
                return {
                    ...base,
                    bottom: -10,
                    left: '50%',
                    marginLeft: -8,
                    borderLeft: '8px solid transparent',
                    borderRight: '8px solid transparent',
                    borderTop: '10px solid var(--bg-secondary, #1e1b2e)',
                };
            default:
                return null;
        }
    };

    const arrow = arrowStyle();

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                backgroundColor: 'rgba(0,0,0,0.6)',
                transition: 'opacity 0.3s ease',
                opacity: isFading ? 0 : 1,
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    ...tooltipPositionStyle,
                    maxWidth: 380,
                    minWidth: 300,
                    background: 'var(--bg-secondary, #1e1b2e)',
                    border: '1px solid var(--accent-pink, #ff7eb3)',
                    borderRadius: 12,
                    padding: '24px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 20px rgba(255,126,179,0.15)',
                    transition: 'opacity 0.2s ease, transform 0.2s ease',
                    opacity: isFading ? 0 : 1,
                    transform: isFading
                        ? (isCentered ? 'translate(-50%, -50%) scale(0.95)' : 'scale(0.95)')
                        : (isCentered ? 'translate(-50%, -50%) scale(1)' : 'scale(1)'),
                }}
            >
                {arrow && <div style={arrow} />}

                <div
                    style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--accent-cyan, #7effff)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        marginBottom: 8,
                    }}
                >
                    Step {currentStep + 1} of {TOUR_STEPS.length}
                </div>

                <h3
                    style={{
                        margin: '0 0 8px 0',
                        fontSize: 20,
                        fontWeight: 700,
                        color: 'var(--text-primary, #f1f5f9)',
                        background: 'linear-gradient(135deg, var(--accent-pink, #ff7eb3), var(--accent-cyan, #7effff))',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                    }}
                >
                    {step.title}
                </h3>

                <p
                    style={{
                        margin: '0 0 20px 0',
                        fontSize: 14,
                        lineHeight: 1.6,
                        color: 'var(--text-secondary, #94a3b8)',
                    }}
                >
                    {step.description}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <button
                        onClick={handleSkip}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-secondary, #94a3b8)',
                            fontSize: 13,
                            cursor: 'pointer',
                            padding: '6px 12px',
                            borderRadius: 6,
                            transition: 'color 0.2s, background 0.2s',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.color = 'var(--text-primary, #f1f5f9)';
                            e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.color = 'var(--text-secondary, #94a3b8)';
                            e.currentTarget.style.background = 'none';
                        }}
                    >
                        Skip Tour
                    </button>

                    <button
                        onClick={handleNext}
                        style={{
                            background: 'linear-gradient(135deg, var(--accent-pink, #ff7eb3), var(--accent-cyan, #7effff))',
                            border: 'none',
                            color: '#0a0612',
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: 'pointer',
                            padding: '8px 24px',
                            borderRadius: 8,
                            transition: 'transform 0.15s, box-shadow 0.15s',
                            boxShadow: '0 2px 12px rgba(255,126,179,0.3)',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.transform = 'scale(1.05)';
                            e.currentTarget.style.boxShadow = '0 4px 20px rgba(255,126,179,0.5)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.boxShadow = '0 2px 12px rgba(255,126,179,0.3)';
                        }}
                    >
                        {isLastStep ? 'Get Started!' : 'Next'}
                    </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
                    {TOUR_STEPS.map((_, i) => (
                        <div
                            key={i}
                            style={{
                                width: i === currentStep ? 20 : 8,
                                height: 8,
                                borderRadius: 4,
                                background: i === currentStep
                                    ? 'linear-gradient(135deg, var(--accent-pink, #ff7eb3), var(--accent-cyan, #7effff))'
                                    : 'rgba(255,255,255,0.15)',
                                transition: 'all 0.3s ease',
                            }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default GuidedTour;
