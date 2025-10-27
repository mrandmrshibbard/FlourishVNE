import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project data
const project = {
  "id": "proj-sample-char-custom",
  "title": "Character Customization Sample",
  "startSceneId": "scene-start",
  "scenes": {
    "scene-start": {
      "id": "scene-start",
      "name": "Start Scene",
      "commands": []
    }
  },
  "characters": {
    "char-player": {
      "id": "char-player",
      "name": "Player Character",
      "color": "#FFFFFF",
      "baseImageUrl": "",
      "layers": {
        "layer-body": {
          "id": "layer-body",
          "name": "body",
          "zIndex": 0,
          "assets": {
            "asset-fem-brown": {
              "id": "asset-fem-brown",
              "name": "body_fem_brown",
              "imageUrl": "assets/characters/char-player/layer-body/asset-fem-brown_body_fem_brown.png"
            },
            "asset-fem-mixed": {
              "id": "asset-fem-mixed",
              "name": "body_fem_mixed",
              "imageUrl": "assets/characters/char-player/layer-body/asset-fem-mixed_body_fem_mixed.png"
            },
            "asset-fem-tan": {
              "id": "asset-fem-tan",
              "name": "body_fem_tan",
              "imageUrl": "assets/characters/char-player/layer-body/asset-fem-tan_body_fem_tan.png"
            },
            "asset-fem-white": {
              "id": "asset-fem-white",
              "name": "body_fem_white",
              "imageUrl": "assets/characters/char-player/layer-body/asset-fem-white_body_fem_white.png"
            },
            "asset-masc-brown": {
              "id": "asset-masc-brown",
              "name": "body_masc_brown",
              "imageUrl": "assets/characters/char-player/layer-body/asset-masc-brown_body_masc_brown.png"
            },
            "asset-masc-mixed": {
              "id": "asset-masc-mixed",
              "name": "body_masc_mixed",
              "imageUrl": "assets/characters/char-player/layer-body/asset-masc-mixed_body_masc_mixed.png"
            },
            "asset-masc-tan": {
              "id": "asset-masc-tan",
              "name": "body_masc_tan",
              "imageUrl": "assets/characters/char-player/layer-body/asset-masc-tan_body_masc_tan.png"
            },
            "asset-masc-white": {
              "id": "asset-masc-white",
              "name": "body_masc_white",
              "imageUrl": "assets/characters/char-player/layer-body/asset-masc-white_body_masc_white.png"
            }
          }
        }
      },
      "expressions": {},
      "defaultExpression": ""
    }
  },
  "backgrounds": {},
  "images": {},
  "audio": {},
  "videos": {},
  "variables": {
    "var-body-type": {
      "id": "var-body-type",
      "name": "body_type",
      "type": "string",
      "initialValue": ""
    },
    "var-skin-color": {
      "id": "var-skin-color",
      "name": "skin_color",
      "type": "string",
      "initialValue": ""
    },
    "var-result": {
      "id": "var-result",
      "name": "body_result",
      "type": "string",
      "initialValue": ""
    }
  },
  "ui": {
    "titleScreenId": "screen-title",
    "pauseScreenId": "screen-pause",
    "settingsScreenId": "screen-settings",
    "saveLoadScreenId": "screen-saveload",
    "gameHudScreenId": "",
    "dialogueBoxImage": "",
    "choiceButtonImage": "",
    "dialogueNameFont": "",
    "dialogueTextFont": "",
    "choiceTextFont": ""
  },
  "uiScreens": {
    "screen-title": {
      "id": "screen-title",
      "name": "Title Screen",
      "backgroundImage": "",
      "elements": [
        {
          "type": "button",
          "id": "elem-start-btn",
          "label": "Start Game",
          "x": 50,
          "y": 50,
          "width": 200,
          "height": 60,
          "backgroundColor": "#4A90E2",
          "textColor": "#FFFFFF",
          "fontSize": 24,
          "actions": [
            {
              "type": "GoToScreen",
              "targetScreenId": "screen-custom"
            }
          ]
        }
      ]
    },
    "screen-custom": {
      "id": "screen-custom",
      "name": "Character Customization",
      "backgroundImage": "",
      "elements": [
        {
          "type": "text",
          "id": "elem-title",
          "text": "Character Customization",
          "x": 50,
          "y": 20,
          "fontSize": 32,
          "textColor": "#FFFFFF"
        },
        {
          "type": "text",
          "id": "elem-body-label",
          "text": "Body Type:",
          "x": 50,
          "y": 100,
          "fontSize": 20,
          "textColor": "#FFFFFF"
        },
        {
          "type": "assetCycler",
          "id": "elem-body-cycler",
          "label": "",
          "x": 50,
          "y": 140,
          "width": 300,
          "height": 80,
          "backgroundColor": "rgba(30, 41, 59, 0.8)",
          "characterId": "char-player",
          "layerId": "layer-body",
          "variableId": "var-body-type",
          "assetIds": ["asset-fem-brown", "asset-masc-brown"],
          "filterVariableIds": [],
          "filterPattern": ""
        },
        {
          "type": "text",
          "id": "elem-skin-label",
          "text": "Skin Color:",
          "x": 50,
          "y": 240,
          "fontSize": 20,
          "textColor": "#FFFFFF"
        },
        {
          "type": "assetCycler",
          "id": "elem-skin-cycler",
          "label": "",
          "x": 50,
          "y": 280,
          "width": 300,
          "height": 80,
          "backgroundColor": "rgba(30, 41, 59, 0.8)",
          "characterId": "char-player",
          "layerId": "layer-body",
          "variableId": "var-skin-color",
          "assetIds": ["asset-fem-brown", "asset-fem-mixed", "asset-fem-tan", "asset-fem-white"],
          "filterVariableIds": [],
          "filterPattern": ""
        },
        {
          "type": "text",
          "id": "elem-result-label",
          "text": "Result (Auto-Filtered):",
          "x": 50,
          "y": 380,
          "fontSize": 20,
          "textColor": "#FFFFFF"
        },
        {
          "type": "assetCycler",
          "id": "elem-result-cycler",
          "label": "",
          "x": 50,
          "y": 420,
          "width": 300,
          "height": 80,
          "backgroundColor": "rgba(30, 41, 59, 0.8)",
          "characterId": "char-player",
          "layerId": "layer-body",
          "variableId": "var-result",
          "assetIds": [
            "asset-fem-brown",
            "asset-fem-mixed",
            "asset-fem-tan",
            "asset-fem-white",
            "asset-masc-brown",
            "asset-masc-mixed",
            "asset-masc-tan",
            "asset-masc-white"
          ],
          "filterVariableIds": ["var-body-type", "var-skin-color"],
          "filterPattern": "{[1]}_{[2]}"
        },
        {
          "type": "characterPreview",
          "id": "elem-preview",
          "characterId": "char-player",
          "x": 450,
          "y": 100,
          "width": 400,
          "height": 600,
          "backgroundColor": "rgba(0, 0, 0, 0.5)",
          "layerVariableMap": {
            "layer-body": "var-result"
          }
        },
        {
          "type": "button",
          "id": "elem-done-btn",
          "label": "Done",
          "x": 50,
          "y": 550,
          "width": 150,
          "height": 50,
          "backgroundColor": "#4A90E2",
          "textColor": "#FFFFFF",
          "fontSize": 20,
          "actions": [
            {
              "type": "CloseScreen"
            }
          ]
        }
      ]
    },
    "screen-pause": {
      "id": "screen-pause",
      "name": "Pause Screen",
      "backgroundImage": "",
      "elements": []
    },
    "screen-settings": {
      "id": "screen-settings",
      "name": "Settings",
      "backgroundImage": "",
      "elements": []
    },
    "screen-saveload": {
      "id": "screen-saveload",
      "name": "Save/Load",
      "backgroundImage": "",
      "elements": []
    }
  }
};

