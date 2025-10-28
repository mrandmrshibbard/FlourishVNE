/**
 * Dialogue Box Renderer
 * Displays dialogue with typewriter effect
 */

import React from 'react';
import { VNProject } from '../../../types/project';
import { VNID } from '../../../types';
import { fontSettingsToStyle } from '../../../utils/styleUtils';
import { interpolateVariables } from '../../../utils/variableInterpolation';
import { useTypewriter } from '../hooks/useTypewriter';
import { PlayerState, GameSettings } from '../types/gameState';

interface DialogueBoxProps {
    dialogue: PlayerState['uiState']['dialogue'];
    settings: GameSettings;
    projectUI: any;
    onFinished: () => void;
    variables: Record<VNID, string | number | boolean>;
    project: VNProject;
}

export const DialogueBox: React.FC<DialogueBoxProps> = ({ 
    dialogue, 
    settings, 
    projectUI, 
    onFinished, 
    variables, 
    project 
}) => {
    if (!dialogue) return null;

    const interpolatedText = interpolateVariables(dialogue.text, variables, project);
    const { displayText, skip, hasFinished } = useTypewriter(interpolatedText, settings.textSpeed);
    
    const handleClick = () => {
        if (hasFinished) {
            onFinished();
        } else {
            skip();
        }
    };

    // Resolve dialogue box image/video URL
    const dialogueBoxUrl = projectUI.dialogueBoxImage 
        ? (projectUI.dialogueBoxImage.type === 'video' 
            ? project.videos[projectUI.dialogueBoxImage.id]?.videoUrl 
            : (project.images[projectUI.dialogueBoxImage.id]?.imageUrl || project.backgrounds[projectUI.dialogueBoxImage.id]?.imageUrl)
          )
        : null;
    const isDialogueBoxVideo = projectUI.dialogueBoxImage?.type === 'video';

    return (
        <div 
            className={`absolute bottom-5 left-5 right-5 p-5 z-20 cursor-pointer ${dialogueBoxUrl && !isDialogueBoxVideo ? 'dialogue-box-custom bg-black/70' : 'bg-black/70 rounded-lg border-2 border-slate-500'}`} 
            style={dialogueBoxUrl && !isDialogueBoxVideo ? { borderImageSource: `url(${dialogueBoxUrl})` } : {}}
            onClick={handleClick}
        >
            {isDialogueBoxVideo && dialogueBoxUrl && (
                <video 
                    autoPlay 
                    loop 
                    muted 
                    className="absolute inset-0 w-full h-full object-cover rounded-lg -z-10"
                    style={{ pointerEvents: 'none' }}
                >
                    <source src={dialogueBoxUrl} />
                </video>
            )}
            {dialogue.characterName !== 'Narrator' && (
                <h3 className="mb-2" style={{...fontSettingsToStyle(projectUI.dialogueNameFont), color: dialogue.characterColor}}>
                    {dialogue.characterName}
                </h3>
            )}
            <p className="leading-relaxed" style={fontSettingsToStyle(projectUI.dialogueTextFont)}>
                {displayText}
                {!hasFinished && <span className="animate-ping">_</span>}
            </p>
        </div>
    );
};
