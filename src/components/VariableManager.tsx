import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { useInlineRename } from '../hooks/useInlineRename';
import { VNProject } from '../types/project';
import { VNVariable, VNVariableScope } from '../features/variables/types';
import { resolveBoolLabels } from '../features/variables/booleanLabels';
import { useProject } from '../contexts/ProjectContext';
import BooleanLabelEditor from './BooleanLabelEditor';
import { PlusIcon, TrashIcon, Cog6ToothIcon, PencilIcon } from './icons';
import { CommandType, VNCommand, SetVariableCommand, TextInputCommand, ChoiceCommand } from '../features/scene/types';
import { VNUIScreen, VNUIElement } from '../features/ui/types';
import { VNCondition, UIActionType, SetVariableAction, CycleLayerAssetAction } from '../types/shared';
import ConfirmationModal from './ui/ConfirmationModal';

interface VariableUsage {
    location: string;
    type: 'command' | 'condition' | 'ui-action' | 'text-reference';
    detail: string;
}

// Find all usages of a variable in the project
function findVariableUsages(project: VNProject, variableId: string, variableName: string): VariableUsage[] {
    const usages: VariableUsage[] = [];
    
    // Check all scenes for commands using this variable
    for (const sceneId in project.scenes) {
        const scene = project.scenes[sceneId];
        const commands = scene.commands || [];
        if (!Array.isArray(commands)) continue;
        
        commands.forEach((cmd, index) => {
            // SetVariable command
            if (cmd.type === CommandType.SetVariable && (cmd as SetVariableCommand).variableId === variableId) {
                usages.push({
                    location: i18n.t('variables:usage.scene', { name: scene.name }),
                    type: 'command',
                    detail: i18n.t('variables:usage.cmdSetVariable', { n: index + 1 })
                });
            }

            // TextInput command
            if (cmd.type === CommandType.TextInput && (cmd as TextInputCommand).variableId === variableId) {
                usages.push({
                    location: i18n.t('variables:usage.scene', { name: scene.name }),
                    type: 'command',
                    detail: i18n.t('variables:usage.cmdTextInput', { n: index + 1 })
                });
            }

            // Check conditions on any command
            if (cmd.conditions?.some((c: VNCondition) => c.variableId === variableId)) {
                usages.push({
                    location: i18n.t('variables:usage.scene', { name: scene.name }),
                    type: 'condition',
                    detail: i18n.t('variables:usage.cmdCondition', { n: index + 1 })
                });
            }
            
            // Check Choice options for conditions and actions
            if (cmd.type === CommandType.Choice) {
                const choiceCmd = cmd as ChoiceCommand;
                const options = choiceCmd.options || [];
                if (Array.isArray(options)) {
                    options.forEach((opt, optIndex) => {
                        if (opt.conditions?.some((c: VNCondition) => c.variableId === variableId)) {
                            usages.push({
                                location: i18n.t('variables:usage.scene', { name: scene.name }),
                                type: 'condition',
                                detail: i18n.t('variables:usage.optCondition', { n: index + 1, opt: optIndex + 1 })
                            });
                        }
                        const actions = opt.actions || [];
                        if (Array.isArray(actions)) {
                            actions.forEach(action => {
                                if (action.type === UIActionType.SetVariable && (action as SetVariableAction).variableId === variableId) {
                                    usages.push({
                                        location: i18n.t('variables:usage.scene', { name: scene.name }),
                                        type: 'ui-action',
                                        detail: i18n.t('variables:usage.optSetsVariable', { n: index + 1, opt: optIndex + 1 })
                                    });
                                }
                            });
                        }
                    });
                }
            }
            
            // Check Dialogue text for variable references like {variableName} or {variableId}
            if (cmd.type === CommandType.Dialogue) {
                const text = (cmd as any).text || '';
                if (text.includes(`{${variableName}}`) || text.includes(`{${variableId}}`)) {
                    usages.push({
                        location: i18n.t('variables:usage.scene', { name: scene.name }),
                        type: 'text-reference',
                        detail: i18n.t('variables:usage.cmdDialogueRef', { n: index + 1 })
                    });
                }
            }
        });
    }
    
    // Check UI screens for variable usages
    for (const screenId in project.uiScreens) {
        const screen = project.uiScreens[screenId];
        const elements = screen.elements || [];
        if (Array.isArray(elements)) {
            checkUIElementsForVariableUsage(elements, variableId, variableName, i18n.t('variables:usage.uiScreen', { name: screen.name }), usages);
        }
    }
    
    return usages;
}

