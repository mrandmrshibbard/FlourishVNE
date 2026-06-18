import { VNID } from '../../types';

export interface VNBackground {
    id: VNID;
    name: string;
    imageUrl?: string;
    videoUrl?: string;
    isVideo?: boolean;
    loop?: boolean;
    autoplay?: boolean;
    path?: string; // Optional directory path (e.g., "Characters/Heroes" or "" for root)
}
export interface VNImage {
    id: VNID;
    name: string;
    imageUrl?: string;
    videoUrl?: string;
    isVideo?: boolean;
    loop?: boolean;
    autoplay?: boolean;
    path?: string; // Optional directory path (e.g., "UI/Icons" or "" for root)
}
export interface VNAudio {
    id: VNID;
    name: string;
    audioUrl: string;
    path?: string; // Optional directory path (e.g., "Music/Battle" or "" for root)
}
export interface VNVideo {
    id: VNID;
    name: string;
    videoUrl: string;
    path?: string; // Optional directory path (e.g., "Cutscenes/Chapter1" or "" for root)
}
