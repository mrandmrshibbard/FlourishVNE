import { VNID } from '../../types';

export interface VNLayerAsset {
    id: VNID;
    name: string;
    imageUrl?: string;
    videoUrl?: string;
    isVideo?: boolean;
    loop?: boolean;
    autoplay?: boolean;
}
export interface VNCharacterLayer {
    id: VNID;
    name: string;
    assets: Record<VNID, VNLayerAsset>;
}
export interface VNCharacterExpression {
    id: VNID;
    name: string;
    layerConfiguration: Record<VNID, VNID | null>; // layerId -> assetId
}
export interface VNCharacter {
    id: VNID;
    name: string;
    color: string;
    fontFamily?: string;
    fontUrl?: string; // Custom TTF/OTF font file URL
    fontSize?: number; // Font size override
    fontWeight?: 'normal' | 'bold';
    fontItalic?: boolean;
    baseImageUrl?: string | null;
    baseVideoUrl?: string | null;
    isBaseVideo?: boolean;
    baseVideoLoop?: boolean;
    layers: Record<VNID, VNCharacterLayer>;
    expressions: Record<VNID, VNCharacterExpression>;
}