function checkUIElementsForVariableUsage(
    elements: VNUIElement[], 
    variableId: string, 
    variableName: string,
    locationPrefix: string, 
    usages: VariableUsage[]
): void {
    if (!Array.isArray(elements)) return;
    
    elements.forEach(element => {
        // Check element conditions
        if (element.conditions?.some((c: VNCondition) => c.variableId === variableId)) {
            usages.push({
                location: locationPrefix,
                type: 'condition',
                detail: i18n.t('variables:usage.elCondition', { name: element.name || element.type })
            });
        }
        
        // Check element actions (for buttons)
        const actions = element.actions || [];
        if (Array.isArray(actions)) {
            actions.forEach(action => {
                if (action.type === UIActionType.SetVariable && (action as SetVariableAction).variableId === variableId) {
                    usages.push({
                        location: locationPrefix,
                        type: 'ui-action',
                        detail: i18n.t('variables:usage.elSetsVariable', { name: element.name || element.type })
                    });
                }
                if (action.type === UIActionType.CycleLayerAsset && (action as CycleLayerAssetAction).variableId === variableId) {
                    usages.push({
                        location: locationPrefix,
                        type: 'ui-action',
                        detail: i18n.t('variables:usage.elCyclesLayer', { name: element.name || element.type })
                    });
                }
            });
        }
        
        // Check text content for variable references.
        // NOTE: `content`/`children` are not fields on any current VNUIElement (element text lives in
        // `.text`), so these checks are effectively no-ops today — preserved as-is to avoid a
        // behavior change. (Latent bug: text-reference detection on elements doesn't actually fire.)
        const anyEl = element as any;
        if (anyEl.content && (anyEl.content.includes(`{${variableName}}`) || anyEl.content.includes(`{${variableId}}`))) {
            usages.push({
                location: locationPrefix,
                type: 'text-reference',
                detail: i18n.t('variables:usage.elTextRef', { name: element.name || element.type })
            });
        }

        // Recursively check children
        if (anyEl.children && Array.isArray(anyEl.children)) {
            checkUIElementsForVariableUsage(anyEl.children, variableId, variableName, locationPrefix, usages);
        }
    });
}

interface VariableManagerProps {
    project: VNProject;
    selectedVariableId?: string | null;
    setSelectedVariableId?: (id: string | null) => void;
}

