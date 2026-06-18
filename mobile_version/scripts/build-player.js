#!/usr/bin/env node

/**
 * Build Standalone Player
 * 
 * This script takes an exported project ZIP file and creates a
 * standalone HTML5 game that can be distributed and played in any browser.
 * 
 * Usage:
 *   node build-player.js --input game_export.zip [--output dist/]
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

const inputFile = inputIndex !== -1 ? args[inputIndex + 1] : null;
const outputDir = outputIndex !== -1 ? args[outputIndex + 1] : 'dist';

if (!inputFile) {
    console.error('❌ Error: --input parameter is required');
    console.log('\nUsage:');
    console.log('  node build-player.js --input game_export.zip [--output dist/]');
    process.exit(1);
}

if (!fs.existsSync(inputFile)) {
    console.error(`❌ Error: Input file not found: ${inputFile}`);
    process.exit(1);
}

console.log('🎮 Building Standalone Visual Novel Player\n');
console.log(`📦 Input:  ${inputFile}`);
console.log(`📁 Output: ${outputDir}\n`);

async function build() {
    try {
        // Step 1: Create output directory
        console.log('📁 Creating output directory...');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

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
        
        console.log(`   ✓ Found project: ${project.title}`);

        // Step 3: Extract assets
        console.log('🖼️  Extracting assets...');
        const assetsDir = path.join(outputDir, 'assets');
        if (!fs.existsSync(assetsDir)) {
            fs.mkdirSync(assetsDir, { recursive: true });
        }

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

        // Step 4: Build the game engine bundle
        console.log('⚙️  Building game engine...');
        console.log('   (This may take a minute...)');
        
        // Use vite to build a standalone player bundle
        await execAsync('npm run build:standalone');
        
        console.log('   ✓ Game engine built');

        // Step 5: Read the built files
        console.log('📝 Assembling standalone player...');
        
        const distDir = path.join(__dirname, '..', 'dist-standalone');
        const gameJsPath = path.join(distDir, 'game-engine.js');
        
        if (!fs.existsSync(gameJsPath)) {
            throw new Error('Built game-engine.js not found. Build may have failed.');
        }
        
        const gameJs = fs.readFileSync(gameJsPath, 'utf8');

        // Step 6: Create the standalone HTML
        const templatePath = path.join(__dirname, '..', 'player-template.html');
        let html = fs.readFileSync(templatePath, 'utf8');
        
        // Inject the project data
        html = html.replace('__PROJECT_DATA__', JSON.stringify(project, null, 2));
        
        // Inject the game engine code
        html = html.replace('__GAME_ENGINE_CODE__', gameJs);
        
        // Note: standalone build currently inlines CSS into the JS bundle.
        
        // Update title
        html = html.replace('<title>Visual Novel - Loading...</title>', `<title>${project.title}</title>`);
        
        // Write the final HTML
        const outputHtmlPath = path.join(outputDir, 'index.html');
        fs.writeFileSync(outputHtmlPath, html);
        
        console.log('   ✓ Standalone player created');

        // Step 7: Copy any additional files needed
        console.log('📋 Finalizing...');
        
        // Create a README for the distribution
        const readmePath = path.join(outputDir, 'README.txt');
        const readme = `${project.title}
${'='.repeat(project.title.length)}

To play this game:
1. Open index.html in any modern web browser
2. Or upload all files to a web server

For best experience:
- Use Chrome, Firefox, or Safari (latest version)
- Enable JavaScript
- Allow audio autoplay in browser settings

This game was created with the Flourish Visual Novel Engine.

Enjoy!
`;
        fs.writeFileSync(readmePath, readme);

        // Done!
        console.log('\n✅ Build complete!\n');
        console.log(`📁 Output directory: ${path.resolve(outputDir)}`);
        console.log(`🎮 To play: Open ${path.join(outputDir, 'index.html')} in a browser\n`);
        
        // Calculate total size
        const calculateSize = (dir) => {
            let size = 0;
            const files = fs.readdirSync(dir, { withFileTypes: true });
            for (const file of files) {
                const filePath = path.join(dir, file.name);
                if (file.isDirectory()) {
                    size += calculateSize(filePath);
                } else {
                    size += fs.statSync(filePath).size;
                }
            }
            return size;
        };
        
        const totalSize = calculateSize(outputDir);
        const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
        console.log(`📊 Total size: ${sizeMB} MB`);
        console.log('\n💡 Distribution tips:');
        console.log('   - ZIP the dist folder to upload to itch.io');
        console.log('   - Upload to web hosting for online play');
        console.log('   - Share index.html directly for local play\n');

    } catch (error) {
        console.error('\n❌ Build failed:');
        console.error(error.message);
        process.exit(1);
    }
}

build();