// Manifest data
const manifest = {
  "schemaVersion": 1,
  "exportedAt": new Date().toISOString(),
  "project": {
    "id": "proj-sample-char-custom",
    "title": "Character Customization Sample"
  },
  "embedded": {
    "backgrounds": [],
    "images": [],
    "audio": [],
    "videos": [],
    "characters": [
      "assets/characters/char-player/layer-body/asset-fem-brown_body_fem_brown.png",
      "assets/characters/char-player/layer-body/asset-fem-mixed_body_fem_mixed.png",
      "assets/characters/char-player/layer-body/asset-fem-tan_body_fem_tan.png",
      "assets/characters/char-player/layer-body/asset-fem-white_body_fem_white.png",
      "assets/characters/char-player/layer-body/asset-masc-brown_body_masc_brown.png",
      "assets/characters/char-player/layer-body/asset-masc-mixed_body_masc_mixed.png",
      "assets/characters/char-player/layer-body/asset-masc-tan_body_masc_tan.png",
      "assets/characters/char-player/layer-body/asset-masc-white_body_masc_white.png"
    ],
    "ui": []
  },
  "fetchFailures": []
};

// Create the zip
const rootDir = path.join(__dirname, '..');
const output = fs.createWriteStream(path.join(rootDir, 'character_customization_sample_export.zip'));
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`✓ Created character_customization_sample_export.zip (${archive.pointer()} bytes)`);
  console.log('✓ Import this file in Flourish VNE to test the character customization system');
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

// Add project.json
archive.append(JSON.stringify(project, null, 2), { name: 'project.json' });

// Add manifest.json
archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

// Add character sprite assets
const spriteMappings = [
  { src: 'public/Sprites/Body Type2/Skin types2/body_fem_brown.png', dest: 'assets/characters/char-player/layer-body/asset-fem-brown_body_fem_brown.png' },
  { src: 'public/Sprites/Body Type2/Skin types2/body_fem_mixed.png', dest: 'assets/characters/char-player/layer-body/asset-fem-mixed_body_fem_mixed.png' },
  { src: 'public/Sprites/Body Type2/Skin types2/body_fem_tan.png', dest: 'assets/characters/char-player/layer-body/asset-fem-tan_body_fem_tan.png' },
  { src: 'public/Sprites/Body Type2/Skin types2/body_fem_white.png', dest: 'assets/characters/char-player/layer-body/asset-fem-white_body_fem_white.png' },
  { src: 'public/Sprites/Body Type1/Skin types1/body_masc_brown.png', dest: 'assets/characters/char-player/layer-body/asset-masc-brown_body_masc_brown.png' },
  { src: 'public/Sprites/Body Type1/Skin types1/body_masc_mixed.png', dest: 'assets/characters/char-player/layer-body/asset-masc-mixed_body_masc_mixed.png' },
  { src: 'public/Sprites/Body Type1/Skin types1/body_masc_tan.png', dest: 'assets/characters/char-player/layer-body/asset-masc-tan_body_masc_tan.png' },
  { src: 'public/Sprites/Body Type1/Skin types1/body_masc_white.png', dest: 'assets/characters/char-player/layer-body/asset-masc-white_body_masc_white.png' }
];

spriteMappings.forEach(({ src, dest }) => {
  const fullPath = path.join(rootDir, src);
  if (fs.existsSync(fullPath)) {
    archive.file(fullPath, { name: dest });
    console.log(`Added: ${src} -> ${dest}`);
  } else {
    console.warn(`Warning: ${fullPath} not found`);
  }
});

archive.finalize();
