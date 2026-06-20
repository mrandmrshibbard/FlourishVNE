import React, { useState, useMemo, useCallback } from 'react';
import { RangeInput, ColorInput } from './ui/Form';
import { useTranslation } from 'react-i18next';
import { ContentWizardService } from '../features/content-wizards/ContentWizardService';
import { ContentWizard, WizardStep, StepInputField } from '../types/wizard';

interface ContentWizardModalProps {
    isOpen: boolean;
    onClose: () => void;
    onComplete: (result: any) => void;
}

const wizardService = new ContentWizardService({ enableAutoSave: false });

const ContentWizardModal: React.FC<ContentWizardModalProps> = ({ isOpen, onClose, onComplete }) => {
    const { t } = useTranslation('contentTools');
    const [selectedWizard, setSelectedWizard] = useState<ContentWizard | null>(null);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});

    const availableWizards = useMemo(() => wizardService.getAvailableWizards(), []);

    const currentStep: WizardStep | null = selectedWizard ? selectedWizard.steps[currentStepIndex] ?? null : null;
    const totalSteps = selectedWizard ? selectedWizard.steps.length : 0;
    const isLastStep = currentStepIndex === totalSteps - 1;

    const handleReset = useCallback(() => {
        setSelectedWizard(null);
        setCurrentStepIndex(0);
        setFormData({});
        setErrors({});
    }, []);

    const handleClose = useCallback(() => {
        handleReset();
        onClose();
    }, [handleReset, onClose]);

    const handleSelectWizard = useCallback((wizard: ContentWizard) => {
        setSelectedWizard(wizard);
        setCurrentStepIndex(0);
        setFormData({});
        setErrors({});
    }, []);

    const handleFieldChange = useCallback((fieldId: string, value: any) => {
        setFormData(prev => ({ ...prev, [fieldId]: value }));
        setErrors(prev => {
            const next = { ...prev };
            delete next[fieldId];
            return next;
        });
    }, []);

    const validateCurrentStep = useCallback((): boolean => {
        if (!currentStep) return false;
        const newErrors: Record<string, string> = {};

        for (const field of currentStep.fields) {
            if (field.conditional) {
                const condValue = formData[field.conditional.fieldId];
                if (field.conditional.operator === '==' && condValue !== field.conditional.value) continue;
                if (field.conditional.operator === '!=' && condValue === field.conditional.value) continue;
            }

            const value = formData[field.id];

            if (field.required && (value === undefined || value === null || value === '')) {
                newErrors[field.id] = t('contentWizard.fieldRequired', { label: field.label });
                continue;
            }

            if (field.validation && value !== undefined && value !== null && value !== '') {
                for (const rule of field.validation) {
                    if (rule.type === 'min-length' && typeof value === 'string' && value.length < (rule.value as number)) {
                        newErrors[field.id] = rule.message;
                    }
                    if (rule.type === 'max-length' && typeof value === 'string' && value.length > (rule.value as number)) {
                        newErrors[field.id] = rule.message;
                    }
                }
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }, [currentStep, formData, t]);

    const handleNext = useCallback(() => {
        if (!validateCurrentStep()) return;
        if (isLastStep) {
            onComplete({ wizard: selectedWizard, data: formData });
            handleReset();
            onClose();
        } else {
            setCurrentStepIndex(prev => prev + 1);
        }
    }, [validateCurrentStep, isLastStep, selectedWizard, formData, onComplete, handleReset, onClose]);

    const handleBack = useCallback(() => {
        if (currentStepIndex === 0) {
            handleReset();
        } else {
            setCurrentStepIndex(prev => prev - 1);
        }
    }, [currentStepIndex, handleReset]);

    const isFieldVisible = useCallback((field: StepInputField): boolean => {
        if (!field.conditional) return true;
        const condValue = formData[field.conditional.fieldId];
        switch (field.conditional.operator) {
            case '==': return condValue === field.conditional.value;
            case '!=': return condValue !== field.conditional.value;
            case '>': return condValue > field.conditional.value;
            case '<': return condValue < field.conditional.value;
            default: return true;
        }
    }, [formData]);

    if (!isOpen) return null;

    const renderField = (field: StepInputField) => {
        if (!isFieldVisible(field)) return null;

        const value = formData[field.id] ?? field.defaultValue ?? '';
        const error = errors[field.id];
        const baseInputClass = `w-full px-3 py-2 bg-[var(--bg-primary)] border rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors ${error ? 'border-red-500' : 'border-[var(--border-default)]'}`;

        return (
            <div key={field.id} className="mb-4">
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    {field.label}
                    {field.required && <span className="text-red-400 ml-1">*</span>}
                </label>
                {field.helpText && (
                    <p className="text-xs text-[var(--text-secondary)] mb-1.5">{field.helpText}</p>
                )}

                {(field.type === 'text') && (
                    <input
                        type="text"
                        value={value}
                        onChange={(e) => handleFieldChange(field.id, e.target.value)}
                        placeholder={field.placeholder}
                        className={baseInputClass}
                    />
                )}

                {field.type === 'textarea' && (
                    <textarea
                        value={value}
                        onChange={(e) => handleFieldChange(field.id, e.target.value)}
                        placeholder={field.placeholder}
                        rows={3}
                        className={baseInputClass}
                    />
                )}

                {field.type === 'number' && (
                    <input
                        type="number"
                        value={value}
                        onChange={(e) => handleFieldChange(field.id, parseFloat(e.target.value) || 0)}
                        placeholder={field.placeholder}
                        className={baseInputClass}
                    />
                )}

                {field.type === 'select' && (
                    <select
                        value={value}
                        onChange={(e) => handleFieldChange(field.id, e.target.value)}
                        className={baseInputClass}
                    >
                        <option value="">{t('contentWizard.selectDefault')}</option>
                        {field.options?.map(opt => (
                            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                )}

                {field.type === 'multi-select' && (
                    <div className="flex flex-wrap gap-2">
                        {field.options?.map(opt => {
                            const selected = Array.isArray(value) && value.includes(opt.value);
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                        const current = Array.isArray(value) ? value : [];
                                        const next = selected
                                            ? current.filter((v: any) => v !== opt.value)
                                            : [...current, opt.value];
                                        handleFieldChange(field.id, next);
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                                        selected
                                            ? 'bg-purple-600 border-purple-500 text-white'
                                            : 'bg-[var(--bg-primary)] border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--border-default)]'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            );
                        })}
                        {(!field.options || field.options.length === 0) && (
                            <p className="text-xs text-[var(--text-muted)] italic">{t('contentWizard.noOptions')}</p>
                        )}
                    </div>
                )}

                {field.type === 'boolean' && (
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={!!value}
                            onChange={(e) => handleFieldChange(field.id, e.target.checked)}
                            className="w-4 h-4 rounded border-[var(--border-default)] bg-[var(--bg-primary)] text-purple-600 focus:ring-purple-500 focus:ring-offset-0"
                        />
                        <span className="text-sm text-[var(--text-primary)]">{t('contentWizard.enable')}</span>
                    </label>
                )}

                {field.type === 'color' && (
                    <div className="flex items-center gap-3">
                        <ColorInput value={value || '#FFFFFF'} onChange={v => handleFieldChange(field.id, v)} />
                        <span className="text-sm text-[var(--text-secondary)] font-mono">{value || '#FFFFFF'}</span>
                    </div>
                )}

                {field.type === 'range' && (
                    <RangeInput
                        value={value || 0}
                        onChange={(e) => handleFieldChange(field.id, parseFloat(e.target.value))}
                        className="w-full accent-[var(--accent-lavender)]"
                    />
                )}

                {field.type === 'file' && (
                    <div className="px-4 py-3 bg-[var(--bg-primary)] border border-dashed border-[var(--border-default)] rounded-lg text-center text-[var(--text-secondary)] text-sm">
                        {t('contentWizard.fileUploadHint')}
                    </div>
                )}

                {error && (
                    <p className="mt-1 text-xs text-red-400">{error}</p>
                )}
            </div>
        );
    };

    const getWizardIcon = (icon?: string) => {
        if (icon === 'user') return '👤';
        if (icon === 'image') return '🎬';
        if (icon === 'gallery') return '🖼️';
        return '✨';
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
            <div className="relative w-full max-w-2xl max-h-[85vh] bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl shadow-2xl flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
                    <div className="flex items-center gap-3">
                        <span className="text-xl">✨</span>
                        <h2 className="text-lg font-semibold text-white">
                            {selectedWizard ? selectedWizard.name : t('contentWizard.title')}
                        </h2>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-secondary)] transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                        </svg>
                    </button>
                </div>

                {selectedWizard && currentStep && (
                    <div className="px-6 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]/50">
                        <div className="flex items-center gap-2 mb-2">
                            {selectedWizard.steps.map((step, idx) => (
                                <React.Fragment key={step.id}>
                                    <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold transition-colors ${
                                        idx < currentStepIndex
                                            ? 'bg-green-600 text-white'
                                            : idx === currentStepIndex
                                                ? 'bg-purple-600 text-white'
                                                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                                    }`}>
                                        {idx < currentStepIndex ? '✓' : idx + 1}
                                    </div>
                                    {idx < selectedWizard.steps.length - 1 && (
                                        <div className={`flex-1 h-0.5 rounded ${
                                            idx < currentStepIndex ? 'bg-green-600' : 'bg-[var(--bg-secondary)]'
                                        }`} />
                                    )}
                                </React.Fragment>
                            ))}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)]">
                            {t('contentWizard.stepOf', { current: currentStepIndex + 1, total: totalSteps })}
                            {currentStep.estimatedTime && t('contentWizard.estimatedTime', { min: currentStep.estimatedTime })}
                        </p>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {!selectedWizard ? (
                        <div>
                            <p className="text-[var(--text-secondary)] text-sm mb-5">
                                {t('contentWizard.chooseWizard')}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {availableWizards.map(wizard => (
                                    <button
                                        key={wizard.id}
                                        onClick={() => handleSelectWizard(wizard)}
                                        className="text-left p-5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg hover:border-purple-500 hover:bg-[var(--bg-primary)] transition-all group"
                                    >
                                        <div className="flex items-start gap-3">
                                            <span className="text-2xl">{getWizardIcon(wizard.icon)}</span>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-semibold text-white group-hover:text-purple-300 transition-colors">
                                                    {wizard.name}
                                                </h3>
                                                <p className="text-sm text-[var(--text-secondary)] mt-1">{wizard.description}</p>
                                                <div className="flex items-center gap-3 mt-3 text-xs text-[var(--text-muted)]">
                                                    <span>{t('contentWizard.steps', { count: wizard.totalSteps })}</span>
                                                    <span>{t('contentWizard.approxMin', { min: wizard.estimatedTime })}</span>
                                                    <span className="capitalize px-1.5 py-0.5 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                                                        {wizard.complexity}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : currentStep ? (
                        <div>
                            <h3 className="text-lg font-semibold text-white mb-1">{currentStep.title}</h3>
                            {currentStep.description && (
                                <p className="text-sm text-[var(--text-secondary)] mb-5">{currentStep.description}</p>
                            )}
                            {currentStep.fields.map(renderField)}
                        </div>
                    ) : null}
                </div>

                {selectedWizard && (
                    <div className="px-6 py-4 border-t border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-primary)]/80">
                        <button
                            onClick={handleBack}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-primary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-default)] transition-colors"
                        >
                            {currentStepIndex === 0 ? t('contentWizard.backToWizards') : t('contentWizard.back')}
                        </button>
                        <div className="flex items-center gap-2">
                            {currentStep?.canSkip && !isLastStep && (
                                <button
                                    onClick={() => setCurrentStepIndex(prev => prev + 1)}
                                    className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:text-slate-200 transition-colors"
                                >
                                    {t('contentWizard.skip')}
                                </button>
                            )}
                            <button
                                onClick={handleNext}
                                className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-500 transition-colors"
                            >
                                {isLastStep ? t('contentWizard.complete') : t('contentWizard.next')}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ContentWizardModal;
