/**
 * Game Bundler - Browser-based game packaging
 * Creates standalone, distributable HTML5 games entirely in the browser
 * NO command line or Node.js required!
 */

import JSZip from 'jszip';
import { VNProject } from '../types/project';
import { getGameEngineCode } from './gameEngineBundle';

export interface BuildProgress {
  step: string;
  progress: number; // 0-100
  message: string;
}

export type ProgressCallback = (progress: BuildProgress) => void;

/**
 * Bundles the entire game into a single downloadable ZIP file
 * that can be uploaded directly to itch.io or any web host
 */
export async function buildStandaloneGame(
  project: VNProject,
  onProgress?: ProgressCallback
): Promise<Blob> {
  const zip = new JSZip();

  // Step 1: Prepare project data (10%)
  onProgress?.({
    step: 'prepare',
    progress: 10,
    message: 'Preparing game data...'
  });

  const projectData = JSON.stringify(project, null, 2);

  // Step 2: Generate game files (30%)
  onProgress?.({
    step: 'generate',
    progress: 30,
    message: 'Generating game files...'
  });

  // Create the standalone HTML file
  const htmlContent = generateStandaloneHTML(project);
  zip.file('index.html', htmlContent);

  // Step 3: Copy all assets (50%)
  onProgress?.({
    step: 'assets',
    progress: 50,
    message: 'Bundling assets...'
  });

  // Create assets directory and copy all referenced assets
  const assetsFolder = zip.folder('assets');
  if (!assetsFolder) throw new Error('Failed to create assets folder');

  const assetUrls = collectAllAssets(project);
  let assetCount = 0;
  
  for (const [name, dataUrl] of Object.entries(assetUrls)) {
    assetCount++;
    const progressPercent = 50 + (assetCount / Object.keys(assetUrls).length) * 30;
    
    onProgress?.({
      step: 'assets',
      progress: progressPercent,
      message: `Copying asset ${assetCount}/${Object.keys(assetUrls).length}...`
    });

    // Convert data URL to blob
    if (dataUrl.startsWith('data:')) {
      const blob = dataURLToBlob(dataUrl);
      assetsFolder.file(name, blob);
    }
  }

  // Step 4: Add README for players (90%)
  onProgress?.({
    step: 'finalize',
    progress: 90,
    message: 'Creating player guide...'
  });

  const readmeContent = generatePlayerReadme(project);
  zip.file('README.txt', readmeContent);

  // Step 5: Generate final ZIP (100%)
  onProgress?.({
    step: 'complete',
    progress: 100,
    message: 'Building game package...'
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  return blob;
}

/**
 * Generates a self-contained HTML file with the game engine embedded
 */
export function generateStandaloneHTML(project: VNProject): string {
  // Inline the minimal game engine code
  const gameEngineCode = getMinimalGameEngine();
  const projectData = JSON.stringify(project);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(project.title || 'Visual Novel')}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: #000;
      overflow: hidden;
    }
    
    #game-container {
      width: 100vw;
      height: 100vh;
      position: relative;
      overflow: hidden;
    }
    
    #loading-screen {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      transition: opacity 0.5s;
    }
    
    #loading-screen.hidden {
      opacity: 0;
      pointer-events: none;
    }
    
    .spinner {
      width: 50px;
      height: 50px;
      border: 4px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .loading-text {
      color: white;
      margin-top: 20px;
      font-size: 18px;
    }
    
    .error-screen {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: #1a1a1a;
      color: white;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      text-align: center;
    }
    
    .error-screen.visible {
      display: flex;
    }
    
    /* CSS Variables and Theme */
    :root {
      --bg-primary: #1a102c;
      --bg-secondary: #2a1a45;
      --bg-tertiary: #4D3273;
      --accent-pink: #ff00a5;
      --accent-cyan: #00f2ea;
      --accent-purple: #8a2be2;
      --text-primary: #f0e6ff;
      --text-secondary: #c0b4d4;
      --font-heading: 'Pacifico', cursive;
      --font-body: 'Poppins', sans-serif;
    }
    
    /* Animations */
    @keyframes shake {
      0%, 100% { transform: translate(0, 0); }
      25% { transform: translate(var(--shake-intensity-x, 5px), var(--shake-intensity-y, 5px)); }
      50% { transform: translate(calc(-1 * var(--shake-intensity-x, 5px)), calc(-1 * var(--shake-intensity-y, 5px))); }
      75% { transform: translate(var(--shake-intensity-x, 5px), calc(-1 * var(--shake-intensity-y, 5px))); }
    }
    .shake {
      animation: shake 0.2s ease-in-out infinite;
    }
    
    /* Transition Animations */
    @keyframes dissolve-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes fade-out { from { opacity: 1; } to { opacity: 0; } }

    @keyframes iris-in {
      from { clip-path: circle(0%); }
      to { clip-path: circle(150%); }
    }

    @keyframes iris-out {
      from { clip-path: circle(150%); }
      to { clip-path: circle(0%); }
    }

    @keyframes wipe-right {
      from { clip-path: polygon(0 0, 0 0, 0 100%, 0% 100%); }
      to { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }
    }

    @keyframes wipe-out-right {
      from { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }
      to { clip-path: polygon(100% 0, 100% 0, 100% 100%, 100% 100%); }
    }
    
    @keyframes slide-in-left {
      from { transform: translateX(var(--slide-start, -100%)) translateY(var(--slide-start-y, 0%)); }
      to { transform: translateX(var(--slide-end, 0)) translateY(var(--slide-end-y, 0%)); }
    }

    @keyframes slide-in-right {
      from { transform: translateX(var(--slide-start, 100%)) translateY(var(--slide-start-y, 0%)); }
      to { transform: translateX(var(--slide-end, 0)) translateY(var(--slide-end-y, 0%)); }
    }

    @keyframes slide-out-left {
      from { transform: translateX(var(--slide-end, 0)) translateY(var(--slide-end-y, 0%)); }
      to { transform: translateX(var(--slide-start, -100%)) translateY(var(--slide-start-y, 0%)); }
    }

    @keyframes slide-out-right {
      from { transform: translateX(var(--slide-end, 0)) translateY(var(--slide-end-y, 0%)); }
      to { transform: translateX(var(--slide-start, 100%)) translateY(var(--slide-start-y, 0%)); }
    }

    @keyframes slide {
      from { 
        transform: translate3d(calc(-50% + var(--slide-start-px, var(--slide-start-x, 0%))), var(--slide-start-py, var(--slide-start-y, 0%)), 0); 
      }
      to { 
        transform: translate3d(calc(-50% + var(--slide-end-px, var(--slide-end-x, 0%))), var(--slide-end-py, var(--slide-end-y, 0%)), 0); 
      }
    }

    @keyframes flash-anim {
      0%, 100% { opacity: 0; }
      50% { opacity: 0.9; }
    }

    .transition-base {
      animation-duration: 1s;
      animation-fill-mode: forwards;
    }
    .transition-fast {
      animation-duration: 0.5s;
    }
    .transition-dissolve { animation-name: dissolve-in; }
    .transition-dissolve-out { animation-name: fade-out; }
    .transition-fade-out { animation-name: fade-out; }
    .transition-iris-in { animation-name: iris-in; }
    .transition-iris-out { animation-name: iris-out; }
    .transition-wipe-right { animation-name: wipe-right; }
    .transition-wipe-out-right { animation-name: wipe-out-right; }
    .transition-slide-in-right { animation-name: slide-in-right; }
    .transition-slide-in-left { animation-name: slide-in-left; }
    .transition-slide-out-left { animation-name: slide-out-left; }
    .transition-slide-out-right { animation-name: slide-out-right; }
    .transition-slide { animation-name: slide; }

    @keyframes scroll-up {
      from { transform: translateY(100%); }
      to { transform: translateY(-100%); }
    }
    .credits-scroll {
      animation: scroll-up 20s linear forwards;
    }
    
    /* Range Input Styling */
    input[type=range] {
      -webkit-appearance: none;
      appearance: none;
      background: transparent;
      cursor: pointer;
      width: 100%;
    }
    input[type=range]:focus {
      outline: none;
    }
    /* Thumb - default styling */
    input[type=range]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      margin-top: -6px;
      background-color: var(--slider-thumb-color, var(--accent-pink));
      height: 20px;
      width: 20px;
      border-radius: 99px;
    }
    input[type=range]::-moz-range-thumb {
      border: none;
      border-radius: 99px;
      background-color: var(--slider-thumb-color, var(--accent-pink));
      height: 20px;
      width: 20px;
    }
    /* Track - default styling */
    input[type=range]::-webkit-slider-runnable-track {
      background-color: var(--slider-track-color, var(--bg-tertiary));
      border-radius: 0.5rem;
      height: 8px;
    }
    input[type=range]::-moz-range-track {
      background-color: var(--slider-track-color, var(--bg-tertiary));
      border-radius: 0.5rem;
      height: 8px;
    }
    
    /* Custom slider with images */
    input[type=range].custom-slider::-webkit-slider-thumb {
      background-image: var(--slider-thumb-bg, none);
      background-size: cover;
      background-position: center;
      background-color: var(--slider-thumb-color, var(--accent-pink));
    }
    input[type=range].custom-slider::-moz-range-thumb {
      background-image: var(--slider-thumb-bg, none);
      background-size: cover;
      background-position: center;
      background-color: var(--slider-thumb-color, var(--accent-pink));
    }
    input[type=range].custom-slider::-webkit-slider-runnable-track {
      background-image: var(--slider-track-bg, none);
      background-size: cover;
      background-position: center;
      background-color: var(--slider-track-color, var(--bg-tertiary));
    }
    input[type=range].custom-slider::-moz-range-track {
      background-image: var(--slider-track-bg, none);
      background-size: cover;
      background-position: center;
      background-color: var(--slider-track-color, var(--bg-tertiary));
    }
  </style>
  
  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  
  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Caveat&family=Lato&family=Merriweather&family=Oswald&family=Pacifico&family=Playfair+Display&family=Poppins:ital,wght@0,400;0,700;1,400&family=Roboto&display=swap" rel="stylesheet">
