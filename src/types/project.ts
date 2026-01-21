import { VNID } from './';
import { VNBackground, VNImage, VNAudio, VNVideo } from '../features/assets/types';
import { VNCharacter } from '../features/character/types';
import { VNScene } from '../features/scene/types';
import { VNProjectUI, VNUIScreen } from '../features/ui/types';
import { VNVariable } from '../features/variables/types';

export interface VNProjectFont {
    id: VNID;
    name: string;
    fontFamily: string;
    fontUrl: string; // data URL in-editor/imported projects; may be rewritten to assets/* during export
    fileName?: string;
}

export interface VNProject {
    id: VNID;
    title: string;
    description?: string;
    author?: string;
    startSceneId: VNID;
    scenes: Record<VNID, VNScene>;
    characters: Record<VNID, VNCharacter>;
    backgrounds: Record<VNID, VNBackground>;
    images: Record<VNID, VNImage>;
    audio: Record<VNID, VNAudio>;
    videos: Record<VNID, VNVideo>;
    variables: Record<VNID, VNVariable>;
    fonts: Record<VNID, VNProjectFont>;
    ui: VNProjectUI;
    uiScreens: Record<VNID, VNUIScreen>;
}