const VariableManager: React.FC<VariableManagerProps> = ({
    project,
    selectedVariableId: controlledSelectedId,
    setSelectedVariableId: setControlledSelectedId
}) => {
    const { dispatch } = useProject();
    const { t } = useTranslation(['variables', 'common']);
    const [internalSelectedVariableId, setInternalSelectedVariableId] = useState<string | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{ variableId: string; usages: VariableUsage[] } | null>(null);

    const isControlledSelection = controlledSelectedId !== undefined && typeof setControlledSelectedId === 'function';
    const selectedVariableId = isControlledSelection ? controlledSelectedId ?? null : internalSelectedVariableId;

    const setSelectedVariableId = (id: string | null) => {
        if (isControlledSelection && setControlledSelectedId) {
            setControlledSelectedId(id);
        } else {
            setInternalSelectedVariableId(id);
        }
    };

    const variablesArray = useMemo(
        // Hide system-managed variables (e.g. item-list stock counts, flagged isInternal) to keep this
        // list calm — they still work everywhere by id (conditions, {name}, SetVariable).
        () => (Object.values(project.variables || {}) as VNVariable[]).filter(v => !v.isInternal),
        [project.variables]
    );

    const addVariable = () => {
        const name = t('newVariableName', { n: Object.keys(project.variables || {}).length + 1 });
        dispatch({ type: 'ADD_VARIABLE', payload: { name, type: 'number', defaultValue: 0 } });
    };

    const handleRequestDelete = (variableId: string) => {
        console.log('[VariableManager] handleRequestDelete called for:', variableId);
        const variable = project.variables[variableId];
        if (!variable) {
            console.log('[VariableManager] Variable not found!');
            return;
        }
        
        const usages = findVariableUsages(project, variableId, variable.name);
        console.log('[VariableManager] Found usages:', usages.length);
        
        // Always show confirmation dialog
        console.log('[VariableManager] Setting deleteConfirm state');
        setDeleteConfirm({ variableId, usages });
    };

    const handleDeleteVariable = (variableId: string) => {
        console.log('[VariableManager] Deleting variable:', variableId);
        dispatch({ type: 'DELETE_VARIABLE', payload: { variableId } });
        console.log('[VariableManager] Dispatch sent');
        if (selectedVariableId === variableId) {
            setSelectedVariableId(null);
        }
        setDeleteConfirm(null);
    };

    const handleRenameVariable = (variableId: string, name: string) => {
        dispatch({ type: 'UPDATE_VARIABLE', payload: { variableId, updates: { name } } });
        setRenamingId(null);
    };

    const handleUpdateVariable = (variableId: string, updates: Partial<VNVariable>) => {
        dispatch({ type: 'UPDATE_VARIABLE', payload: { variableId, updates } });
    };

    return (
        <div className="flex h-full">
            {/* Variables List Sidebar */}
            <div className="w-80 bg-[var(--bg-primary)] border-r border-[var(--border-subtle)] flex flex-col">
                <div className="p-4 border-b border-[var(--border-subtle)]">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Cog6ToothIcon className="w-5 h-5" />
                        {t('listTitle')}
                    </h2>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {variablesArray.map(variable => (
                        <VariableItem
                            key={variable.id}
                            variable={variable}
                            isSelected={selectedVariableId === variable.id}
                            isRenaming={renamingId === variable.id}
                            onSelect={() => setSelectedVariableId(variable.id)}
                            onStartRenaming={() => setRenamingId(variable.id)}
                            onCommitRename={(name) => handleRenameVariable(variable.id, name)}
                            onDelete={() => handleRequestDelete(variable.id)}
                        />
                    ))}
                </div>

                <div className="p-2 border-t border-[var(--border-subtle)]">
                    <button
                        onClick={addVariable}
                        className="w-full bg-sky-500 hover:bg-sky-600 text-white p-2 rounded-md flex items-center justify-center gap-2 font-bold transition-colors"
                    >
                        <PlusIcon className="w-4 h-4" />
                        {t('addVariable')}
                    </button>
                </div>
            </div>

            {/* Variable Inspector */}
            <div className="flex-1 flex flex-col min-w-0">
                {selectedVariableId ? (
                    <VariableInspector
                        variableId={selectedVariableId}
                        project={project}
                        onUpdate={(updates) => handleUpdateVariable(selectedVariableId, updates)}
                    />
                ) : (
                    <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
                        <div className="text-center">
                            <Cog6ToothIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                            <p className="text-lg">{t('selectToInspect')}</p>
                            <p className="text-sm">{t('selectToInspectHint')}</p>
                        </div>
                    </div>
                )}
            </div>
            
            {/* Delete Confirmation Modal with Usage Info */}
            {deleteConfirm && (
                <ConfirmationModal
                    isOpen={true}
                    onClose={() => setDeleteConfirm(null)}
                    onConfirm={() => handleDeleteVariable(deleteConfirm.variableId)}
                    title={deleteConfirm.usages.length > 0 ? t('delete.inUseTitle') : t('delete.deleteTitle')}
                    confirmLabel={deleteConfirm.usages.length > 0 ? t('delete.deleteAnyway') : t('common:delete')}
                >
                    {deleteConfirm.usages.length > 0 ? (
                        <div className="space-y-3">
                            <p className="text-[var(--text-primary)]">
                                {t('delete.inUseBody', { count: deleteConfirm.usages.length })}
                            </p>
                            <div className="max-h-48 overflow-y-auto bg-[var(--bg-tertiary)] rounded-lg p-3">
                                <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">{t('delete.usagesFound')}</p>
                                <ul className="space-y-1.5 text-sm">
                                    {deleteConfirm.usages.slice(0, 10).map((usage, i) => (
                                        <li key={i} className="flex items-start gap-2 text-[var(--text-secondary)]">
                                            <span className="flex-shrink-0 text-xs font-mono">
                                                {usage.type === 'command' && '→'}
                                                {usage.type === 'condition' && '?'}
                                                {usage.type === 'ui-action' && '○'}
                                                {usage.type === 'text-reference' && '«»'}
                                            </span>
                                            <span>
                                                <strong>{usage.location}</strong>
                                                <br />
                                                <span className="text-xs opacity-75">{usage.detail}</span>
                                            </span>
                                        </li>
                                    ))}
                                    {deleteConfirm.usages.length > 10 && (
                                        <li className="text-xs text-[var(--text-secondary)] italic pt-1">
                                            {t('delete.andMore', { count: deleteConfirm.usages.length - 10 })}
                                        </li>
                                    )}
                            </ul>
                        </div>
                    </div>
                    ) : (
                        <p className="text-[var(--text-primary)]">
                            {t('delete.confirmBody')}
                        </p>
                    )}
                </ConfirmationModal>
            )}
        </div>
    );
};