</head>
<body>
  <div id="loading-screen">
    <div class="spinner"></div>
    <div class="loading-text">Loading Game...</div>
  </div>
  
  <div class="error-screen" id="error-screen">
    <h1>🎮 Unable to Start Game</h1>
    <p id="error-message" style="margin-top: 20px;"></p>
    <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; font-size: 16px; cursor: pointer;">
      Retry
    </button>
  </div>
  
  <div id="game-container"></div>

  <!-- React from CDN -->
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  
  <!-- JSX Runtime and React DOM Client for the game engine -->
  <script>
    // Verify React loaded
    if (typeof React === 'undefined') {
      alert('React failed to load! Check your internet connection.');
      throw new Error('React not loaded');
    }
    if (typeof ReactDOM === 'undefined') {
      alert('ReactDOM failed to load! Check your internet connection.');
      throw new Error('ReactDOM not loaded');
    }
    
    console.log('✅ React version:', React.version);
    console.log('✅ ReactDOM available');
    console.log('✅ ReactDOM.createRoot:', typeof ReactDOM.createRoot);
    
    // Provide jsx-runtime for the game engine bundle
    // The new JSX transform expects jsx(type, props, key) where props includes children
    window.jsxRuntime = {
      jsx: (type, props, key) => {
        const { children, ...rest } = props || {};
        return React.createElement(type, { ...rest, key }, children);
      },
      jsxs: (type, props, key) => {
        const { children, ...rest } = props || {};
        return React.createElement(type, { ...rest, key }, children);
      },
      Fragment: React.Fragment
    };
    
    console.log('✅ jsxRuntime configured');
  </script>

  <!-- Game Data -->
  <script>
    window.GAME_PROJECT = ${projectData};
    console.log('✅ Game project data loaded:', window.GAME_PROJECT.title);
  </script>

  <!-- Game Engine -->
  <script>
    try {
      console.log('Loading game engine bundle...');
      ${gameEngineCode}
      console.log('Game engine script executed');
      console.log('window.GameEngine:', window.GameEngine);
      console.log('typeof window.GameEngine:', typeof window.GameEngine);
      if (window.GameEngine) {
        console.log('GameEngine.mount:', window.GameEngine.mount);
        console.log('typeof GameEngine.mount:', typeof window.GameEngine.mount);
      }
    } catch (err) {
      console.error('Error loading game engine:', err);
      document.getElementById('error-screen').classList.add('visible');
      document.getElementById('error-message').textContent = 'Engine load error: ' + err.message;
      throw err;
    }
  </script>

  <!-- Bootstrap -->
  <script>
    (function() {
      try {
        console.log('Bootstrap: Starting game initialization...');
        console.log('React available:', typeof React !== 'undefined');
        console.log('ReactDOM available:', typeof ReactDOM !== 'undefined');
        console.log('GameEngine (var):', typeof GameEngine !== 'undefined');
        console.log('window.GameEngine:', typeof window.GameEngine !== 'undefined');
        console.log('GAME_PROJECT available:', typeof window.GAME_PROJECT !== 'undefined');
        
        const container = document.getElementById('game-container');
        const loadingScreen = document.getElementById('loading-screen');
        
        if (typeof React === 'undefined') {
          throw new Error('React library failed to load from CDN. Check your internet connection.');
        }
        
        if (typeof ReactDOM === 'undefined') {
          throw new Error('ReactDOM library failed to load from CDN. Check your internet connection.');
        }
        
        // The bundle exports GameEngine as a module property
        // Check both window.GameEngine and window.GameEngine.GameEngine
        let gameEngine;
        if (window.GameEngine && window.GameEngine.GameEngine) {
          // It's the Module object, get the actual GameEngine from it
          gameEngine = window.GameEngine.GameEngine;
          console.log('Found GameEngine in Module.GameEngine');
        } else if (window.GameEngine && typeof window.GameEngine.mount === 'function') {
          // It's the actual GameEngine object
          gameEngine = window.GameEngine;
          console.log('Found GameEngine directly on window');
        } else {
          throw new Error('Game engine failed to load. The bundle may be corrupted.');
        }
        
        if (typeof gameEngine.mount !== 'function') {
          throw new Error('GameEngine.mount is not a function. Bundle may be incorrect.');
        }
        
        if (!window.GAME_PROJECT) {
          throw new Error('Game data is missing');
        }
        
        console.log('All dependencies loaded successfully');
        console.log('GameEngine:', gameEngine);
        console.log('GameEngine.mount:', gameEngine.mount);
        console.log('Mounting game engine...');
        
        // Initialize game using the resolved gameEngine
        gameEngine.mount(container, window.GAME_PROJECT);
        
        console.log('Game mounted successfully');
        
        // Hide loading screen
        setTimeout(() => {
          loadingScreen.classList.add('hidden');
        }, 500);
        
      } catch (error) {
        console.error('Game initialization error:', error);
        document.getElementById('error-screen').classList.add('visible');
        document.getElementById('error-message').textContent = error.message;
        document.getElementById('loading-screen').classList.add('hidden');
      }
    })();
  </script>
