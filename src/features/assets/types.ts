import { VNID } from '../../types';

export interface VNBackground {
    id: VNID;
    name: string;
    imageUrl?: string;
    videoUrl?: string;
    isVideo?: boolean;
    loop?: boolean;
    autoplay?: boolean;
}
export interface VNImage {
    id: VNID;
    name: string;
    imageUrl?: string;
    videoUrl?: string;
    isVideo?: boolean;
    loop?: boolean;
    autoplay?: boolean;
}
export interface VNAudio {
    id: VNID;
    name: string;
    audioUrl: string;
}
export interface VNVideo {
    id: VNID;
    name: string;
    videoUrl: string;
}