interface VariableItemProps {
    variable: VNVariable;
    isSelected: boolean;
    isRenaming: boolean;
    onSelect: () => void;
    onStartRenaming: () => void;
    onCommitRename: (name: string) => void;
    onDelete: () => void;
}

const VariableItem: React.FC<VariableItemProps> = ({
    variable,
    isSelected,
    isRenaming,
    onSelect,
    onStartRenaming,
    onCommitRename,
    onDelete
}) => {
    const { t } = useTranslation(['variables', 'common']);
    const { inputProps: renameInputProps } = useInlineRename(variable.name, onCommitRename);

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'number': return '#';
            case 'string': return 'Aa';
            case 'boolean': return '✓';
            default: return '?';
        }
    };

    const scope: VNVariableScope = variable.scope || 'global';
    const scopeColors: Record<VNVariableScope, { bg: string; border: string; text: string; label: string }> = {
        local: { bg: 'bg-emerald-600/20', border: 'border-emerald-500/50', text: 'text-emerald-400', label: 'Local' },
        global: { bg: 'bg-sky-600/20', border: 'border-sky-500/50', text: 'text-sky-400', label: 'Global' },
        persistent: { bg: 'bg-amber-600/20', border: 'border-amber-500/50', text: 'text-amber-400', label: 'Persistent' },
    };
    const sc = scopeColors[scope];

    return (
        <div
            onClick={onSelect}
            onDoubleClick={onStartRenaming}
            className={`group flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                isSelected
                    ? `${sc.bg} border ${sc.border}`
                    : 'hover:bg-[var(--bg-secondary)]'
            }`}
        >
            <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 text-sm border ${sc.bg} ${sc.border}`}>
                {getTypeIcon(variable.type)}
            </div>

            <div className="flex-grow truncate">
                {isRenaming ? (
                    <input
                        type="text"
                        {...renameInputProps}
                        className="w-full bg-[var(--bg-primary)] text-white p-1 rounded text-sm outline-none ring-1 ring-sky-500"
                    />
                ) : (
                    <span className="text-sm">{variable.name}</span>
                )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${sc.bg} ${sc.text} border ${sc.border}`}>
                    {t(`scopes.${scope}`)}
                </span>
                <span className="text-xs text-[var(--text-secondary)] px-2 py-1 bg-[var(--bg-tertiary)] rounded">
                    {t(`types.${variable.type}`)}
                </span>

                <button
                    onClick={(e) => { e.stopPropagation(); onStartRenaming(); }}
                    className="p-1 text-[var(--text-muted)] hover:text-sky-400 transition-opacity"
                    title={t('common:rename')}
                >
                    <PencilIcon className="w-3 h-3" />
                </button>

                <button
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        console.log('[VariableItem] Delete button clicked for:', variable.id);
                        onDelete(); 
                    }}
                    className="p-1 text-red-500 hover:text-red-400 transition-opacity"
                    title={t('common:delete')}
                >
                    <TrashIcon className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
};