</body>
</html>`;
}

/**
 * Returns the embedded game engine code
 * This uses the pre-built standalone game engine bundle
 */
function getMinimalGameEngine(): string {
  // Load the pre-built game engine (generated by npm run build:engine)
  return getGameEngineCode();
}

/**
 * Collects all asset URLs from the project
 * Returns a map of filename -> data URL
 */
export function collectAllAssets(project: VNProject): Record<string, string> {
  const assets: Record<string, string> = {};
  let assetCounter = 0;

  const addAsset = (url: string | undefined, prefix: string) => {
    if (!url || !url.startsWith('data:')) return;
    
    const extension = getExtensionFromDataURL(url);
    const filename = `${prefix}_${++assetCounter}${extension}`;
    assets[filename] = url;
  };

  // Collect backgrounds
  Object.values(project.backgrounds || {}).forEach(bg => {
    addAsset(bg.imageUrl, 'bg');
    addAsset(bg.videoUrl, 'bg');
  });

  // Collect images
  Object.values(project.images || {}).forEach(img => {
    addAsset(img.imageUrl, 'img');
    addAsset(img.videoUrl, 'img');
  });

  // Collect character sprites
  Object.values(project.characters || {}).forEach(char => {
    addAsset(char.baseImageUrl, `char_${char.id}`);
    addAsset(char.baseVideoUrl, `char_${char.id}`);
    addAsset(char.fontUrl, `char_${char.id}_font`);
    
    // Collect layer assets
    Object.values(char.layers || {}).forEach(layer => {
      Object.values(layer.assets || {}).forEach(asset => {
        addAsset(asset.imageUrl, `char_${char.id}_layer`);
        addAsset(asset.videoUrl, `char_${char.id}_layer`);
      });
    });
  });

  // Collect audio
  Object.values(project.audio || {}).forEach(audio => {
    addAsset(audio.audioUrl, 'audio');
  });

  // Collect videos
  Object.values(project.videos || {}).forEach(video => {
    addAsset(video.videoUrl, 'video');
  });

  // Collect dialogue box and choice button assets
  if (project.ui.dialogueBoxImage) {
    const assetId = project.ui.dialogueBoxImage.id;
    if (project.ui.dialogueBoxImage.type === 'image') {
      const bg = project.backgrounds?.[assetId] || project.images?.[assetId];
      if (bg) addAsset(bg.imageUrl || bg.videoUrl, 'ui');
    } else if (project.ui.dialogueBoxImage.type === 'video') {
      const video = project.videos?.[assetId];
      if (video) addAsset(video.videoUrl, 'ui');
    }
  }
  
  if (project.ui.choiceButtonImage) {
    const assetId = project.ui.choiceButtonImage.id;
    if (project.ui.choiceButtonImage.type === 'image') {
      const bg = project.backgrounds?.[assetId] || project.images?.[assetId];
      if (bg) addAsset(bg.imageUrl || bg.videoUrl, 'ui');
    } else if (project.ui.choiceButtonImage.type === 'video') {
      const video = project.videos?.[assetId];
      if (video) addAsset(video.videoUrl, 'ui');
    }
  }

  // Collect UI screens and elements
  Object.values(project.uiScreens || {}).forEach(screen => {
    Object.values(screen.elements || {}).forEach(element => {
      // Check for image/video assets in UI elements
      if ('image' in element && element.image) {
        // UIButtonElement or UIImageElement with asset
        const assetId = element.image.id;
        if (element.image.type === 'image') {
          const imageAsset = project.images?.[assetId];
          if (imageAsset) {
            addAsset(imageAsset.imageUrl, 'ui');
            addAsset(imageAsset.videoUrl, 'ui');
          }
        } else if (element.image.type === 'video') {
          const videoAsset = project.videos?.[assetId];
          if (videoAsset) {
            addAsset(videoAsset.videoUrl, 'ui');
          }
        }
      }
      if ('hoverImage' in element && element.hoverImage) {
        const assetId = element.hoverImage.id;
        if (element.hoverImage.type === 'image') {
          const imageAsset = project.images?.[assetId];
          if (imageAsset) {
            addAsset(imageAsset.imageUrl, 'ui');
            addAsset(imageAsset.videoUrl, 'ui');
          }
        }
      }
      // Slider images
      if ('thumbImage' in element && element.thumbImage) {
        const assetId = element.thumbImage.id;
        if (element.thumbImage.type === 'image') {
          const bg = project.backgrounds?.[assetId] || project.images?.[assetId];
          if (bg) addAsset(bg.imageUrl || bg.videoUrl, 'ui');
        } else if (element.thumbImage.type === 'video') {
          const video = project.videos?.[assetId];
          if (video) addAsset(video.videoUrl, 'ui');
        }
      }
      if ('trackImage' in element && element.trackImage) {
        const assetId = element.trackImage.id;
        if (element.trackImage.type === 'image') {
          const bg = project.backgrounds?.[assetId] || project.images?.[assetId];
          if (bg) addAsset(bg.imageUrl || bg.videoUrl, 'ui');
        } else if (element.trackImage.type === 'video') {
          const video = project.videos?.[assetId];
          if (video) addAsset(video.videoUrl, 'ui');
        }
      }
      // Toggle checkbox images
      if ('checkedImage' in element && element.checkedImage) {
        const assetId = element.checkedImage.id;
        if (element.checkedImage.type === 'image') {
          const bg = project.backgrounds?.[assetId] || project.images?.[assetId];
          if (bg) addAsset(bg.imageUrl || bg.videoUrl, 'ui');
        } else if (element.checkedImage.type === 'video') {
          const video = project.videos?.[assetId];
          if (video) addAsset(video.videoUrl, 'ui');
        }
      }
      if ('uncheckedImage' in element && element.uncheckedImage) {
        const assetId = element.uncheckedImage.id;
        if (element.uncheckedImage.type === 'image') {
          const bg = project.backgrounds?.[assetId] || project.images?.[assetId];
          if (bg) addAsset(bg.imageUrl || bg.videoUrl, 'ui');
        } else if (element.uncheckedImage.type === 'video') {
          const video = project.videos?.[assetId];
          if (video) addAsset(video.videoUrl, 'ui');
        }
      }
    });
  });

  return assets;
}

/**
 * Converts a data URL to a Blob
 */
export function dataURLToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const bstr = atob(parts[1]);
  const n = bstr.length;
  const u8arr = new Uint8Array(n);
  
  for (let i = 0; i < n; i++) {
    u8arr[i] = bstr.charCodeAt(i);
  }
  
  return new Blob([u8arr], { type: mime });
}

/**
 * Gets file extension from data URL
 */
function getExtensionFromDataURL(dataUrl: string): string {
  const mimeMatch = dataUrl.match(/data:(.*?);/);
  if (!mimeMatch) return '.bin';
  
  const mime = mimeMatch[1];
  const extensionMap: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav'
  };
  
  return extensionMap[mime] || '.bin';
}

/**
 * Generates a README file for players
 */
function generatePlayerReadme(project: VNProject): string {
  return `${project.title || 'Visual Novel Game'}

