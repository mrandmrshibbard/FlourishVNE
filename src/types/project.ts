import { VNID } from './';
import { VNBackground, VNImage, VNAudio, VNVideo } from '../features/assets/types';
import { VNCharacter } from '../features/character/types';
import { VNScene } from '../features/scene/types';
import { VNProjectUI, VNUIScreen } from '../features/ui/types';
import { VNVariable } from '../features/variables/types';

export interface VNProject {
    id: VNID;
    title: string;
    startSceneId: VNID;
    scenes: Record<VNID, VNScene>;
    characters: Record<VNID, VNCharacter>;
    backgrounds: Record<VNID, VNBackground>;
    images: Record<VNID, VNImage>;
    audio: Record<VNID, VNAudio>;
    videos: Record<VNID, VNVideo>;
    variables: Record<VNID, VNVariable>;
    ui: VNProjectUI;
    uiScreens: Record<VNID, VNUIScreen>;
}
