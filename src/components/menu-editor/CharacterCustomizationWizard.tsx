import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { VNProject } from '../../types/project';
import { VNID } from '../../types';
import { VNCharacter, VNCharacterLayer, VNLayerAsset } from '../../features/character/types';
import { UIElementType, AssetCondition } from '../../features/ui/types';
import { PhotoIcon, SparklesIcon, CheckIcon, ChevronRightIcon, XMarkIcon } from '../icons';

interface WizardProps {
    isOpen: boolean;
    onClose: () => void;
    project: VNProject;
    screenId: VNID;
    onGenerate: (config: GeneratedConfig) => void;
}

export interface GeneratedConfig {
    characterId: VNID;
    // Variables to create (one per independent layer)
    variables: {
        id: VNID;
        name: string;
        layerId: VNID;
    }[];
    // Asset cyclers to create
    cyclers: {
        layerId: VNID;
        variableId: VNID;
        label: string;
        assetIds: VNID[];
        // For dependent layers (e.g., body = f(bodyType, skinColor))
        assetConditions?: AssetCondition[];
    }[];
    // Character preview configuration
    preview: {
        layerVariableMap: Record<VNID, VNID>;
    };
}

interface LayerAnalysis {
    layer: VNCharacterLayer;
    assetCount: number;
    // Detected naming pattern parts (e.g., ["fem", "masc"] and ["brown", "tan", "white"])
    namingPatterns: {
        position: number;
        values: Set<string>;
    }[];
    // Whether this layer appears to be a "combined" layer (depends on other choices)
    isCombinedLayer: boolean;
    // Which layers this one depends on (for combined layers)
    dependsOn: VNID[];
}

// Analyze asset naming patterns to detect relationships
function analyzeLayer(layer: VNCharacterLayer): LayerAnalysis {
    const assets = Object.values(layer.assets);
    const assetCount = assets.length;
    
    // Split each asset name by underscore and analyze each position
    const nameParts: string[][] = assets.map(a => a.name.toLowerCase().split('_'));
    const maxParts = Math.max(...nameParts.map(p => p.length));
    
    const namingPatterns: { position: number; values: Set<string> }[] = [];
    
    for (let i = 0; i < maxParts; i++) {
        const valuesAtPosition = new Set<string>();
        nameParts.forEach(parts => {
            if (parts[i]) valuesAtPosition.add(parts[i]);
        });
        
        // Only consider it a pattern if there are multiple distinct values
        if (valuesAtPosition.size > 1 && valuesAtPosition.size < assetCount) {
            namingPatterns.push({ position: i, values: valuesAtPosition });
        }
    }
    
    // A layer is "combined" if it has multiple pattern positions (e.g., body type AND skin color)
    const isCombinedLayer = namingPatterns.length > 1;
    
    return {
        layer,
        assetCount,
        namingPatterns,
        isCombinedLayer,
        dependsOn: []
    };
}

// Generate a unique ID
const generateId = (prefix: string) => `${prefix}-${Math.random().toString(36).substring(2, 9)}`;

