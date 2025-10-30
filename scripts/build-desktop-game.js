#!/usr/bin/env node

/**
 * Build Desktop Game Application
 * 
 * This script takes an exported project ZIP file and creates a
 * standalone desktop application with file system save support.
 * 
 * Usage:
 *   node build-desktop-game.js --input game_export.zip --name "My Game" [--output builds/]
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Parse command line arguments
const args = process.argv.slice(2);
const inputIndex = args.indexOf('--input');
const outputIndex = args.indexOf('--output');
const nameIndex = args.indexOf('--name');

const inputFile = inputIndex !== -1 ? args[inputIndex + 1] : null;
const outputDir = outputIndex !== -1 ? args[outputIndex + 1] : 'game-builds';
const gameName = nameIndex !== -1 ? args[nameIndex + 1] : 'My Visual Novel';

if (!inputFile) {
    console.error('❌ Error: --input parameter is required');
    console.log('\nUsage:');
    console.log('  node build-desktop-game.js --input game_export.zip --name "My Game" [--output builds/]');
    process.exit(1);
}

if (!fs.existsSync(inputFile)) {
    console.error(`❌ Error: Input file not found: ${inputFile}`);
    process.exit(1);
}

console.log('🎮 Building Desktop Game Application\n');
console.log(`📦 Input:  ${inputFile}`);
console.log(`🎯 Name:   ${gameName}`);
console.log(`📁 Output: ${outputDir}\n`);

async function build() {
    try {
        // Step 1: Create temporary build directory
        console.log('📁 Setting up build environment...');
        const tempDir = path.join(outputDir, '.temp-build');
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        fs.mkdirSync(tempDir, { recursive: true });

        // Step 2: Extract the export ZIP
        console.log('📦 Extracting project data...');
        const JSZip = require('jszip');
        const zipData = fs.readFileSync(inputFile);
        const zip = await JSZip.loadAsync(zipData);
        
        // Extract project.json
        const projectFile = zip.file('project.json');
        if (!projectFile) {
            throw new Error('project.json not found in export ZIP');
        }
        const projectData = await projectFile.async('string');
        const project = JSON.parse(projectData);
        
        console.log(`   ✓ Project: ${project.title}`);

        // Step 3: Create game structure
        const gameDir = path.join(tempDir, 'game');
        fs.mkdirSync(gameDir, { recursive: true });
        
        // Save project data
        fs.writeFileSync(
            path.join(gameDir, 'project.json'),
            projectData
        );

        // Step 4: Extract assets
        console.log('🖼️  Extracting game assets...');
        const assetsDir = path.join(gameDir, 'assets');
        fs.mkdirSync(assetsDir, { recursive: true });

        let assetCount = 0;
        const assetPromises = [];

        zip.folder('assets').forEach((relativePath, file) => {
            if (!file.dir) {
                assetCount++;
                const outputPath = path.join(assetsDir, relativePath.replace('assets/', ''));
                const outputDirPath = path.dirname(outputPath);
                
                if (!fs.existsSync(outputDirPath)) {
                    fs.mkdirSync(outputDirPath, { recursive: true });
                }
                
                assetPromises.push(
                    file.async('nodebuffer').then(content => {
                        fs.writeFileSync(outputPath, content);
                    })
                );
            }
        });

        await Promise.all(assetPromises);
        console.log(`   ✓ Extracted ${assetCount} assets`);

        // Step 5: Copy game engine bundle
        console.log('⚙️  Copying game engine...');
        const engineSource = path.join(__dirname, '../dist-standalone/game-engine.js');
        if (!fs.existsSync(engineSource)) {
            console.log('   ⚠️  Game engine not found, building...');
            await execAsync('npm run build:engine');
        }
        fs.copyFileSync(engineSource, path.join(gameDir, 'game-engine.js'));
        console.log('   ✓ Game engine ready');

        // Step 6: Create game HTML
        console.log('📄 Creating game index.html...');
        const gameHtml = createGameHTML(project);
        fs.writeFileSync(path.join(gameDir, 'index.html'), gameHtml);

        // Step 7: Create Electron main process
        console.log('⚡ Creating Electron configuration...');
        createElectronMain(tempDir, gameName);
        createElectronPreload(tempDir);
        
        // Step 8: Create package.json for the game
        createGamePackageJson(tempDir, gameName, project);

        // Step 9: Install dependencies
        console.log('📦 Installing Electron dependencies...');
        await execAsync('npm install --production', { cwd: tempDir });

        // Step 10: Build the Electron app
        console.log('🔨 Building desktop application...');
        console.log('   This may take a few minutes...\n');
        
        const builderConfig = createElectronBuilderConfig(gameName);
        fs.writeFileSync(
            path.join(tempDir, 'electron-builder.json'),
            JSON.stringify(builderConfig, null, 2)
        );

        await execAsync('npx electron-builder --config electron-builder.json --win --x64', { 
            cwd: tempDir,
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        });

        // Step 11: Move output and cleanup
        console.log('📦 Finalizing build...');
        const outputPath = path.join(outputDir, gameName);
        if (fs.existsSync(outputPath)) {
            fs.rmSync(outputPath, { recursive: true, force: true });
        }
        
        const distPath = path.join(tempDir, 'dist');
        if (fs.existsSync(distPath)) {
            fs.renameSync(distPath, outputPath);
        }

        // Cleanup temp directory
        fs.rmSync(tempDir, { recursive: true, force: true });

        console.log('\n✅ Desktop game build complete!\n');
        console.log(`📁 Output: ${outputPath}`);
        console.log(`🎮 Executable: ${path.join(outputPath, gameName + '.exe')}`);
        console.log('\n💾 Features:');
        console.log('   • File system save support');
        console.log('   • Native desktop window');
        console.log('   • Standalone executable');
        console.log('   • No internet required\n');

    } catch (error) {
        console.error('\n❌ Build failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

function createGameHTML(project) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${project.title}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0a0a0a;
            color: white;
            overflow: hidden;
        }
        
        #game-container {
            width: 100vw;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        #loading {
            text-align: center;
        }
        
        #loading h1 {
            font-size: 2rem;
            margin-bottom: 1rem;
        }
        
        .spinner {
            width: 50px;
            height: 50px;
            margin: 0 auto;
            border: 4px solid rgba(255, 255, 255, 0.1);
            border-left-color: #fff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div id="game-container">
        <div id="loading">
            <h1>${project.title}</h1>
            <div class="spinner"></div>
            <p style="margin-top: 1rem;">Loading...</p>
        </div>
    </div>
    
    <script src="game-engine.js"></script>
    <script>
        // Load project data
        fetch('project.json')
            .then(res => res.json())
            .then(projectData => {
                // Initialize game engine
                document.getElementById('loading').style.display = 'none';
                window.initializeGame(projectData);
            })
            .catch(error => {
                console.error('Failed to load game:', error);
                document.getElementById('loading').innerHTML = 
                    '<h1>Error Loading Game</h1><p>' + error.message + '</p>';
            });
    </script>
</body>
</html>`;
}

function createElectronMain(tempDir, gameName) {
    const mainJs = `const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
const userDataPath = app.getPath('userData');
const savesDir = path.join(userDataPath, 'saves');

// Ensure saves directory exists
if (!fs.existsSync(savesDir)) {
    fs.mkdirSync(savesDir, { recursive: true });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: '#0a0a0a',
        title: '${gameName}',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        autoHideMenuBar: true,
        show: false
    });

    mainWindow.loadFile(path.join(__dirname, 'game/index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.maximize();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// IPC Handlers for save system
ipcMain.handle('save-game', async (event, saveData) => {
    try {
        const { slot, data } = saveData;
        const savePath = path.join(savesDir, \`save-\${slot}.json\`);
        fs.writeFileSync(savePath, JSON.stringify(data, null, 2));
        return { success: true };
    } catch (error) {
        console.error('Save failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('load-game', async (event, slot) => {
    try {
        const savePath = path.join(savesDir, \`save-\${slot}.json\`);
        if (!fs.existsSync(savePath)) {
            return { success: false, error: 'Save file not found' };
        }
        const data = JSON.parse(fs.readFileSync(savePath, 'utf8'));
        return { success: true, data };
    } catch (error) {
        console.error('Load failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('list-saves', async () => {
    try {
        const files = fs.readdirSync(savesDir);
        const saves = files
            .filter(f => f.startsWith('save-') && f.endsWith('.json'))
            .map(f => {
                const slot = parseInt(f.match(/save-(\\d+)\\.json/)[1]);
                const savePath = path.join(savesDir, f);
                const stats = fs.statSync(savePath);
                const data = JSON.parse(fs.readFileSync(savePath, 'utf8'));
                return {
                    slot,
                    timestamp: stats.mtime,
                    preview: data.preview || {}
                };
            })
            .sort((a, b) => b.timestamp - a.timestamp);
        return { success: true, saves };
    } catch (error) {
        console.error('List saves failed:', error);
        return { success: false, error: error.message, saves: [] };
    }
});

ipcMain.handle('delete-save', async (event, slot) => {
    try {
        const savePath = path.join(savesDir, \`save-\${slot}.json\`);
        if (fs.existsSync(savePath)) {
            fs.unlinkSync(savePath);
        }
        return { success: true };
    } catch (error) {
        console.error('Delete save failed:', error);
        return { success: false, error: error.message };
    }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
`;

    fs.writeFileSync(path.join(tempDir, 'main.js'), mainJs);
}

function createElectronPreload(tempDir) {
    const preloadJs = `const { contextBridge, ipcRenderer } = require('electron');

// Expose save system API to renderer
contextBridge.exposeInMainWorld('saveAPI', {
    saveGame: (slot, data) => ipcRenderer.invoke('save-game', { slot, data }),
    loadGame: (slot) => ipcRenderer.invoke('load-game', slot),
    listSaves: () => ipcRenderer.invoke('list-saves'),
    deleteSave: (slot) => ipcRenderer.invoke('delete-save', slot),
    isElectron: true
});
`;

    fs.writeFileSync(path.join(tempDir, 'preload.js'), preloadJs);
}

function createGamePackageJson(tempDir, gameName, project) {
    const packageJson = {
        name: gameName.toLowerCase().replace(/\s+/g, '-'),
        version: "1.0.0",
        description: project.description || "A visual novel game",
        main: "main.js",
        author: project.author || "Game Developer",
        license: "MIT",
        dependencies: {
            "electron": "^28.3.3"
        }
    };

    fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
    );
}

function createElectronBuilderConfig(gameName) {
    return {
        appId: `com.game.${gameName.toLowerCase().replace(/\s+/g, '')}`,
        productName: gameName,
        directories: {
            output: "dist"
        },
        files: [
            "main.js",
            "preload.js",
            "game/**/*",
            "package.json"
        ],
        win: {
            target: "nsis",
            icon: "game/assets/icon.ico"
        },
        nsis: {
            oneClick: false,
            allowToChangeInstallationDirectory: true,
            createDesktopShortcut: true,
            createStartMenuShortcut: true
        }
    };
}

// Run the build
build();