HOW TO PLAY:
============

ONLINE:
1. Upload the entire folder to itch.io, Netlify, or any web host
2. Make sure index.html and the assets/ folder are together
3. Share the URL with players!

OFFLINE:
1. Open index.html in any modern web browser
2. Chrome, Firefox, Safari, or Edge recommended
3. No installation needed!

CONTROLS:
=========
- Click or press SPACE to advance dialogue
- Use UI buttons for choices and navigation
- Press F11 for fullscreen (recommended)

REQUIREMENTS:
=============
- Modern web browser (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- JavaScript enabled
- Internet connection (first load only, for React library)

TROUBLESHOOTING:
================
- If the game doesn't load, make sure all files are in the same folder
- Check that your browser allows JavaScript
- Try a different browser if issues persist

---
Created with Flourish Visual Novel Engine
Visit https://github.com/your-repo for more information
`;
}

/**
 * Escapes HTML special characters
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Downloads a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Estimates the size of the final build in MB
 */
export function estimateBuildSize(project: VNProject): number {
  const projectJson = JSON.stringify(project);
  const jsonSize = new Blob([projectJson]).size;
  
  // Estimate asset sizes
  let assetSize = 0;
  const assets = collectAllAssets(project);
  Object.values(assets).forEach(dataUrl => {
    // Base64 is ~33% larger than binary, so divide by 1.33
    const base64Length = dataUrl.split(',')[1]?.length || 0;
    assetSize += base64Length / 1.33;
  });
  
  // Add ~500KB for game engine code
  const engineSize = 500 * 1024;
  
  const totalBytes = jsonSize + assetSize + engineSize;
  const totalMB = totalBytes / (1024 * 1024);
  
  return Math.ceil(totalMB * 10) / 10; // Round to 1 decimal
}