const CharacterCustomizationWizard: React.FC<WizardProps> = ({ 
    isOpen, 
    onClose, 
    project, 
    screenId,
    onGenerate 
}) => {
    const [step, setStep] = useState<'select-character' | 'configure-layers' | 'review'>('select-character');
    const [selectedCharacterId, setSelectedCharacterId] = useState<VNID | null>(null);
    
    // Layer configuration type
    interface LayerConfig {
        enabled: boolean;
        label: string;
        mode: 'simple' | 'conditional';
        dependsOnLayers: VNID[];
    }
    
    // Layer configuration
    const [layerConfigs, setLayerConfigs] = useState<Record<VNID, LayerConfig>>({});

    const characters = Object.values(project.characters) as VNCharacter[];
    const selectedCharacter = selectedCharacterId ? project.characters[selectedCharacterId] : null;
    
    // Analyze layers when character is selected
    const layerAnalyses = useMemo(() => {
        if (!selectedCharacter) return {};
        const analyses: Record<VNID, LayerAnalysis> = {};
        (Object.values(selectedCharacter.layers) as VNCharacterLayer[]).forEach(layer => {
            analyses[layer.id] = analyzeLayer(layer);
        });
        return analyses;
    }, [selectedCharacter]);

    // Initialize layer configs when character changes
    React.useEffect(() => {
        if (selectedCharacter) {
            const configs: typeof layerConfigs = {};
            (Object.values(selectedCharacter.layers) as VNCharacterLayer[]).forEach(layer => {
                const analysis = layerAnalyses[layer.id];
                configs[layer.id] = {
                    enabled: true,
                    label: layer.name.charAt(0).toUpperCase() + layer.name.slice(1),
                    mode: analysis?.isCombinedLayer ? 'conditional' : 'simple',
                    dependsOnLayers: []
                };
            });
            setLayerConfigs(configs);
        }
    }, [selectedCharacter, layerAnalyses]);

    const handleGenerate = () => {
        if (!selectedCharacter) return;
        
        console.log('[Wizard] handleGenerate called');
        console.log('[Wizard] selectedCharacter:', selectedCharacter.name);
        console.log('[Wizard] layerConfigs:', layerConfigs);
        console.log('[Wizard] layerConfigs entries:', Object.entries(layerConfigs));
        
        const variables: GeneratedConfig['variables'] = [];
        const cyclers: GeneratedConfig['cyclers'] = [];
        const layerVariableMap: Record<VNID, VNID> = {};
        
        // Get layers directly from character
        const layers = Object.values(selectedCharacter.layers) as VNCharacterLayer[];
        console.log('[Wizard] layers:', layers.map(l => l.name));
        
        // First pass: create variables for enabled layers
        layers.forEach(layer => {
            const config = layerConfigs[layer.id];
            console.log(`[Wizard] Layer ${layer.name}: config =`, config);
            
            if (!config || !config.enabled) {
                console.log(`[Wizard] Skipping layer ${layer.name} - not enabled or no config`);
                return;
            }
            
            const varId = generateId('var');
            variables.push({
                id: varId,
                name: `${selectedCharacter.name.toLowerCase()}_${layer.name}`,
                layerId: layer.id
            });
            layerVariableMap[layer.id] = varId;
            console.log(`[Wizard] Created variable ${varId} for layer ${layer.name}`);
        });
        
        console.log('[Wizard] Variables created:', variables.length);
        
        // Second pass: create cyclers
        layers.forEach(layer => {
            const config = layerConfigs[layer.id];
            if (!config || !config.enabled) return;
            
            const varId = layerVariableMap[layer.id];
            const assetIds = Object.keys(layer.assets);
            
            console.log(`[Wizard] Creating cycler for layer ${layer.name}, varId=${varId}, assets=${assetIds.length}`);
            
            if (config.mode === 'simple') {
                // Simple cycler - just cycle through all assets
                cyclers.push({
                    layerId: layer.id,
                    variableId: varId,
                    label: config.label,
                    assetIds
                });
                console.log(`[Wizard] Added simple cycler for ${layer.name}`);
            } else if (config.mode === 'conditional' && config.dependsOnLayers.length > 0) {
                // Conditional cycler - generate asset conditions
                const assetConditions: AssetCondition[] = [];
                
                // For each asset, determine its conditions based on naming pattern matching
                (Object.values(layer.assets) as VNLayerAsset[]).forEach(asset => {
                    const assetNameParts = asset.name.toLowerCase().split('_');
                    const conditions: AssetCondition['conditions'] = [];
                    
                    config.dependsOnLayers.forEach(depLayerId => {
                        const depLayer = selectedCharacter.layers[depLayerId];
                        const depVarId = layerVariableMap[depLayerId];
                        if (!depLayer || !depVarId) return;
                        
                        // Find which asset in the dependency layer matches a part of this asset's name
                        (Object.values(depLayer.assets) as VNLayerAsset[]).forEach(depAsset => {
                            const depNameParts = depAsset.name.toLowerCase().split('_');
                            // Check if any part of the dep asset name appears in this asset's name
                            const matchingPart = depNameParts.find(part => 
                                assetNameParts.includes(part) && part.length > 2
                            );
                            if (matchingPart) {
                                conditions.push({
                                    variableId: depVarId,
                                    value: depAsset.id
                                });
                            }
                        });
                    });
                    
                    if (conditions.length > 0) {
                        assetConditions.push({
                            assetId: asset.id,
                            conditions
                        });
                    }
                });
                
                cyclers.push({
                    layerId: layer.id,
                    variableId: varId,
                    label: config.label,
                    assetIds,
                    assetConditions: assetConditions.length > 0 ? assetConditions : undefined
                });
                console.log(`[Wizard] Added conditional cycler for ${layer.name}`);
            } else {
                // Fallback: treat as simple if conditional but no dependencies selected
                cyclers.push({
                    layerId: layer.id,
                    variableId: varId,
                    label: config.label,
                    assetIds
                });
                console.log(`[Wizard] Added fallback simple cycler for ${layer.name} (conditional but no deps)`);
            }
        });
        
        console.log('[Wizard] Total cyclers created:', cyclers.length);
        console.log('[Wizard] Cyclers:', cyclers);
        
        onGenerate({
            characterId: selectedCharacter.id,
            variables,
            cyclers,
            preview: { layerVariableMap }
        });
        
        onClose();
        setStep('select-character');
        setSelectedCharacterId(null);
    };

    if (!isOpen) return null;

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
    };

    const renderStep = () => {
        switch (step) {
            case 'select-character':
                return (
                    <div className="space-y-4">
                        <p className="text-slate-400 text-sm">
                            Select a character to create a customization screen for. The wizard will analyze their layers and assets.
                        </p>
                        
                        {characters.length === 0 ? (
                            <div className="p-8 text-center text-slate-500">
                                <PhotoIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                <p>No characters found in this project.</p>
                                <p className="text-sm mt-1">Create a character with layers first.</p>
                            </div>
                        ) : (
                            <div className="grid gap-2">
                                {characters.map((char: VNCharacter) => (
                                    <button
                                        key={char.id}
                                        onClick={() => setSelectedCharacterId(char.id)}
                                        className={`p-4 rounded-lg border-2 text-left transition-all ${
                                            selectedCharacterId === char.id
                                                ? 'border-purple-500 bg-purple-500/10'
                                                : 'border-slate-700 hover:border-slate-500 bg-slate-800/50'
                                        }`}
                                    >
                                        <div className="font-semibold">{char.name}</div>
                                        <div className="text-sm text-slate-400 mt-1">
                                            {Object.keys(char.layers).length} layers • {
                                                Object.values(char.layers).reduce((sum, l) => sum + Object.keys(l.assets).length, 0)
                                            } total assets
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                        
                        <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600">
                                Cancel
                            </button>
                            <button 
                                onClick={() => setStep('configure-layers')}
                                disabled={!selectedCharacterId}
                                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                Next <ChevronRightIcon className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                );
                
            case 'configure-layers':
                return (
                    <div className="space-y-4">
                        <p className="text-slate-400 text-sm">
                            Configure how each layer should be customized. Simple layers let users cycle through options directly. 
                            Conditional layers filter based on other selections.
                        </p>
                        
                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                            {selectedCharacter && (Object.values(selectedCharacter.layers) as VNCharacterLayer[]).map((layer) => {
                                const config = layerConfigs[layer.id];
                                const analysis = layerAnalyses[layer.id];
                                if (!config) return null;
                                
                                const otherLayers = (Object.values(selectedCharacter.layers) as VNCharacterLayer[]).filter(l => l.id !== layer.id);
                                
                                return (
                                    <div key={layer.id} className={`p-4 rounded-lg border ${config.enabled ? 'border-slate-600 bg-slate-800/50' : 'border-slate-700/50 bg-slate-900/50 opacity-60'}`}>
                                        <div className="flex items-center gap-3 mb-3">
                                            <input
                                                type="checkbox"
                                                checked={config.enabled}
                                                onChange={e => setLayerConfigs(prev => ({
                                                    ...prev,
                                                    [layer.id]: { ...config, enabled: e.target.checked }
                                                }))}
                                                className="w-5 h-5 rounded border-slate-500"
                                            />
                                            <div className="flex-1">
                                                <input
                                                    type="text"
                                                    value={config.label}
                                                    onChange={e => setLayerConfigs(prev => ({
                                                        ...prev,
                                                        [layer.id]: { ...config, label: e.target.value }
                                                    }))}
                                                    className="bg-transparent border-b border-slate-600 focus:border-purple-500 outline-none font-medium"
                                                />
                                            </div>
                                            <span className="text-sm text-slate-500">
                                                {Object.keys(layer.assets).length} assets
                                            </span>
                                        </div>
                                        
                                        {config.enabled && (
                                            <div className="space-y-3 pl-8">
                                                <div className="flex gap-4">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="radio"
                                                            checked={config.mode === 'simple'}
                                                            onChange={() => setLayerConfigs(prev => ({
                                                                ...prev,
                                                                [layer.id]: { ...config, mode: 'simple', dependsOnLayers: [] }
                                                            }))}
                                                            className="w-4 h-4"
                                                        />
                                                        <span className="text-sm">Simple (cycle all)</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="radio"
                                                            checked={config.mode === 'conditional'}
                                                            onChange={() => setLayerConfigs(prev => ({
                                                                ...prev,
                                                                [layer.id]: { ...config, mode: 'conditional' }
                                                            }))}
                                                            className="w-4 h-4"
                                                        />
                                                        <span className="text-sm">Conditional (filtered)</span>
                                                    </label>
                                                </div>
                                                
                                                {config.mode === 'conditional' && otherLayers.length > 0 && (
                                                    <div className="bg-slate-900/50 p-3 rounded-lg">
                                                        <p className="text-xs text-slate-400 mb-2">This layer depends on:</p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {otherLayers.map(otherLayer => (
                                                                <label key={otherLayer.id} className="flex items-center gap-1.5 bg-slate-700 px-2 py-1 rounded text-sm cursor-pointer">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={config.dependsOnLayers.includes(otherLayer.id)}
                                                                        onChange={e => {
                                                                            const newDeps = e.target.checked
                                                                                ? [...config.dependsOnLayers, otherLayer.id]
                                                                                : config.dependsOnLayers.filter(id => id !== otherLayer.id);
                                                                            setLayerConfigs(prev => ({
                                                                                ...prev,
                                                                                [layer.id]: { ...config, dependsOnLayers: newDeps }
                                                                            }));
                                                                        }}
                                                                        className="w-3 h-3"
                                                                    />
                                                                    {otherLayer.name}
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                {analysis?.isCombinedLayer && config.mode === 'simple' && (
                                                    <p className="text-xs text-amber-400/80 flex items-center gap-1">
                                                        <SparklesIcon className="w-3 h-3" />
                                                        This layer appears to combine multiple attributes. Consider using conditional mode.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        
                        <div className="flex justify-between gap-3 pt-4 border-t border-slate-700">
                            <button onClick={() => setStep('select-character')} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600">
                                Back
                            </button>
                            <button 
                                onClick={() => setStep('review')}
                                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 flex items-center gap-2"
                            >
                                Next <ChevronRightIcon className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                );
                
            case 'review':
                const enabledLayers = (Object.entries(layerConfigs) as [VNID, LayerConfig][]).filter(([_, c]) => c.enabled);
                return (
                    <div className="space-y-4">
                        <p className="text-slate-400 text-sm">
                            Review what will be generated. You can customize everything after generation.
                        </p>
                        
                        <div className="bg-slate-900 rounded-lg p-4 space-y-3">
                            <div className="flex items-center gap-2 text-green-400">
                                <CheckIcon className="w-5 h-5" />
                                <span className="font-medium">{enabledLayers.length} variables will be created</span>
                            </div>
                            <div className="flex items-center gap-2 text-blue-400">
                                <CheckIcon className="w-5 h-5" />
                                <span className="font-medium">{enabledLayers.length} asset cyclers will be created</span>
                            </div>
                            <div className="flex items-center gap-2 text-purple-400">
                                <CheckIcon className="w-5 h-5" />
                                <span className="font-medium">1 character preview will be created</span>
                            </div>
                            
                            <div className="border-t border-slate-700 pt-3 mt-3">
                                <p className="text-sm text-slate-400 mb-2">Layer configuration:</p>
                                <ul className="text-sm space-y-1">
                                    {enabledLayers.map(([layerId, config]) => (
                                        <li key={layerId} className="flex items-center gap-2">
                                            <span className="text-slate-300">{config.label}</span>
                                            <span className="text-slate-500">•</span>
                                            <span className={config.mode === 'conditional' ? 'text-amber-400' : 'text-slate-400'}>
                                                {config.mode === 'conditional' 
                                                    ? `Filtered by ${config.dependsOnLayers.length} layer(s)` 
                                                    : 'Simple cycling'}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                        
                        <div className="flex justify-between gap-3 pt-4 border-t border-slate-700">
                            <button onClick={() => setStep('configure-layers')} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600">
                                Back
                            </button>
                            <button 
                                onClick={handleGenerate}
                                className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 flex items-center gap-2 font-semibold"
                            >
                                <SparklesIcon className="w-4 h-4" />
                                Generate Customization Screen
                            </button>
                        </div>
                    </div>
                );
        }
    };

    return createPortal(
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={handleBackdropClick}
        >
            <div 
                className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-xl shadow-2xl w-full max-w-2xl m-4 border border-slate-700"
                style={{ boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 60px rgba(168, 85, 247, 0.15)' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500/20 rounded-lg">
                            <SparklesIcon className="w-6 h-6 text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">Character Customization Wizard</h2>
                            <p className="text-sm text-slate-400">
                                {step === 'select-character' && 'Step 1: Select Character'}
                                {step === 'configure-layers' && 'Step 2: Configure Layers'}
                                {step === 'review' && 'Step 3: Review & Generate'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
                        <XMarkIcon className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
                
                {/* Content */}
                <div className="p-6">
                    {renderStep()}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default CharacterCustomizationWizard;
