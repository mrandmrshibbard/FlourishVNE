/**
 * Choice Menu Renderer
 * Displays choice options for player selection
 */

import React from 'react';
import { VNProject } from '../../../types/project';
import { VNID } from '../../../types';
import { ChoiceOption } from '../../../features/scene/types';
import { fontSettingsToStyle } from '../../../utils/styleUtils';
import { interpolateVariables } from '../../../utils/variableInterpolation';

interface ChoiceMenuProps {
    choices: ChoiceOption[];
    projectUI: any;
    onSelect: (choice: ChoiceOption) => void;
    variables: Record<VNID, string | number | boolean>;
    project: VNProject;
}

export const ChoiceMenu: React.FC<ChoiceMenuProps> = ({ 
    choices, 
    projectUI, 
    onSelect, 
    variables, 
    project 
}) => {
    // Resolve choice button image/video URL
    const choiceButtonUrl = projectUI.choiceButtonImage 
        ? (projectUI.choiceButtonImage.type === 'video' 
            ? project.videos[projectUI.choiceButtonImage.id]?.videoUrl 
            : (project.images[projectUI.choiceButtonImage.id]?.imageUrl || project.backgrounds[projectUI.choiceButtonImage.id]?.imageUrl)
          )
        : null;
    const isChoiceButtonVideo = projectUI.choiceButtonImage?.type === 'video';

    return (
        <div className="absolute inset-0 bg-black/30 z-30 flex flex-col items-center justify-center p-8 space-y-4">
            {choices.map((choice, index) => {
                const interpolatedText = interpolateVariables(choice.text, variables, project);
                return (
                    <button 
                        key={index} 
                        onClick={() => onSelect(choice)}
                        className={`px-8 py-4 relative ${choiceButtonUrl && !isChoiceButtonVideo ? 'choice-button-custom bg-slate-800/80 hover:bg-slate-700/90' : 'bg-slate-800/80 hover:bg-slate-700/90 border-2 border-slate-500 rounded-lg'}`}
                        style={choiceButtonUrl && !isChoiceButtonVideo ? { borderImageSource: `url(${choiceButtonUrl})`, ...fontSettingsToStyle(projectUI.choiceTextFont) } : fontSettingsToStyle(projectUI.choiceTextFont)}
                    >
                        {isChoiceButtonVideo && choiceButtonUrl && (
                            <video 
                                autoPlay 
                                loop 
                                muted 
                                className="absolute inset-0 w-full h-full object-cover rounded-lg -z-10"
                                style={{ pointerEvents: 'none' }}
                            >
                                <source src={choiceButtonUrl} />
                            </video>
                        )}
                        <span className="relative z-10">{interpolatedText}</span>
                    </button>
                );
            })}
        </div>
    );
};
