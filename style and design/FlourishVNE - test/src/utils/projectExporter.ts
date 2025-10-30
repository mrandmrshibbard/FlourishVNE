/**
 * Project Exporter Utility
 * Exports projects as Blob for desktop builds
 */

import JSZip from 'jszip';
import { VNProject } from '../types/project';

export async function exportProjectAsBlob(project: VNProject): Promise<Blob> {
    if (!project) {
        throw new Error('A valid project object must be provided for export.');
    }

    const zip = new JSZip();
    const projectClone = JSON.parse(JSON.stringify(project)) as VNProject;
    const assetFolder = zip.folder('assets');
    if (!assetFolder) throw new Error("Could not create assets folder in zip");

    // Add project.json
    zip.file('project.json', JSON.stringify(projectClone, null, 2));

    // Process and add assets
    const processedAssetIds = new Set<string>();

    // Helper to add assets to zip
    const addAsset = async (url: string, assetPath: string) => {
        if (!url || processedAssetIds.has(url)) return;
        processedAssetIds.add(url);

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch: ${url}`);
            
            const blob = await response.blob();
            assetFolder.file(assetPath, blob);
        } catch (error) {
            console.warn(`Failed to add asset: ${url}`, error);
        }
    };

    // Collect all assets from characters
    if (project.characters) {
        for (const character of Object.values(project.characters)) {
            for (const layer of Object.values((character as any).layers || {})) {
                for (const option of Object.values((layer as any).options || {})) {
                    if ((option as any).imageUrl) {
                        const filename = (option as any).imageUrl.split('/').pop() || `asset_${Date.now()}.png`;
                        await addAsset((option as any).imageUrl, `characters/${filename}`);
                    }
                }
            }
        }
    }

    // Collect assets from backgrounds
    if (project.backgrounds) {
        for (const bg of Object.values(project.backgrounds)) {
            if ((bg as any).url) {
                const filename = (bg as any).url.split('/').pop() || `bg_${Date.now()}.png`;
                await addAsset((bg as any).url, `backgrounds/${filename}`);
            }
        }
    }

    // Collect assets from audio
    if (project.audio) {
        for (const audio of Object.values(project.audio)) {
            if ((audio as any).url) {
                const filename = (audio as any).url.split('/').pop() || `audio_${Date.now()}.mp3`;
                await addAsset((audio as any).url, `audio/${filename}`);
            }
        }
    }

    // Generate the blob
    const content = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
    });

    return content;
}