interface VariableInspectorProps {
    variableId: string;
    project: VNProject;
    onUpdate: (updates: Partial<VNVariable>) => void;
}

const VariableInspector: React.FC<VariableInspectorProps> = ({ variableId, project, onUpdate }) => {
    const { t } = useTranslation('variables');
    const variable = project.variables?.[variableId];

    if (!variable) {
        return (
            <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
                <p>{t('notFound')}</p>
            </div>
        );
    }

    const handleTypeChange = (type: 'number' | 'string' | 'boolean') => {
        let defaultValue: any = variable.defaultValue;

        // Convert default value to new type
        switch (type) {
            case 'number':
                defaultValue = typeof variable.defaultValue === 'number' ? variable.defaultValue : 0;
                break;
            case 'string':
                defaultValue = String(variable.defaultValue);
                break;
            case 'boolean':
                defaultValue = Boolean(variable.defaultValue);
                break;
        }

        onUpdate({ type, defaultValue });
    };

    const handleDefaultValueChange = (value: any) => {
        onUpdate({ defaultValue: value });
    };

    const currentScope: VNVariableScope = variable.scope || 'global';
    const boolLbls = resolveBoolLabels(variable, t('boolean.true'), t('boolean.false'));

    return (
        <div className="flex-1 p-4 overflow-y-auto">
            <h3 className="text-xl font-bold text-white mb-4">{variable.name}</h3>

            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">{t('scopeLabel')}</label>
                    <select
                        value={currentScope}
                        onChange={(e) => onUpdate({ scope: e.target.value as VNVariableScope })}
                        className="w-full bg-[var(--bg-primary)] text-white p-2 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                    >
                        <option value="local">{t('scopeOptions.local')}</option>
                        <option value="global">{t('scopeOptions.global')}</option>
                        <option value="persistent">{t('scopeOptions.persistent')}</option>
                    </select>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">{t(`scopeDesc.${currentScope}`)}</p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">{t('typeLabel')}</label>
                    <select
                        value={variable.type}
                        onChange={(e) => handleTypeChange(e.target.value as 'number' | 'string' | 'boolean')}
                        className="w-full bg-[var(--bg-primary)] text-white p-2 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                    >
                        <option value="number">{t('types.number')}</option>
                        <option value="string">{t('types.string')}</option>
                        <option value="boolean">{t('types.boolean')}</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">{t('defaultValue')}</label>
                    {variable.type === 'boolean' ? (
                        <select
                            value={variable.defaultValue ? 'true' : 'false'}
                            onChange={(e) => handleDefaultValueChange(e.target.value === 'true')}
                            className="w-full bg-[var(--bg-primary)] text-white p-2 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                        >
                            <option value="false">{boolLbls.no}</option>
                            <option value="true">{boolLbls.yes}</option>
                        </select>
                    ) : variable.type === 'number' ? (
                        <input
                            type="number"
                            value={variable.defaultValue}
                            onChange={(e) => handleDefaultValueChange(parseFloat(e.target.value) || 0)}
                            className="w-full bg-[var(--bg-primary)] text-white p-2 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                        />
                    ) : (
                        <input
                            type="text"
                            value={variable.defaultValue}
                            onChange={(e) => handleDefaultValueChange(e.target.value)}
                            className="w-full bg-[var(--bg-primary)] text-white p-2 rounded-md border border-[var(--border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lavender)]"
                        />
                    )}
                </div>

                {variable.type === 'boolean' && (
                    <BooleanLabelEditor trueLabel={variable.trueLabel} falseLabel={variable.falseLabel}
                        onChange={updates => onUpdate(updates)} />
                )}

                <div className="grid grid-cols-2 gap-4 text-sm pt-4 border-t border-[var(--border-subtle)]">
                    <div>
                        <span className="text-[var(--text-secondary)]">{t('idLabel')}</span>
                        <span className="text-white ml-2 font-mono text-xs">{variable.id}</span>
                    </div>
                    <div>
                        <span className="text-[var(--text-secondary)]">{t('typeColon')}</span>
                        <span className="text-white ml-2">{t(`types.${variable.type}`)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default React.memo(VariableManager);