var GameEngine = (function(exports, jsxRuntime2, React2, ReactDOM2) {
  "use strict";
  const projectReducer = (state, action) => {
    switch (action.type) {
      case "SET_PROJECT":
        return action.payload;
      case "UPDATE_PROJECT_TITLE": {
        return {
          ...state,
          title: action.payload.title
        };
      }
      default:
        if (action && action.type && !action.type.startsWith("UPDATE_PROJECT_")) {
          return state;
        }
        return state;
    }
  };
  var CommandType = /* @__PURE__ */ ((CommandType2) => {
    CommandType2["Dialogue"] = "Dialogue";
    CommandType2["SetBackground"] = "SetBackground";
    CommandType2["ShowCharacter"] = "ShowCharacter";
    CommandType2["HideCharacter"] = "HideCharacter";
    CommandType2["Choice"] = "Choice";
    CommandType2["BranchStart"] = "BranchStart";
    CommandType2["BranchEnd"] = "BranchEnd";
    CommandType2["SetVariable"] = "SetVariable";
    CommandType2["TextInput"] = "TextInput";
    CommandType2["Jump"] = "Jump";
    CommandType2["Label"] = "Label";
    CommandType2["JumpToLabel"] = "JumpToLabel";
    CommandType2["PlayMusic"] = "PlayMusic";
    CommandType2["StopMusic"] = "StopMusic";
    CommandType2["PlaySoundEffect"] = "PlaySoundEffect";
    CommandType2["PlayMovie"] = "PlayMovie";
    CommandType2["Wait"] = "Wait";
    CommandType2["ShakeScreen"] = "ShakeScreen";
    CommandType2["TintScreen"] = "TintScreen";
    CommandType2["PanZoomScreen"] = "PanZoomScreen";
    CommandType2["ResetScreenEffects"] = "ResetScreenEffects";
    CommandType2["FlashScreen"] = "FlashScreen";
    CommandType2["ShowScreen"] = "ShowScreen";
    CommandType2["ShowText"] = "ShowText";
    CommandType2["ShowImage"] = "ShowImage";
    CommandType2["HideText"] = "HideText";
    CommandType2["HideImage"] = "HideImage";
    CommandType2["ShowButton"] = "ShowButton";
    CommandType2["HideButton"] = "HideButton";
    CommandType2["Group"] = "Group";
    return CommandType2;
  })(CommandType || {});
  const assetReducer = (state, action) => {
    switch (action.type) {
      case "ADD_ASSET": {
        const { assetType, asset } = action.payload;
        console.log("[assetReducer] ADD_ASSET:", { assetType, assetId: asset.id, assetName: asset.name });
        console.log("[assetReducer] Current state[assetType]:", state[assetType]);
        const newState = {
          ...state,
          [assetType]: {
            ...state[assetType],
            [asset.id]: asset
          }
        };
        console.log("[assetReducer] New state[assetType]:", newState[assetType]);
        return newState;
      }
      case "UPDATE_ASSET": {
        const { assetType, assetId, updates } = action.payload;
        const asset = state[assetType][assetId];
        if (!asset) return state;
        return {
          ...state,
          [assetType]: {
            ...state[assetType],
            [assetId]: { ...asset, ...updates }
          }
        };
      }
      case "DELETE_ASSET": {
        const { assetType, assetId } = action.payload;
        const { [assetId]: _, ...remainingAssets } = state[assetType];
        const fallbackId = Object.keys(remainingAssets)[0];
        let newState = { ...state, [assetType]: remainingAssets };
        if (fallbackId) {
          const newScenes = JSON.parse(JSON.stringify(state.scenes));
          for (const sceneId in newScenes) {
            newScenes[sceneId].commands = newScenes[sceneId].commands.map((cmd) => {
              if (assetType === "backgrounds" && cmd.type === CommandType.SetBackground && cmd.backgroundId === assetId) {
                return { ...cmd, backgroundId: fallbackId };
              }
              if (assetType === "images" && cmd.type === CommandType.ShowImage && cmd.imageId === assetId) {
                return { ...cmd, imageId: fallbackId };
              }
              if (assetType === "images" && cmd.type === CommandType.SetBackground && cmd.backgroundId === assetId) {
                return { ...cmd, backgroundId: fallbackId };
              }
              if (assetType === "audio" && (cmd.type === CommandType.PlayMusic || cmd.type === CommandType.PlaySoundEffect) && cmd.audioId === assetId) {
                return { ...cmd, audioId: fallbackId };
              }
              if (assetType === "videos" && cmd.type === CommandType.PlayMovie && cmd.videoId === assetId) {
                return { ...cmd, videoId: fallbackId };
              }
              return cmd;
            });
          }
          newState.scenes = newScenes;
        }
        return newState;
      }
      default:
        return state;
    }
  };
  const generateId$4 = () => Math.random().toString(36).substring(2, 9);
  const characterReducer = (state, action) => {
    var _a;
    switch (action.type) {
      case "ADD_CHARACTER": {
        const { name, color } = action.payload;
        const newId = `char-${generateId$4()}`;
        const newExprId = `expr-${generateId$4()}`;
        const newExpression = { id: newExprId, name: "Default", layerConfiguration: {} };
        const newCharacter = {
          id: newId,
          name,
          color,
          baseImageUrl: null,
          layers: {},
          expressions: { [newExprId]: newExpression }
        };
        return {
          ...state,
          characters: {
            ...state.characters,
            [newId]: newCharacter
          }
        };
      }
      case "DELETE_CHARACTER": {
        const { characterId } = action.payload;
        const { [characterId]: _, ...remaining } = state.characters;
        const fallbackId = Object.keys(remaining)[0];
        const newScenes = JSON.parse(JSON.stringify(state.scenes));
        for (const sceneId in newScenes) {
          newScenes[sceneId].commands = newScenes[sceneId].commands.map((cmd) => {
            if (cmd.type === CommandType.Dialogue && cmd.characterId === characterId) {
              return { ...cmd, characterId: null };
            }
            if ((cmd.type === CommandType.ShowCharacter || cmd.type === CommandType.HideCharacter) && cmd.characterId === characterId) {
              if (fallbackId) {
                return { ...cmd, characterId: fallbackId };
              }
            }
            return cmd;
          }).filter(Boolean);
        }
        return {
          ...state,
          characters: remaining,
          scenes: newScenes
        };
      }
      case "UPDATE_CHARACTER": {
        const { characterId, updates } = action.payload;
        const character = state.characters[characterId];
        if (!character) return state;
        const updatedCharacter = { ...character, ...updates };
        return {
          ...state,
          characters: {
            ...state.characters,
            [characterId]: updatedCharacter
          }
        };
      }
      case "ADD_CHARACTER_LAYER": {
        const { characterId, name } = action.payload;
        const character = state.characters[characterId];
        if (!character) return state;
        const newLayerId = `layer-${generateId$4()}`;
        const newLayer = { id: newLayerId, name, assets: {} };
        const newLayers = { ...character.layers, [newLayerId]: newLayer };
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, layers: newLayers } } };
      }
      case "UPDATE_CHARACTER_LAYER": {
        const { characterId, layerId, name } = action.payload;
        const character = state.characters[characterId];
        if (!(character == null ? void 0 : character.layers[layerId])) return state;
        const updatedLayer = { ...character.layers[layerId], name };
        const newLayers = { ...character.layers, [layerId]: updatedLayer };
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, layers: newLayers } } };
      }
      case "DELETE_CHARACTER_LAYER": {
        const { characterId, layerId } = action.payload;
        const character = state.characters[characterId];
        if (!character) return state;
        const { [layerId]: _, ...remainingLayers } = character.layers;
        const newExpressions = { ...character.expressions };
        for (const exprId in newExpressions) {
          delete newExpressions[exprId].layerConfiguration[layerId];
        }
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, layers: remainingLayers, expressions: newExpressions } } };
      }
      case "ADD_LAYER_ASSET": {
        const { characterId, layerId, name, imageUrl, videoUrl, isVideo, loop, autoplay } = action.payload;
        const character = state.characters[characterId];
        if (!(character == null ? void 0 : character.layers[layerId])) return state;
        const newAssetId = `asset-${generateId$4()}`;
        const newAsset = {
          id: newAssetId,
          name,
          imageUrl,
          videoUrl,
          isVideo,
          loop,
          autoplay
        };
        const newAssets = { ...character.layers[layerId].assets, [newAssetId]: newAsset };
        const newLayers = { ...character.layers, [layerId]: { ...character.layers[layerId], assets: newAssets } };
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, layers: newLayers } } };
      }
      case "DELETE_LAYER_ASSET": {
        const { characterId, layerId, assetId } = action.payload;
        const character = state.characters[characterId];
        if (!((_a = character == null ? void 0 : character.layers[layerId]) == null ? void 0 : _a.assets[assetId])) return state;
        const { [assetId]: _, ...remainingAssets } = character.layers[layerId].assets;
        const newLayers = { ...character.layers, [layerId]: { ...character.layers[layerId], assets: remainingAssets } };
        const newExpressions = { ...character.expressions };
        for (const exprId in newExpressions) {
          if (newExpressions[exprId].layerConfiguration[layerId] === assetId) {
            newExpressions[exprId].layerConfiguration[layerId] = null;
          }
        }
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, layers: newLayers, expressions: newExpressions } } };
      }
      case "ADD_EXPRESSION": {
        const { characterId, name } = action.payload;
        const character = state.characters[characterId];
        if (!character) return state;
        const newExprId = `expr-${generateId$4()}`;
        const newExpression = { id: newExprId, name, layerConfiguration: {} };
        Object.keys(character.layers).forEach((layerId) => {
          newExpression.layerConfiguration[layerId] = null;
        });
        const newExpressions = { ...character.expressions, [newExprId]: newExpression };
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, expressions: newExpressions } } };
      }
      case "UPDATE_EXPRESSION": {
        const { characterId, expressionId, updates } = action.payload;
        const character = state.characters[characterId];
        if (!(character == null ? void 0 : character.expressions[expressionId])) return state;
        const newExpression = { ...character.expressions[expressionId], ...updates };
        const newExpressions = { ...character.expressions, [expressionId]: newExpression };
        return { ...state, characters: { ...state.characters, [characterId]: { ...character, expressions: newExpressions } } };
      }
      case "DELETE_EXPRESSION": {
        const { characterId, expressionId } = action.payload;
        const character = state.characters[characterId];
        if (!character) return state;
        const { [expressionId]: _, ...remainingExpressions } = character.expressions;
        const newScenes = JSON.parse(JSON.stringify(state.scenes));
        const firstExprId = Object.keys(remainingExpressions)[0];
        for (const sceneId in newScenes) {
          newScenes[sceneId].commands.forEach((cmd) => {
            if (cmd.type === CommandType.ShowCharacter && cmd.expressionId === expressionId) {
              cmd.expressionId = firstExprId || "";
            }
          });
        }
        return { ...state, scenes: newScenes, characters: { ...state.characters, [characterId]: { ...character, expressions: remainingExpressions } } };
      }
      default:
        return state;
    }
  };
  var UIActionType = /* @__PURE__ */ ((UIActionType2) => {
    UIActionType2["None"] = "None";
    UIActionType2["StartNewGame"] = "StartNewGame";
    UIActionType2["GoToScreen"] = "GoToScreen";
    UIActionType2["LoadGame"] = "LoadGame";
    UIActionType2["SaveGame"] = "SaveGame";
    UIActionType2["ReturnToGame"] = "ReturnToGame";
    UIActionType2["ReturnToPreviousScreen"] = "ReturnToPreviousScreen";
    UIActionType2["QuitToTitle"] = "QuitToTitle";
    UIActionType2["ExitGame"] = "ExitGame";
    UIActionType2["JumpToScene"] = "JumpToScene";
    UIActionType2["JumpToLabel"] = "JumpToLabel";
    UIActionType2["SetVariable"] = "SetVariable";
    UIActionType2["CycleLayerAsset"] = "CycleLayerAsset";
    UIActionType2["ToggleScreen"] = "ToggleScreen";
    return UIActionType2;
  })(UIActionType || {});
  const generateId$3 = () => Math.random().toString(36).substring(2, 9);
  const sceneReducer = (state, action) => {
    switch (action.type) {
      case "ADD_SCENE": {
        const newId = `scene-${generateId$3()}`;
        const newScene = { id: newId, name: action.payload.name, commands: [] };
        return {
          ...state,
          scenes: { ...state.scenes, [newId]: newScene }
        };
      }
      case "UPDATE_SCENE": {
        const { sceneId, name } = action.payload;
        return {
          ...state,
          scenes: { ...state.scenes, [sceneId]: { ...state.scenes[sceneId], name } }
        };
      }
      case "UPDATE_SCENE_CONFIG": {
        const { sceneId, updates } = action.payload;
        return {
          ...state,
          scenes: { ...state.scenes, [sceneId]: { ...state.scenes[sceneId], ...updates } }
        };
      }
      case "DELETE_SCENE": {
        const { sceneId } = action.payload;
        if (Object.keys(state.scenes).length <= 1) return state;
        const { [sceneId]: _, ...remainingScenes } = state.scenes;
        let newStartSceneId = state.startSceneId;
        if (state.startSceneId === sceneId) {
          newStartSceneId = Object.keys(remainingScenes)[0] || "";
        }
        for (const sId in remainingScenes) {
          remainingScenes[sId].commands = remainingScenes[sId].commands.map((cmd) => {
            if (cmd.type === CommandType.Jump && cmd.targetSceneId === sceneId) {
              return { ...cmd, targetSceneId: newStartSceneId };
            }
            if (cmd.type === CommandType.Choice) {
              const choiceCmd = cmd;
              const newOptions = choiceCmd.options.map((opt) => {
                if (opt.targetSceneId === sceneId) {
                  return { ...opt, targetSceneId: newStartSceneId };
                }
                if (opt.actions) {
                  const newActions = opt.actions.map((action2) => {
                    if (action2.type === UIActionType.JumpToScene && action2.targetSceneId === sceneId) {
                      return { ...action2, targetSceneId: newStartSceneId };
                    }
                    return action2;
                  });
                  return { ...opt, actions: newActions };
                }
                return opt;
              });
              return { ...cmd, options: newOptions };
            }
            return cmd;
          });
        }
        return {
          ...state,
          scenes: remainingScenes,
          startSceneId: newStartSceneId
        };
      }
      case "DUPLICATE_SCENE": {
        const { sceneId } = action.payload;
        const originalScene = state.scenes[sceneId];
        if (!originalScene) return state;
        const newId = `scene-${generateId$3()}`;
        const duplicatedScene = {
          ...originalScene,
          id: newId,
          name: `${originalScene.name} (Copy)`,
          commands: originalScene.commands.map((cmd) => ({ ...cmd, id: `cmd-${generateId$3()}` }))
        };
        return {
          ...state,
          scenes: { ...state.scenes, [newId]: duplicatedScene }
        };
      }
      case "REORDER_SCENES": {
        const { sceneIds } = action.payload;
        const newScenes = {};
        sceneIds.forEach((id) => {
          if (state.scenes[id]) {
            newScenes[id] = state.scenes[id];
          }
        });
        return {
          ...state,
          scenes: newScenes
        };
      }
      case "SET_START_SCENE": {
        return { ...state, startSceneId: action.payload.sceneId };
      }
      case "UPDATE_SCENE_COMMANDS": {
        const { sceneId, commands } = action.payload;
        return {
          ...state,
          scenes: {
            ...state.scenes,
            [sceneId]: {
              ...state.scenes[sceneId],
              commands
            }
          }
        };
      }
      case "ADD_COMMAND": {
        const { sceneId, command } = action.payload;
        const scene = state.scenes[sceneId];
        const newCommands = [...scene.commands, { ...command, id: `cmd-${generateId$3()}` }];
        return {
          ...state,
          scenes: { ...state.scenes, [sceneId]: { ...scene, commands: newCommands } }
        };
      }
      case "UPDATE_COMMAND": {
        const { sceneId, commandIndex, command } = action.payload;
        const scene = state.scenes[sceneId];
        const newCommands = [...scene.commands];
        newCommands[commandIndex] = command;
        return {
          ...state,
          scenes: { ...state.scenes, [sceneId]: { ...scene, commands: newCommands } }
        };
      }
      case "DELETE_COMMAND": {
        const { sceneId, commandIndex } = action.payload;
        const scene = state.scenes[sceneId];
        const commandToDelete = scene.commands[commandIndex];
        if ((commandToDelete == null ? void 0 : commandToDelete.type) === CommandType.BranchStart) {
          const branchCmd = commandToDelete;
          const branchEndIndex = scene.commands.findIndex(
            (cmd, i) => i > commandIndex && cmd.type === CommandType.BranchEnd && cmd.branchId === branchCmd.branchId
          );
          if (branchEndIndex !== -1) {
            const newCommands2 = scene.commands.filter(
              (_, i) => i !== commandIndex && i !== branchEndIndex
            );
            return {
              ...state,
              scenes: { ...state.scenes, [sceneId]: { ...scene, commands: newCommands2 } }
            };
          }
        }
        if ((commandToDelete == null ? void 0 : commandToDelete.type) === CommandType.BranchEnd) {
          return state;
        }
        const newCommands = scene.commands.filter((_, index) => index !== commandIndex);
        return {
          ...state,
          scenes: { ...state.scenes, [sceneId]: { ...scene, commands: newCommands } }
        };
      }
      case "MOVE_COMMAND": {
        const { sceneId, fromIndex, toIndex } = action.payload;
        if (fromIndex === toIndex) return state;
        const scene = state.scenes[sceneId];
        const newCommands = [...scene.commands];
        const movedCommand = newCommands[fromIndex];
        if (movedCommand.type === CommandType.BranchStart) {
          const branchCmd = movedCommand;
          const branchEndIndex = newCommands.findIndex(
            (cmd, i) => i > fromIndex && cmd.type === CommandType.BranchEnd && cmd.branchId === branchCmd.branchId
          );
          if (branchEndIndex !== -1) {
            const branchLength = branchEndIndex - fromIndex + 1;
            const branchCommands = newCommands.splice(fromIndex, branchLength);
            let adjustedToIndex = toIndex;
            if (toIndex > fromIndex) {
              adjustedToIndex -= branchLength;
            }
            newCommands.splice(adjustedToIndex, 0, ...branchCommands);
            return {
              ...state,
              scenes: { ...state.scenes, [sceneId]: { ...scene, commands: newCommands } }
            };
          }
        }
        if (movedCommand.type === CommandType.BranchEnd) {
          return state;
        }
        const [removed] = newCommands.splice(fromIndex, 1);
        newCommands.splice(toIndex, 0, removed);
        return {
          ...state,
          scenes: { ...state.scenes, [sceneId]: { ...scene, commands: newCommands } }
        };
      }
      case "TOGGLE_GROUP_COLLAPSE": {
        const { sceneId, groupId } = action.payload;
        const scene = state.scenes[sceneId];
        const newCommands = scene.commands.map((cmd) => {
          if (cmd.id === groupId && cmd.type === CommandType.Group) {
            return { ...cmd, collapsed: !cmd.collapsed };
          }
          return cmd;
        });
        return {
          ...state,
          scenes: { ...state.scenes, [sceneId]: { ...scene, commands: newCommands } }
        };
      }
      case "ADD_COMMAND_TO_GROUP": {
        const { sceneId, groupId, commandId } = action.payload;
        const scene = state.scenes[sceneId];
        const newCommands = scene.commands.map((cmd) => {
          if (cmd.id === groupId && cmd.type === CommandType.Group) {
            const groupCmd = cmd;
            return { ...groupCmd, commandIds: [...groupCmd.commandIds || [], commandId] };
          }
          return cmd;
        });
        return {
          ...state,
          scenes: { ...state.scenes, [sceneId]: { ...scene, commands: newCommands } }
        };
      }
      case "REMOVE_COMMAND_FROM_GROUP": {
        const { sceneId, groupId, commandId } = action.payload;
        const scene = state.scenes[sceneId];
        const newCommands = scene.commands.map((cmd) => {
          if (cmd.id === groupId && cmd.type === CommandType.Group) {
            const groupCmd = cmd;
            return { ...groupCmd, commandIds: (groupCmd.commandIds || []).filter((id) => id !== commandId) };
          }
          return cmd;
        });
        return {
          ...state,
          scenes: { ...state.scenes, [sceneId]: { ...scene, commands: newCommands } }
        };
      }
      case "RENAME_GROUP": {
        const { sceneId, groupId, name } = action.payload;
        const scene = state.scenes[sceneId];
        const newCommands = scene.commands.map((cmd) => {
          if (cmd.id === groupId && cmd.type === CommandType.Group) {
            const groupCmd = cmd;
            return { ...groupCmd, name };
          }
          return cmd;
        });
        return {
          ...state,
          scenes: { ...state.scenes, [sceneId]: { ...scene, commands: newCommands } }
        };
      }
      case "REORDER_COMMANDS_IN_GROUP": {
        const { sceneId, groupId, commandIds } = action.payload;
        const scene = state.scenes[sceneId];
        const newCommands = scene.commands.map((cmd) => {
          if (cmd.id === groupId && cmd.type === CommandType.Group) {
            const groupCmd = cmd;
            return { ...groupCmd, commandIds };
          }
          return cmd;
        });
        return {
          ...state,
          scenes: { ...state.scenes, [sceneId]: { ...scene, commands: newCommands } }
        };
      }
      default:
        return state;
    }
  };
  var UIElementType = /* @__PURE__ */ ((UIElementType2) => {
    UIElementType2["Button"] = "Button";
    UIElementType2["Text"] = "Text";
    UIElementType2["Image"] = "Image";
    UIElementType2["SaveSlotGrid"] = "SaveSlotGrid";
    UIElementType2["SettingsSlider"] = "SettingsSlider";
    UIElementType2["SettingsToggle"] = "SettingsToggle";
    UIElementType2["CharacterPreview"] = "CharacterPreview";
    UIElementType2["TextInput"] = "TextInput";
    UIElementType2["Dropdown"] = "Dropdown";
    UIElementType2["Checkbox"] = "Checkbox";
    UIElementType2["AssetCycler"] = "AssetCycler";
    return UIElementType2;
  })(UIElementType || {});
  const generateId$2 = (prefix) => `${prefix}-${Math.random().toString(36).substring(2, 9)}`;
  const createDefaultUIScreens = () => {
    const titleScreenId = generateId$2("screen");
    const saveScreenId = generateId$2("screen");
    const loadScreenId = generateId$2("screen");
    const settingsScreenId = generateId$2("screen");
    const pauseScreenId = generateId$2("screen");
    const defaultFont = { family: "Poppins, sans-serif", size: 24, color: "#f0e6ff", weight: "normal", italic: false };
    const titleFont = { family: "Poppins, sans-serif", size: 64, color: "#f0e6ff", weight: "bold", italic: false };
    const headerFont = { family: "Poppins, sans-serif", size: 48, color: "#f0e6ff", weight: "bold", italic: false };
    const titleScreenElements = {};
    const titleTextId = generateId$2("el");
    titleScreenElements[titleTextId] = { id: titleTextId, name: "Title Text", type: UIElementType.Text, text: "My Visual Novel", x: 50, y: 30, width: 60, height: 15, anchorX: 0.5, anchorY: 0.5, font: titleFont, textAlign: "center", verticalAlign: "middle" };
    const newGameBtnId = generateId$2("el");
    titleScreenElements[newGameBtnId] = { id: newGameBtnId, name: "New Game Button", type: UIElementType.Button, text: "New Game", x: 50, y: 55, width: 20, height: 8, anchorX: 0.5, anchorY: 0.5, font: defaultFont, action: { type: UIActionType.StartNewGame }, image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null };
    const loadGameBtnId = generateId$2("el");
    titleScreenElements[loadGameBtnId] = { id: loadGameBtnId, name: "Load Game Button", type: UIElementType.Button, text: "Load Game", x: 50, y: 65, width: 20, height: 8, anchorX: 0.5, anchorY: 0.5, font: defaultFont, action: { type: UIActionType.GoToScreen, targetScreenId: loadScreenId }, image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null };
    const settingsBtnId = generateId$2("el");
    titleScreenElements[settingsBtnId] = { id: settingsBtnId, name: "Settings Button", type: UIElementType.Button, text: "Settings", x: 50, y: 75, width: 20, height: 8, anchorX: 0.5, anchorY: 0.5, font: defaultFont, action: { type: UIActionType.GoToScreen, targetScreenId: settingsScreenId }, image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null };
    const saveScreenElements = {};
    const saveHeaderId = generateId$2("el");
    saveScreenElements[saveHeaderId] = { id: saveHeaderId, name: "Header", type: UIElementType.Text, text: "Save Game", x: 50, y: 10, width: 60, height: 10, anchorX: 0.5, anchorY: 0.5, font: headerFont, textAlign: "center", verticalAlign: "middle" };
    const saveGridId = generateId$2("el");
    saveScreenElements[saveGridId] = { id: saveGridId, name: "Save Slots", type: UIElementType.SaveSlotGrid, slotCount: 8, font: defaultFont, emptySlotText: "[ Empty Slot ]", x: 50, y: 50, width: 80, height: 65, anchorX: 0.5, anchorY: 0.5 };
    const saveBackBtnId = generateId$2("el");
    saveScreenElements[saveBackBtnId] = { id: saveBackBtnId, name: "Back Button", type: UIElementType.Button, text: "Back", x: 50, y: 90, width: 20, height: 8, anchorX: 0.5, anchorY: 0.5, font: defaultFont, action: { type: UIActionType.ReturnToPreviousScreen }, image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null };
    const loadScreenElements = {};
    const loadHeaderId = generateId$2("el");
    loadScreenElements[loadHeaderId] = { id: loadHeaderId, name: "Header", type: UIElementType.Text, text: "Load Game", x: 50, y: 10, width: 60, height: 10, anchorX: 0.5, anchorY: 0.5, font: headerFont, textAlign: "center", verticalAlign: "middle" };
    const loadGridId = generateId$2("el");
    loadScreenElements[loadGridId] = { id: loadGridId, name: "Load Slots", type: UIElementType.SaveSlotGrid, slotCount: 8, font: defaultFont, emptySlotText: "[ Empty Slot ]", x: 50, y: 50, width: 80, height: 65, anchorX: 0.5, anchorY: 0.5 };
    const loadBackBtnId = generateId$2("el");
    loadScreenElements[loadBackBtnId] = { id: loadBackBtnId, name: "Back Button", type: UIElementType.Button, text: "Back", x: 50, y: 90, width: 20, height: 8, anchorX: 0.5, anchorY: 0.5, font: defaultFont, action: { type: UIActionType.ReturnToPreviousScreen }, image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null };
    const settingsScreenElements = {};
    const settingsHeaderId = generateId$2("el");
    settingsScreenElements[settingsHeaderId] = { id: settingsHeaderId, name: "Header", type: UIElementType.Text, text: "Settings", x: 50, y: 10, width: 60, height: 10, anchorX: 0.5, anchorY: 0.5, font: headerFont, textAlign: "center", verticalAlign: "middle" };
    const musicLabelId = generateId$2("el");
    settingsScreenElements[musicLabelId] = { id: musicLabelId, name: "Music Volume Label", type: UIElementType.Text, text: "Music Volume", x: 35, y: 30, width: 20, height: 5, anchorX: 0.5, anchorY: 0.5, font: defaultFont, textAlign: "left", verticalAlign: "middle" };
    const musicSliderId = generateId$2("el");
    settingsScreenElements[musicSliderId] = { id: musicSliderId, name: "Music Volume Slider", type: UIElementType.SettingsSlider, setting: "musicVolume", x: 65, y: 30, width: 40, height: 5, anchorX: 0.5, anchorY: 0.5 };
    const sfxLabelId = generateId$2("el");
    settingsScreenElements[sfxLabelId] = { id: sfxLabelId, name: "SFX Volume Label", type: UIElementType.Text, text: "Sound FX Volume", x: 35, y: 40, width: 20, height: 5, anchorX: 0.5, anchorY: 0.5, font: defaultFont, textAlign: "left", verticalAlign: "middle" };
    const sfxSliderId = generateId$2("el");
    settingsScreenElements[sfxSliderId] = { id: sfxSliderId, name: "SFX Volume Slider", type: UIElementType.SettingsSlider, setting: "sfxVolume", x: 65, y: 40, width: 40, height: 5, anchorX: 0.5, anchorY: 0.5 };
    const textSpeedLabelId = generateId$2("el");
    settingsScreenElements[textSpeedLabelId] = { id: textSpeedLabelId, name: "Text Speed Label", type: UIElementType.Text, text: "Text Speed", x: 35, y: 50, width: 20, height: 5, anchorX: 0.5, anchorY: 0.5, font: defaultFont, textAlign: "left", verticalAlign: "middle" };
    const textSpeedSliderId = generateId$2("el");
    settingsScreenElements[textSpeedSliderId] = { id: textSpeedSliderId, name: "Text Speed Slider", type: UIElementType.SettingsSlider, setting: "textSpeed", x: 65, y: 50, width: 40, height: 5, anchorX: 0.5, anchorY: 0.5 };
    const skipToggleId = generateId$2("el");
    settingsScreenElements[skipToggleId] = { id: skipToggleId, name: "Enable Skip Toggle", type: UIElementType.SettingsToggle, setting: "enableSkip", text: "Enable Skip", x: 50, y: 60, width: 30, height: 5, anchorX: 0.5, anchorY: 0.5, font: defaultFont };
    const backBtnId = generateId$2("el");
    settingsScreenElements[backBtnId] = { id: backBtnId, name: "Back Button", type: UIElementType.Button, text: "Back", x: 50, y: 85, width: 20, height: 8, anchorX: 0.5, anchorY: 0.5, font: defaultFont, action: { type: UIActionType.ReturnToPreviousScreen }, image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null };
    const pauseScreenElements = {};
    const returnBtnId = generateId$2("el");
    pauseScreenElements[returnBtnId] = { id: returnBtnId, name: "Return Button", type: UIElementType.Button, text: "Return to Game", x: 50, y: 30, width: 30, height: 8, anchorX: 0.5, anchorY: 0.5, font: defaultFont, action: { type: UIActionType.ReturnToGame }, image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null };
    const pauseSaveBtnId = generateId$2("el");
    pauseScreenElements[pauseSaveBtnId] = { id: pauseSaveBtnId, name: "Save Game Button", type: UIElementType.Button, text: "Save Game", x: 50, y: 40, width: 30, height: 8, anchorX: 0.5, anchorY: 0.5, font: defaultFont, action: { type: UIActionType.GoToScreen, targetScreenId: saveScreenId }, image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null };
    const pauseLoadBtnId = generateId$2("el");
    pauseScreenElements[pauseLoadBtnId] = { id: pauseLoadBtnId, name: "Load Game Button", type: UIElementType.Button, text: "Load Game", x: 50, y: 50, width: 30, height: 8, anchorX: 0.5, anchorY: 0.5, font: defaultFont, action: { type: UIActionType.GoToScreen, targetScreenId: loadScreenId }, image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null };
    const pauseSettingsBtnId = generateId$2("el");
    pauseScreenElements[pauseSettingsBtnId] = { id: pauseSettingsBtnId, name: "Settings Button", type: UIElementType.Button, text: "Settings", x: 50, y: 60, width: 30, height: 8, anchorX: 0.5, anchorY: 0.5, font: defaultFont, action: { type: UIActionType.GoToScreen, targetScreenId: settingsScreenId }, image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null };
    const pauseQuitBtnId = generateId$2("el");
    pauseScreenElements[pauseQuitBtnId] = { id: pauseQuitBtnId, name: "Quit Button", type: UIElementType.Button, text: "Quit to Title", x: 50, y: 70, width: 30, height: 8, anchorX: 0.5, anchorY: 0.5, font: defaultFont, action: { type: UIActionType.QuitToTitle }, image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null };
    const screens = {
      [titleScreenId]: {
        id: titleScreenId,
        name: "Title Screen",
        background: { type: "color", value: "#1a102c" },
        music: { audioId: null, policy: "continue" },
        ambientNoise: { audioId: null, policy: "continue" },
        elements: titleScreenElements
      },
      [saveScreenId]: { id: saveScreenId, name: "Save Screen", background: { type: "color", value: "#1a102c" }, music: { audioId: null, policy: "continue" }, ambientNoise: { audioId: null, policy: "continue" }, elements: saveScreenElements },
      [loadScreenId]: { id: loadScreenId, name: "Load Screen", background: { type: "color", value: "#1a102c" }, music: { audioId: null, policy: "continue" }, ambientNoise: { audioId: null, policy: "continue" }, elements: loadScreenElements },
      [settingsScreenId]: {
        id: settingsScreenId,
        name: "Settings Screen",
        background: { type: "color", value: "#1a102c" },
        music: { audioId: null, policy: "continue" },
        ambientNoise: { audioId: null, policy: "continue" },
        elements: settingsScreenElements
      },
      [pauseScreenId]: {
        id: pauseScreenId,
        name: "Pause Menu",
        background: { type: "color", value: "#1a102c" },
        music: { audioId: null, policy: "continue" },
        ambientNoise: { audioId: null, policy: "continue" },
        elements: pauseScreenElements
      }
    };
    const specialIds = { titleScreenId, saveScreenId, loadScreenId, settingsScreenId, pauseScreenId };
    return { screens, specialIds };
  };
  const generateId$1 = () => Math.random().toString(36).substring(2, 9);
  const uiReducer = (state, action) => {
    switch (action.type) {
      case "UPDATE_UI": {
        return {
          ...state,
          ui: {
            ...state.ui,
            ...action.payload
          }
        };
      }
      case "UPDATE_UI_CONFIG": {
        const { key, value } = action.payload;
        return {
          ...state,
          ui: {
            ...state.ui,
            [key]: value
          }
        };
      }
      case "UPDATE_UI_FONT_CONFIG": {
        const { target, property, value } = action.payload;
        return {
          ...state,
          ui: {
            ...state.ui,
            [target]: {
              ...state.ui[target],
              [property]: value
            }
          }
        };
      }
      case "RESTORE_DEFAULT_UI_SCREENS": {
        const { screens: defaultScreens, specialIds } = createDefaultUIScreens();
        return {
          ...state,
          uiScreens: {
            ...state.uiScreens,
            ...defaultScreens
          },
          ui: {
            ...state.ui,
            titleScreenId: specialIds.titleScreenId,
            settingsScreenId: specialIds.settingsScreenId,
            saveScreenId: specialIds.saveScreenId,
            loadScreenId: specialIds.loadScreenId,
            pauseScreenId: specialIds.pauseScreenId
          }
        };
      }
      case "ADD_UI_SCREEN": {
        const { name } = action.payload;
        const newId = `screen-${generateId$1()}`;
        const newScreen = {
          id: newId,
          name,
          background: { type: "color", value: "#0f172a" },
          music: { audioId: null, policy: "continue" },
          ambientNoise: { audioId: null, policy: "continue" },
          elements: {}
        };
        return { ...state, uiScreens: { ...state.uiScreens, [newId]: newScreen } };
      }
      case "UPDATE_UI_SCREEN": {
        const { screenId, updates } = action.payload;
        const screen = state.uiScreens[screenId];
        if (!screen) return state;
        return { ...state, uiScreens: { ...state.uiScreens, [screenId]: { ...screen, ...updates } } };
      }
      case "DELETE_UI_SCREEN": {
        const { screenId } = action.payload;
        const specialScreenIds = [
          state.ui.titleScreenId,
          state.ui.settingsScreenId,
          state.ui.saveScreenId,
          state.ui.loadScreenId,
          state.ui.pauseScreenId
        ];
        if (specialScreenIds.includes(screenId)) {
          console.warn(`Attempted to delete a special UI screen (${screenId}), which is not allowed.`);
          return state;
        }
        const { [screenId]: _, ...remainingScreens } = state.uiScreens;
        const newUiConfig = { ...state.ui };
        let uiConfigChanged = false;
        if (state.ui.titleScreenId === screenId) {
          newUiConfig.titleScreenId = null;
          uiConfigChanged = true;
        }
        if (state.ui.settingsScreenId === screenId) {
          newUiConfig.settingsScreenId = null;
          uiConfigChanged = true;
        }
        if (state.ui.saveScreenId === screenId) {
          newUiConfig.saveScreenId = null;
          uiConfigChanged = true;
        }
        if (state.ui.loadScreenId === screenId) {
          newUiConfig.loadScreenId = null;
          uiConfigChanged = true;
        }
        const cleanedScreens = Object.keys(remainingScreens).reduce((acc, sId) => {
          const screen = remainingScreens[sId];
          let screenModified = false;
          const newElements = Object.keys(screen.elements).reduce((elAcc, elId) => {
            const element = screen.elements[elId];
            if (element.type === UIElementType.Button) {
              const buttonAction = element.action;
              if (buttonAction.type === UIActionType.GoToScreen && buttonAction.targetScreenId === screenId) {
                elAcc[elId] = { ...element, action: { type: UIActionType.None } };
                screenModified = true;
              } else {
                elAcc[elId] = element;
              }
            } else {
              elAcc[elId] = element;
            }
            return elAcc;
          }, {});
          if (screenModified) {
            acc[sId] = { ...screen, elements: newElements };
          } else {
            acc[sId] = screen;
          }
          return acc;
        }, {});
        return {
          ...state,
          uiScreens: cleanedScreens,
          ...uiConfigChanged && { ui: newUiConfig }
        };
      }
      case "DUPLICATE_UI_SCREEN": {
        const { screenId } = action.payload;
        console.log("[DUPLICATE_UI_SCREEN] Duplicating screen:", screenId);
        const originalScreen = state.uiScreens[screenId];
        if (!originalScreen) {
          console.error("[DUPLICATE_UI_SCREEN] Screen not found:", screenId);
          return state;
        }
        const newScreenId = `screen-${generateId$1()}`;
        const newScreen = JSON.parse(JSON.stringify(originalScreen));
        newScreen.id = newScreenId;
        newScreen.name = `Copy of ${originalScreen.name}`;
        const newElements = {};
        for (const element of Object.values(originalScreen.elements)) {
          const newElementId = `elem-${generateId$1()}`;
          newElements[newElementId] = { ...element, id: newElementId };
        }
        newScreen.elements = newElements;
        console.log("[DUPLICATE_UI_SCREEN] Created new screen:", newScreenId, "with name:", newScreen.name);
        return {
          ...state,
          uiScreens: {
            ...state.uiScreens,
            [newScreenId]: newScreen
          }
        };
      }
      case "ADD_UI_ELEMENT": {
        const { screenId, element } = action.payload;
        const screen = state.uiScreens[screenId];
        if (!screen) return state;
        const newElements = { ...screen.elements, [element.id]: element };
        return { ...state, uiScreens: { ...state.uiScreens, [screenId]: { ...screen, elements: newElements } } };
      }
      case "UPDATE_UI_ELEMENT": {
        const { screenId, elementId, updates } = action.payload;
        const screen = state.uiScreens[screenId];
        const element = screen == null ? void 0 : screen.elements[elementId];
        if (!element) return state;
        const newElement = { ...element, ...updates };
        const newElements = { ...screen.elements, [elementId]: newElement };
        return { ...state, uiScreens: { ...state.uiScreens, [screenId]: { ...screen, elements: newElements } } };
      }
      case "DELETE_UI_ELEMENT": {
        const { screenId, elementId } = action.payload;
        const screen = state.uiScreens[screenId];
        if (!screen) return state;
        const { [elementId]: _, ...remainingElements } = screen.elements;
        return { ...state, uiScreens: { ...state.uiScreens, [screenId]: { ...screen, elements: remainingElements } } };
      }
      default:
        return state;
    }
  };
  const generateId = () => Math.random().toString(36).substring(2, 9);
  const variableReducer = (state, action) => {
    switch (action.type) {
      case "ADD_VARIABLE": {
        const newId = `var-${generateId()}`;
        const newVar = { id: newId, name: action.payload.name, type: action.payload.type, defaultValue: action.payload.defaultValue };
        return {
          ...state,
          variables: { ...state.variables, [newId]: newVar }
        };
      }
      case "UPDATE_VARIABLE": {
        const { variableId, updates } = action.payload;
        return {
          ...state,
          variables: { ...state.variables, [variableId]: { ...state.variables[variableId], ...updates } }
        };
      }
      case "DELETE_VARIABLE": {
        const { variableId } = action.payload;
        const { [variableId]: _, ...remainingVars } = state.variables;
        const newScenes = { ...state.scenes };
        for (const sceneId in newScenes) {
          newScenes[sceneId].commands = newScenes[sceneId].commands.filter((cmd) => !(cmd.type === CommandType.SetVariable && cmd.variableId === variableId)).map((cmd) => {
            let newCmd = { ...cmd };
            if (newCmd.conditions) {
              const filteredConditions = newCmd.conditions.filter((c) => c.variableId !== variableId);
              if (filteredConditions.length === 0) {
                delete newCmd.conditions;
              } else {
                newCmd.conditions = filteredConditions;
              }
            }
            if (newCmd.type === CommandType.Choice) {
              const newOptions = newCmd.options.map((opt) => {
                const newOpt = { ...opt };
                if (newOpt.conditions) {
                  newOpt.conditions = newOpt.conditions.filter((c) => c.variableId !== variableId);
                  if (newOpt.conditions.length === 0) {
                    delete newOpt.conditions;
                  }
                }
                if (opt.actions) {
                  const filteredActions = opt.actions.filter((action2) => {
                    if (action2.type === UIActionType.SetVariable) {
                      return action2.variableId !== variableId;
                    }
                    return true;
                  });
                  newOpt.actions = filteredActions;
                }
                return newOpt;
              });
              return { ...newCmd, options: newOptions };
            }
            return newCmd;
          });
        }
        return {
          ...state,
          variables: remainingVars,
          scenes: newScenes
        };
      }
      default:
        return state;
    }
  };
  const reducers = [
    projectReducer,
    assetReducer,
    characterReducer,
    sceneReducer,
    uiReducer,
    variableReducer
  ];
  const rootReducer = (state, action) => {
    for (const reducer of reducers) {
      const newState = reducer(state, action);
      if (newState !== state) {
        return newState;
      }
    }
    return state;
  };
  const ProjectContext = React2.createContext(null);
  const ProjectProvider = ({ children, initialProject }) => {
    const [history, setHistory] = React2.useState({
      past: [],
      present: initialProject,
      future: []
    });
    const dispatchWithHistory = React2.useCallback((action) => {
      setHistory((prev) => {
        const newPresent = rootReducer(prev.present, action);
        if (JSON.stringify(newPresent) === JSON.stringify(prev.present)) {
          return prev;
        }
        return {
          past: [...prev.past.slice(-50 + 1), prev.present],
          present: newPresent,
          future: []
          // Clear future when new action is performed
        };
      });
    }, []);
    const undo = React2.useCallback(() => {
      setHistory((prev) => {
        if (prev.past.length === 0) return prev;
        const newPast = prev.past.slice(0, -1);
        const newPresent = prev.past[prev.past.length - 1];
        return {
          past: newPast,
          present: newPresent,
          future: [prev.present, ...prev.future]
        };
      });
    }, []);
    const redo = React2.useCallback(() => {
      setHistory((prev) => {
        if (prev.future.length === 0) return prev;
        const newFuture = prev.future.slice(1);
        const newPresent = prev.future[0];
        return {
          past: [...prev.past, prev.present],
          present: newPresent,
          future: newFuture
        };
      });
    }, []);
    React2.useEffect(() => {
      const handleKeyDown = (e) => {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
          e.preventDefault();
          undo();
        } else if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === "z" || e.key === "y")) {
          e.preventDefault();
          redo();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [undo, redo]);
    return /* @__PURE__ */ jsxRuntime2.jsx(ProjectContext.Provider, { value: {
      project: history.present,
      dispatch: dispatchWithHistory,
      undo,
      redo,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0
    }, children });
  };
  const useProject = () => {
    const context = React2.useContext(ProjectContext);
    if (!context) {
      throw new Error("useProject must be used within a ProjectProvider");
    }
    return context;
  };
  const getAssetNameFromId = (assetId, project) => {
    const background = project.backgrounds[assetId];
    if (background) return background.name;
    const image = project.images[assetId];
    if (image) return image.name;
    const video = project.videos[assetId];
    if (video) return video.name;
    const audio = project.audio[assetId];
    if (audio) return audio.name;
    for (const character of Object.values(project.characters)) {
      for (const layer of Object.values(character.layers)) {
        const asset = layer.assets[assetId];
        if (asset) return asset.name;
      }
    }
    return null;
  };
  const interpolateVariables = (text, variables, project) => {
    if (!text) return text;
    let result = text.replace(/\{([^}]+)\}/g, (match, placeholder) => {
      const trimmedPlaceholder = placeholder.trim();
      const variableByName = Object.values(project.variables).find((v) => v.name === trimmedPlaceholder);
      if (variableByName) {
        const value = variables[variableByName.id];
        if (value !== void 0) {
          const stringValue = String(value);
          if (stringValue.startsWith("asset-")) {
            const assetName = getAssetNameFromId(stringValue, project);
            return assetName || stringValue;
          }
          return stringValue;
        }
        return match;
      }
      const variableById = project.variables[trimmedPlaceholder];
      if (variableById) {
        const value = variables[variableById.id];
        if (value !== void 0) {
          const stringValue = String(value);
          if (stringValue.startsWith("asset-")) {
            const assetName = getAssetNameFromId(stringValue, project);
            return assetName || stringValue;
          }
          return stringValue;
        }
        return match;
      }
      return match;
    });
    return result;
  };
  const XMarkIcon = ({ className, title, ...props }) => /* @__PURE__ */ jsxRuntime2.jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 20 20", fill: "currentColor", className: `w-5 h-5 ${className || ""}`, ...props, children: [
    title && /* @__PURE__ */ jsxRuntime2.jsx("title", { children: title }),
    /* @__PURE__ */ jsxRuntime2.jsx("path", { d: "M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" })
  ] });
  const fontSettingsToStyle = (settings) => ({
    fontFamily: settings.family,
    fontSize: `${settings.size}px`,
    color: settings.color,
    fontWeight: settings.weight,
    fontStyle: settings.italic ? "italic" : "normal"
  });
  const handleDialogue = (command, context) => {
    const { project } = context;
    const char = command.characterId ? project.characters[command.characterId] : null;
    return {
      advance: false,
      // Wait for user to click
      updates: {
        uiState: {
          isWaitingForInput: true,
          dialogue: {
            text: command.text,
            characterName: (char == null ? void 0 : char.name) || "Narrator",
            characterColor: (char == null ? void 0 : char.color) || "#FFFFFF",
            characterId: command.characterId || null
          }
        }
      }
    };
  };
  const handleSetVariable = (command, context) => {
    const { project, playerState } = context;
    console.log("[DEBUG SetVariable] Executing - Variable:", command.variableId, "Operator:", command.operator, "Value:", command.value);
    const variable = project.variables[command.variableId];
    if (!variable) {
      console.warn(`SetVariable command failed: Variable with ID ${command.variableId} not found.`);
      return {
        advance: true,
        updates: {}
      };
    }
    const currentVal = playerState.variables[command.variableId];
    const changeValStr = String(command.value);
    let newVal = command.value;
    if (command.operator === "add") {
      newVal = (Number(currentVal) || 0) + (Number(changeValStr) || 0);
    } else if (command.operator === "subtract") {
      newVal = (Number(currentVal) || 0) - (Number(changeValStr) || 0);
    } else if (command.operator === "random") {
      const min = command.randomMin ?? 0;
      const max = command.randomMax ?? 100;
      newVal = Math.floor(Math.random() * (max - min + 1)) + min;
    } else {
      switch (variable.type) {
        case "number":
          newVal = Number(changeValStr) || 0;
          break;
        case "boolean":
          if (typeof command.value === "boolean") {
            newVal = command.value;
          } else {
            const normalized = String(command.value).trim().toLowerCase();
            if (normalized === "true" || normalized === "1") {
              newVal = true;
            } else if (normalized === "false" || normalized === "0" || normalized === "") {
              newVal = false;
            } else {
              newVal = !!command.value;
            }
          }
          break;
        case "string":
        default:
          newVal = changeValStr;
          break;
      }
    }
    console.log("[DEBUG SetVariable] New value:", newVal);
    return {
      advance: true,
      // Auto-advance for variable commands
      updates: {
        variables: {
          ...playerState.variables,
          [command.variableId]: newVal
        }
      }
    };
  };
  const evaluateConditions = (conditions, variables) => {
    if (!conditions || conditions.length === 0) return true;
    return conditions.every((condition) => {
      const varValue = variables[condition.variableId];
      if (varValue === void 0) return false;
      switch (condition.operator) {
        case "is true":
          return !!varValue;
        case "is false":
          return !varValue;
        case "==":
          return String(varValue).toLowerCase() === String(condition.value).toLowerCase();
        case "!=":
          return String(varValue).toLowerCase() !== String(condition.value).toLowerCase();
        case ">":
          return Number(varValue) > Number(condition.value);
        case "<":
          return Number(varValue) < Number(condition.value);
        case ">=":
          return Number(varValue) >= Number(condition.value);
        case "<=":
          return Number(varValue) <= Number(condition.value);
        case "contains":
          return String(varValue).toLowerCase().includes(String(condition.value).toLowerCase());
        case "startsWith":
          return String(varValue).toLowerCase().startsWith(String(condition.value).toLowerCase());
        default:
          return false;
      }
    });
  };
  function handleChoice(command, context) {
    const { playerState } = context;
    const availableChoices = command.options.filter(
      (opt) => evaluateConditions(opt.conditions, playerState.variables)
    );
    return {
      advance: false,
      // Wait for player to select a choice
      updates: {
        uiState: {
          ...playerState.uiState,
          choices: availableChoices
        }
      }
    };
  }
  function handleShowCharacter(command, context) {
    const { project, playerState, advance } = context;
    const charData = project.characters[command.characterId];
    const exprData = charData == null ? void 0 : charData.expressions[command.expressionId];
    if (!charData || !exprData) {
      return { advance: true };
    }
    const imageUrls = [];
    const videoUrls = [];
    let hasVideo = false;
    let videoLoop = false;
    if (charData.baseVideoUrl) {
      videoUrls.push(charData.baseVideoUrl);
      hasVideo = true;
      videoLoop = !!charData.baseVideoLoop;
    } else if (charData.baseImageUrl) {
      imageUrls.push(charData.baseImageUrl);
    }
    const finalBindings = {};
    const existingChar = playerState == null ? void 0 : playerState.stageState.characters[command.characterId];
    Object.values(charData.layers).forEach((layer) => {
      let boundVarId = null;
      const existingVarId = existingChar == null ? void 0 : existingChar.layerVariableBindings[layer.id];
      if (existingVarId) {
        const existingValue = String(playerState.variables[existingVarId] || "");
        if (existingValue && existingValue in layer.assets) {
          boundVarId = existingVarId;
          console.log(`ShowCharacter: Keeping existing binding for layer "${layer.name}" to variable ${existingVarId}`);
        }
      }
      if (!boundVarId) {
        const matchingVars = Object.entries(project.variables).filter(([varId, v]) => {
          if (v.type !== "string") return false;
          const varValue = String(playerState.variables[varId] || "");
          if (!varValue) return false;
          return varValue in layer.assets;
        });
        const matchingVar = matchingVars[matchingVars.length - 1];
        if (matchingVar) {
          const [varId, varData] = matchingVar;
          boundVarId = varId;
          console.log(`ShowCharacter: Auto-bound layer "${layer.name}" to variable "${varData.name}" (contains asset ID from this layer)`);
        }
      }
      if (boundVarId) {
        finalBindings[layer.id] = boundVarId;
      }
    });
    Object.values(charData.layers).forEach((layer) => {
      let asset = null;
      const variableId = finalBindings[layer.id];
      if (variableId && playerState.variables[variableId] !== void 0) {
        const varValue = playerState.variables[variableId];
        const variable = project.variables[variableId];
        if ((variable == null ? void 0 : variable.type) === "number") {
          const index = Number(varValue) || 0;
          const assetArray = Object.values(layer.assets);
          asset = assetArray[index];
          console.log(
            `ShowCharacter: Using variable ${variableId} (index: ${index}) for layer "${layer.name}"`
          );
        } else {
          const assetId = String(varValue);
          asset = assetId ? layer.assets[assetId] : null;
          console.log(
            `ShowCharacter: Using variable ${variableId} (assetId: ${assetId}) for layer "${layer.name}"`
          );
        }
      } else {
        const assetId = exprData.layerConfiguration[layer.id];
        if (assetId) {
          asset = layer.assets[assetId];
          console.log(
            `ShowCharacter: Using expression config for layer "${layer.name}"`
          );
        }
      }
      if (asset) {
        if (asset.videoUrl) {
          videoUrls.push(asset.videoUrl);
          hasVideo = true;
          videoLoop = videoLoop || !!asset.loop;
        } else if (asset.imageUrl) {
          imageUrls.push(asset.imageUrl);
        }
      }
    });
    const finalPosition = command.endPosition || command.position;
    const startPosition = command.startPosition;
    const requestedTransition = command.transition;
    console.log(
      `ShowCharacter: ${charData.name}, expression: ${exprData.name}, bindings:`,
      finalBindings,
      "variables:",
      playerState.variables
    );
    const characterState = {
      charId: command.characterId,
      position: finalPosition,
      imageUrls,
      videoUrls,
      isVideo: hasVideo,
      videoLoop,
      expressionId: command.expressionId,
      layerVariableBindings: finalBindings,
      transition: requestedTransition && requestedTransition !== "instant" ? {
        type: requestedTransition,
        duration: command.duration ?? 0.5,
        startPosition,
        action: "show"
      } : null
    };
    if (command.transition && command.transition !== "instant") {
      const duration = (command.duration ?? 0.5) * 1e3 + 100;
      return {
        advance: false,
        updates: {
          stageState: {
            ...playerState.stageState,
            characters: {
              ...playerState.stageState.characters,
              [command.characterId]: characterState
            }
          }
        },
        delay: duration,
        callback: () => {
          advance();
        }
      };
    }
    return {
      advance: true,
      updates: {
        stageState: {
          ...playerState.stageState,
          characters: {
            ...playerState.stageState.characters,
            [command.characterId]: characterState
          }
        }
      }
    };
  }
  function handleHideCharacter(command, context) {
    const { playerState, setPlayerState, advance } = context;
    const hideTransitionType = command.transition;
    const existingChar = playerState.stageState.characters[command.characterId];
    if (!existingChar) {
      return { advance: true };
    }
    if (hideTransitionType && hideTransitionType !== "instant") {
      const finalPosition = existingChar.position;
      const startPosition = void 0;
      const characterWithTransition = {
        ...existingChar,
        position: finalPosition,
        transition: {
          type: hideTransitionType,
          duration: command.duration ?? 0.5,
          startPosition,
          endPosition: command.endPosition,
          action: "hide"
        }
      };
      const duration = (command.duration ?? 0.5) * 1e3 + 100;
      return {
        advance: false,
        updates: {
          stageState: {
            ...playerState.stageState,
            characters: {
              ...playerState.stageState.characters,
              [command.characterId]: characterWithTransition
            }
          }
        },
        delay: duration,
        callback: () => {
          setPlayerState((p) => {
            if (!p) return null;
            const { [command.characterId]: _, ...remaining } = p.stageState.characters;
            return {
              ...p,
              stageState: { ...p.stageState, characters: remaining }
            };
          });
          advance();
        }
      };
    } else {
      const { [command.characterId]: _, ...remaining } = playerState.stageState.characters;
      return {
        advance: true,
        updates: {
          stageState: {
            ...playerState.stageState,
            characters: remaining
          }
        }
      };
    }
  }
  async function handleSetBackground(command, context) {
    const { assetResolver, getAssetMetadata, setPlayerState, playerState, advance } = context;
    const newUrl = assetResolver(command.backgroundId, "image");
    const { isVideo, loop } = getAssetMetadata(command.backgroundId, "image");
    const duration = command.duration ?? 1;
    if (!newUrl) {
      console.warn(`Background not found: ${command.backgroundId}`);
      return { advance: true };
    }
    if (command.transition === "instant" || !command.transition) {
      return {
        advance: true,
        updates: {
          stageState: {
            ...playerState.stageState,
            backgroundUrl: newUrl,
            backgroundIsVideo: isVideo,
            backgroundLoop: loop
          }
        }
      };
    }
    const preloadMedia = () => new Promise((resolve, reject) => {
      if (isVideo) {
        const video = document.createElement("video");
        video.src = newUrl;
        video.preload = "auto";
        video.onerror = () => reject(new Error(`Failed to load background video: ${newUrl}`));
        video.onloadeddata = () => resolve();
      } else {
        const img = new Image();
        img.src = newUrl;
        img.onerror = () => reject(new Error(`Failed to load background image: ${newUrl}`));
        img.onload = () => resolve();
      }
    });
    try {
      await preloadMedia();
    } catch (error) {
      console.error(error);
      return { advance: true };
    }
    let transitionElement = null;
    const MediaElement = isVideo ? "video" : "img";
    const mediaProps = isVideo ? { autoPlay: true, muted: true, loop, playsInline: true } : { alt: "" };
    if (command.transition === "cross-fade") {
      transitionElement = /* @__PURE__ */ jsxRuntime2.jsx(
        MediaElement,
        {
          src: newUrl,
          ...mediaProps,
          className: "absolute inset-0 w-full h-full object-cover z-0",
          style: { opacity: 0, transition: `opacity ${duration}s ease-in-out` }
        },
        Date.now()
      );
      setTimeout(() => {
        setPlayerState((p) => {
          if (!p) return null;
          const el = /* @__PURE__ */ jsxRuntime2.jsx(
            MediaElement,
            {
              src: newUrl,
              ...mediaProps,
              className: "absolute inset-0 w-full h-full object-cover z-0",
              style: { opacity: 1, transition: `opacity ${duration}s ease-in-out` }
            },
            Date.now()
          );
          return { ...p, uiState: { ...p.uiState, transitionElement: el } };
        });
      }, 50);
    } else if (command.transition === "fade") {
      transitionElement = /* @__PURE__ */ jsxRuntime2.jsx(
        "div",
        {
          className: "absolute inset-0 z-0 bg-black",
          style: { animation: `dissolve-in ${duration / 2}s forwards` }
        },
        Date.now()
      );
      setTimeout(() => {
        setPlayerState((p) => {
          if (!p) return null;
          const el = /* @__PURE__ */ jsxRuntime2.jsx(
            "div",
            {
              className: "absolute inset-0 z-0 bg-black",
              style: { animation: `fade-out ${duration / 2}s forwards` }
            },
            Date.now() + 1
          );
          return {
            ...p,
            stageState: {
              ...p.stageState,
              backgroundUrl: newUrl,
              backgroundIsVideo: isVideo,
              backgroundLoop: loop
            },
            uiState: { ...p.uiState, transitionElement: el }
          };
        });
      }, duration * 500);
    } else {
      let transitionClass = "";
      switch (command.transition) {
        case "dissolve":
          transitionClass = "transition-dissolve";
          break;
        case "slide":
          transitionClass = "transition-slide-in-right";
          break;
        case "iris-in":
          transitionClass = "transition-iris-in";
          break;
        case "wipe-right":
          transitionClass = "transition-wipe-right";
          break;
      }
      transitionElement = /* @__PURE__ */ jsxRuntime2.jsx(
        MediaElement,
        {
          src: newUrl,
          ...mediaProps,
          className: `absolute inset-0 w-full h-full object-cover z-0 transition-base ${transitionClass}`,
          style: { animationDuration: `${duration}s` }
        },
        Date.now()
      );
    }
    setPlayerState(
      (p) => p ? { ...p, uiState: { ...p.uiState, isTransitioning: true, transitionElement } } : null
    );
    await new Promise((resolve) => {
      setTimeout(() => {
        setPlayerState((p) => {
          if (!p) return null;
          return {
            ...p,
            stageState: {
              ...p.stageState,
              backgroundUrl: newUrl,
              backgroundIsVideo: isVideo,
              backgroundLoop: loop
            },
            uiState: { ...p.uiState, isTransitioning: false, transitionElement: null }
          };
        });
        resolve();
      }, duration * 1e3 + 100);
    });
    advance();
    return { advance: false };
  }
  function handlePlayMusic(command, context) {
    const { assetResolver, musicAudioRef, fadeAudio, settings, playerState } = context;
    console.log("[PlayMusic] Starting music command", { audioId: command.audioId, loop: command.loop });
    const url = assetResolver(command.audioId, "audio");
    if (!url) {
      console.warn(`No audio URL found for audioId: ${command.audioId}`);
      return { advance: true };
    }
    const audio = musicAudioRef.current;
    if (!audio) {
      console.warn("[PlayMusic] Audio element not available");
      return { advance: true };
    }
    const currentSrcPath = audio.src ? new URL(audio.src, window.location.href).pathname : null;
    const newSrcPath = url ? new URL(url, window.location.href).pathname : null;
    const isNewTrack = currentSrcPath !== newSrcPath;
    console.log("[PlayMusic] Audio setup", { isNewTrack, currentSrc: audio.src, newUrl: url, paused: audio.paused });
    if (!isNewTrack && !audio.paused) {
      console.log("[PlayMusic] Same track already playing, updating state only");
      return {
        advance: true,
        updates: {
          musicState: {
            ...playerState.musicState,
            audioId: command.audioId,
            loop: command.loop,
            isPlaying: true
          }
        }
      };
    }
    const musicState = {
      audioId: command.audioId,
      loop: command.loop,
      currentTime: 0,
      isPlaying: true
    };
    const startPlayback = () => {
      console.log("[PlayMusic] Starting playback");
      audio.loop = command.loop;
      audio.volume = 0;
      audio.play().then(() => {
        console.log("[PlayMusic] Audio playing, starting fade-in");
        const target = typeof command.volume === "number" ? command.volume : settings.musicVolume;
        fadeAudio(audio, target, command.fadeDuration);
      }).catch((e) => {
        console.error("[PlayMusic] Music play failed:", e);
      });
    };
    if (isNewTrack) {
      audio.src = url;
      audio.load();
      audio.addEventListener("canplaythrough", startPlayback, { once: true });
      audio.addEventListener("error", (e) => {
        console.error("[PlayMusic] Music load failed:", e);
      }, { once: true });
    } else {
      startPlayback();
    }
    console.log("[PlayMusic] Command complete, advancing");
    return {
      advance: true,
      updates: {
        musicState
      }
    };
  }
  function handleStopMusic(command, context) {
    const { musicAudioRef, fadeAudio } = context;
    if (musicAudioRef.current) {
      fadeAudio(musicAudioRef.current, 0, command.fadeDuration, () => {
        var _a;
        (_a = musicAudioRef.current) == null ? void 0 : _a.pause();
      });
    }
    return {
      advance: true,
      updates: {
        musicState: {
          audioId: null,
          loop: false,
          currentTime: 0,
          isPlaying: false
        }
      }
    };
  }
  function handlePlaySoundEffect(command, context) {
    const { playSound } = context;
    try {
      playSound(command.audioId, command.volume);
    } catch (e) {
      console.error("Failed to play sound effect:", e);
    }
    return { advance: true };
  }
  function handleShowText(command, context) {
    const { playerState, project } = context;
    const interpolatedText = interpolateVariables(command.text, playerState.variables, project);
    const overlay = {
      id: command.id,
      text: interpolatedText,
      x: command.x,
      y: command.y,
      fontSize: command.fontSize,
      fontFamily: command.fontFamily,
      color: command.color,
      width: command.width,
      height: command.height,
      textAlign: command.textAlign,
      verticalAlign: command.verticalAlign,
      transition: command.transition !== "instant" ? command.transition : void 0,
      duration: command.duration,
      action: "show"
    };
    const hasTransition = command.transition && command.transition !== "instant";
    const delay = hasTransition ? (command.duration ?? 0.5) * 1e3 + 100 : 0;
    return {
      advance: !hasTransition,
      updates: {
        stageState: {
          ...playerState.stageState,
          textOverlays: [...playerState.stageState.textOverlays, overlay]
        }
      },
      delay,
      callback: hasTransition ? context.advance : void 0
    };
  }
  function handleHideText(command, context) {
    const { playerState, setPlayerState, advance } = context;
    const overlays = playerState.stageState.textOverlays;
    const target = overlays.find((o) => o.id === command.targetCommandId);
    if (!target) {
      return { advance: true };
    }
    if (command.transition && command.transition !== "instant") {
      const updated = overlays.map(
        (o) => o.id === command.targetCommandId ? { ...o, transition: command.transition, duration: command.duration, action: "hide" } : o
      );
      const duration = (command.duration ?? 0.5) * 1e3 + 100;
      return {
        advance: false,
        updates: {
          stageState: {
            ...playerState.stageState,
            textOverlays: updated
          }
        },
        delay: duration,
        callback: () => {
          setPlayerState(
            (inner) => inner ? {
              ...inner,
              stageState: {
                ...inner.stageState,
                textOverlays: inner.stageState.textOverlays.filter(
                  (o) => o.id !== command.targetCommandId
                )
              }
            } : null
          );
          advance();
        }
      };
    } else {
      return {
        advance: true,
        updates: {
          stageState: {
            ...playerState.stageState,
            textOverlays: overlays.filter((o) => o.id !== command.targetCommandId)
          }
        }
      };
    }
  }
  function handleShowImage(command, context) {
    const { assetResolver, getAssetMetadata, playerState } = context;
    const imageUrl = assetResolver(command.imageId, "image");
    const { isVideo, loop } = getAssetMetadata(command.imageId, "image");
    if (!imageUrl) {
      console.warn(`Image not found: ${command.imageId}`);
      return { advance: true };
    }
    const overlay = {
      id: command.id,
      imageUrl: !isVideo ? imageUrl : void 0,
      videoUrl: isVideo ? imageUrl : void 0,
      isVideo,
      videoLoop: loop,
      x: command.x,
      y: command.y,
      width: command.width,
      height: command.height,
      rotation: command.rotation,
      opacity: command.opacity,
      scaleX: command.scaleX ?? 1,
      scaleY: command.scaleY ?? 1,
      transition: command.transition !== "instant" ? command.transition : void 0,
      duration: command.duration,
      action: "show"
    };
    const hasTransition = command.transition && command.transition !== "instant";
    const delay = hasTransition ? (command.duration ?? 0.5) * 1e3 + 100 : 0;
    return {
      advance: !hasTransition,
      updates: {
        stageState: {
          ...playerState.stageState,
          imageOverlays: [...playerState.stageState.imageOverlays, overlay]
        }
      },
      delay,
      callback: hasTransition ? context.advance : void 0
    };
  }
  function handleHideImage(command, context) {
    const { playerState, setPlayerState, advance } = context;
    const overlays = playerState.stageState.imageOverlays;
    const target = overlays.find((o) => o.id === command.targetCommandId);
    if (!target) {
      return { advance: true };
    }
    if (command.transition && command.transition !== "instant") {
      const updated = overlays.map(
        (o) => o.id === command.targetCommandId ? { ...o, transition: command.transition, duration: command.duration, action: "hide" } : o
      );
      const duration = (command.duration ?? 0.5) * 1e3 + 100;
      return {
        advance: false,
        updates: {
          stageState: {
            ...playerState.stageState,
            imageOverlays: updated
          }
        },
        delay: duration,
        callback: () => {
          setPlayerState(
            (inner) => inner ? {
              ...inner,
              stageState: {
                ...inner.stageState,
                imageOverlays: inner.stageState.imageOverlays.filter(
                  (o) => o.id !== command.targetCommandId
                )
              }
            } : null
          );
          advance();
        }
      };
    } else {
      return {
        advance: true,
        updates: {
          stageState: {
            ...playerState.stageState,
            imageOverlays: overlays.filter((o) => o.id !== command.targetCommandId)
          }
        }
      };
    }
  }
  function handleShowButton(command, context) {
    const { playerState, assetResolver, setPlayerState } = context;
    if (command.showConditions && command.showConditions.length > 0) {
      command.showConditions.every(
        (cond) => context.project.variables
        // Need evaluateConditions but it's in systems
        // This needs the evaluateConditions function - we'll need to pass it through context
      );
    }
    const buttonOverlay = {
      id: command.id,
      text: command.text,
      x: command.x,
      y: command.y,
      width: command.width || 20,
      height: command.height || 8,
      anchorX: command.anchorX || 0.5,
      anchorY: command.anchorY || 0.5,
      backgroundColor: command.backgroundColor || "#6366f1",
      textColor: command.textColor || "#ffffff",
      fontSize: command.fontSize || 18,
      fontWeight: command.fontWeight || "normal",
      borderRadius: command.borderRadius || 8,
      imageUrl: command.image ? assetResolver(command.image.id, command.image.type) : null,
      hoverImageUrl: command.hoverImage ? assetResolver(command.hoverImage.id, command.hoverImage.type) : null,
      onClick: command.onClick,
      actions: command.actions,
      // Multiple actions support
      clickSound: command.clickSound,
      waitForClick: command.waitForClick,
      transition: command.transition !== "instant" ? command.transition : void 0,
      duration: command.duration || 0.3,
      action: "show"
    };
    const hasTransition = command.transition && command.transition !== "instant";
    const waitForClick = command.waitForClick;
    let shouldAdvance = true;
    let delay = 0;
    let callback;
    if (hasTransition && waitForClick) {
      shouldAdvance = false;
      delay = 0;
      callback = () => {
        setPlayerState(
          (p) => p ? { ...p, uiState: { ...p.uiState, isWaitingForInput: true } } : null
        );
      };
    } else if (hasTransition) {
      shouldAdvance = false;
      delay = (command.duration ?? 0.3) * 1e3 + 100;
      callback = context.advance;
    } else if (waitForClick) {
      shouldAdvance = false;
      callback = () => {
        setPlayerState(
          (p) => p ? { ...p, uiState: { ...p.uiState, isWaitingForInput: true } } : null
        );
      };
    }
    return {
      advance: shouldAdvance,
      updates: {
        stageState: {
          ...playerState.stageState,
          buttonOverlays: [...playerState.stageState.buttonOverlays, buttonOverlay]
        }
      },
      delay,
      callback
    };
  }
  function handleHideButton(command, context) {
    const { playerState, setPlayerState, advance } = context;
    const overlays = playerState.stageState.buttonOverlays;
    const target = overlays.find((o) => o.id === command.targetCommandId);
    if (!target) {
      return { advance: true };
    }
    if (command.transition && command.transition !== "instant") {
      const updated = overlays.map(
        (o) => o.id === command.targetCommandId ? {
          ...o,
          transition: command.transition,
          duration: command.duration || 0.3,
          action: "hide"
        } : o
      );
      const duration = (command.duration ?? 0.3) * 1e3 + 100;
      return {
        advance: false,
        updates: {
          stageState: {
            ...playerState.stageState,
            buttonOverlays: updated
          }
        },
        delay: duration,
        callback: () => {
          setPlayerState(
            (inner) => inner ? {
              ...inner,
              stageState: {
                ...inner.stageState,
                buttonOverlays: inner.stageState.buttonOverlays.filter(
                  (o) => o.id !== command.targetCommandId
                )
              }
            } : null
          );
          advance();
        }
      };
    } else {
      return {
        advance: true,
        updates: {
          stageState: {
            ...playerState.stageState,
            buttonOverlays: overlays.filter((o) => o.id !== command.targetCommandId)
          }
        }
      };
    }
  }
  function handleJump(command, context) {
    const { project } = context;
    const actualSceneId = command.targetSceneId;
    const newScene = project.scenes[actualSceneId];
    if (!newScene) {
      console.error(`Scene not found: ${actualSceneId}`);
      return { advance: true };
    }
    return {
      advance: false,
      // don't auto-advance after a jump
      updates: {
        currentSceneId: actualSceneId,
        currentCommands: newScene.commands,
        currentIndex: 0,
        commandStack: []
      }
    };
  }
  function handleJumpToLabel(command, context) {
    const { playerState } = context;
    const labelIndex = playerState.currentCommands.findIndex(
      (c) => c.type === CommandType.Label && c.labelId === command.labelId
    );
    if (labelIndex === -1) {
      console.warn(`Label not found: ${command.labelId}`);
      return { advance: true };
    }
    return {
      advance: false,
      // Don't advance after jump
      updates: {
        currentIndex: labelIndex
      }
    };
  }
  function handleLabel(command, context) {
    return { advance: true };
  }
  function handleBranchStart() {
    return { advance: true };
  }
  function handleBranchEnd() {
    return { advance: true };
  }
  function handleGroup() {
    return { advance: true };
  }
  function handleTextInput(command, context) {
    const { playerState } = context;
    return {
      advance: false,
      // Wait for user input
      updates: {
        uiState: {
          ...playerState.uiState,
          isWaitingForInput: true,
          textInput: {
            variableId: command.variableId,
            prompt: command.prompt,
            placeholder: command.placeholder || "",
            maxLength: command.maxLength || 50
          }
        }
      }
    };
  }
  const getOverlayTransitionClass = (transition, isHide) => {
    switch (transition) {
      case "fade":
        return isHide ? "transition-fade-out" : "transition-dissolve";
      case "dissolve":
        return isHide ? "transition-dissolve-out" : "transition-dissolve";
      case "slide":
        return "transition-slide";
      case "iris-in":
        return isHide ? "transition-iris-out" : "transition-iris-in";
      case "wipe-right":
        return isHide ? "transition-wipe-out-right" : "transition-wipe-right";
      default:
        return "transition-dissolve";
    }
  };
  const defaultSettings = {
    textSpeed: 50,
    musicVolume: 0.8,
    sfxVolume: 0.8,
    enableSkip: true,
    autoAdvance: false,
    autoAdvanceDelay: 3
  };
  const buildSlideStyle = (x, _y, action, stageSize) => {
    const horizontalBias = x <= 50 ? -60 : 60;
    const startPercent = action === "show" ? horizontalBias : 0;
    const endPercent = action === "hide" ? horizontalBias : 0;
    const style = {
      "--slide-start-x": `${startPercent}%`,
      "--slide-start-y": `0%`,
      "--slide-end-x": `${endPercent}%`,
      "--slide-end-y": `0%`
    };
    if (stageSize.width > 0 && stageSize.height > 0) {
      style["--slide-start-px"] = `${startPercent / 100 * stageSize.width}px`;
      style["--slide-end-px"] = `${endPercent / 100 * stageSize.width}px`;
      style["--slide-start-py"] = `0px`;
      style["--slide-end-py"] = `0px`;
    }
    return style;
  };
  const TextOverlayElement = ({ overlay, stageSize }) => {
    const hasTransition = overlay.transition && overlay.transition !== "instant";
    const [playTransition, setPlayTransition] = React2.useState(overlay.action === "hide" && !!hasTransition);
    const timeoutRef = React2.useRef(null);
    React2.useEffect(() => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (!overlay.transition || overlay.transition === "instant") {
        setPlayTransition(false);
        return;
      }
      if (overlay.action === "show") {
        setPlayTransition(false);
        timeoutRef.current = window.setTimeout(() => {
          setPlayTransition(true);
          timeoutRef.current = null;
        }, 0);
        return () => {
          if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        };
      }
      setPlayTransition(true);
      return () => {
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      };
    }, [overlay.id, overlay.transition, overlay.action]);
    const applyTransition = playTransition && !!hasTransition;
    const transitionClass = applyTransition && overlay.transition ? getOverlayTransitionClass(overlay.transition, overlay.action === "hide") : "";
    const animDuration = `${overlay.duration ?? 0.5}s`;
    const isSlideTransition = overlay.transition === "slide";
    const slideStyle = isSlideTransition ? buildSlideStyle(overlay.x, overlay.y ?? 0, overlay.action, stageSize) : {};
    const baseStyle = {
      left: `${overlay.x}%`,
      top: `${overlay.y}%`,
      ...isSlideTransition ? {} : { transform: "translate(-50%, -50%)" },
      fontSize: `${overlay.fontSize}px`,
      fontFamily: overlay.fontFamily,
      color: overlay.color,
      width: overlay.width ? `${overlay.width}px` : "auto",
      height: overlay.height ? `${overlay.height}px` : "auto",
      textAlign: overlay.textAlign || "left",
      display: "flex",
      alignItems: overlay.verticalAlign === "top" ? "flex-start" : overlay.verticalAlign === "bottom" ? "flex-end" : "center",
      justifyContent: overlay.textAlign === "left" ? "flex-start" : overlay.textAlign === "right" ? "flex-end" : "center",
      whiteSpace: overlay.width ? "pre-wrap" : "nowrap",
      overflow: "hidden"
    };
    if (overlay.action === "show" && hasTransition && !playTransition) {
      baseStyle.opacity = 0;
    }
    const className = `absolute${applyTransition ? ` ${transitionClass} transition-base` : ""}`;
    const style = {
      ...baseStyle,
      ...applyTransition ? { animationDuration: animDuration } : {},
      ...isSlideTransition ? slideStyle : {}
    };
    return /* @__PURE__ */ jsxRuntime2.jsx("div", { className, style, children: overlay.text });
  };
  const ButtonOverlayElement = ({ overlay, onAction, playSound, onAdvance }) => {
    const [isHovered, setIsHovered] = React2.useState(false);
    const hasTransition = overlay.transition && overlay.transition !== "instant";
    const [playTransition, setPlayTransition] = React2.useState(overlay.action === "hide" && !!hasTransition);
    const timeoutRef = React2.useRef(null);
    React2.useEffect(() => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (!overlay.transition || overlay.transition === "instant") {
        setPlayTransition(false);
        return;
      }
      if (overlay.action === "show") {
        setPlayTransition(false);
        timeoutRef.current = window.setTimeout(() => {
          setPlayTransition(true);
          timeoutRef.current = null;
        }, 0);
        return () => {
          if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        };
      }
      setPlayTransition(true);
      return () => {
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      };
    }, [overlay.id, overlay.transition, overlay.action]);
    const handleClick = () => {
      console.log("Button clicked:", overlay.text, "Action:", overlay.onClick);
      if (overlay.clickSound) {
        try {
          playSound(overlay.clickSound);
        } catch (e) {
          console.error("Error playing button click sound:", e);
        }
      }
      onAction(overlay.onClick);
      if (overlay.waitForClick && onAdvance && overlay.onClick.type !== UIActionType.JumpToScene) {
        onAdvance();
      }
    };
    const applyTransition = playTransition && overlay.transition && overlay.transition !== "instant";
    const transitionClass = applyTransition && overlay.transition ? getOverlayTransitionClass(overlay.transition, overlay.action === "hide") : "";
    const animDuration = `${overlay.duration ?? 0.3}s`;
    const containerStyle = {
      position: "absolute",
      left: `${overlay.x}%`,
      top: `${overlay.y}%`,
      width: `${overlay.width}%`,
      height: `${overlay.height}%`,
      transform: `translate(-${overlay.anchorX * 100}%, -${overlay.anchorY * 100}%)`,
      pointerEvents: "auto"
    };
    if (overlay.action === "show" && hasTransition && !playTransition) {
      containerStyle.opacity = 0;
    }
    const buttonStyle = {
      width: "100%",
      height: "100%",
      backgroundColor: overlay.backgroundColor,
      color: overlay.textColor,
      fontSize: `${overlay.fontSize}px`,
      fontWeight: overlay.fontWeight,
      borderRadius: `${overlay.borderRadius}px`,
      border: "none",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "transform 0.1s, box-shadow 0.1s",
      boxShadow: isHovered ? "0 4px 12px rgba(0,0,0,0.3)" : "0 2px 4px rgba(0,0,0,0.2)",
      transform: isHovered ? "translateY(-2px)" : "none"
    };
    const displayImage = isHovered && overlay.hoverImageUrl ? overlay.hoverImageUrl : overlay.imageUrl;
    return /* @__PURE__ */ jsxRuntime2.jsx(
      "div",
      {
        style: containerStyle,
        className: `${transitionClass}`,
        ...hasTransition ? { style: { ...containerStyle, animationDuration: animDuration } } : {},
        children: /* @__PURE__ */ jsxRuntime2.jsx(
          "button",
          {
            onClick: handleClick,
            onMouseEnter: () => setIsHovered(true),
            onMouseLeave: () => setIsHovered(false),
            style: buttonStyle,
            children: displayImage ? /* @__PURE__ */ jsxRuntime2.jsx("img", { src: displayImage, alt: overlay.text, style: { width: "100%", height: "100%", objectFit: "cover", borderRadius: `${overlay.borderRadius}px` } }) : /* @__PURE__ */ jsxRuntime2.jsx("span", { children: overlay.text })
          }
        )
      },
      overlay.id
    );
  };
  const ImageOverlayElement = ({ overlay, stageSize }) => {
    const hasTransition = overlay.transition && overlay.transition !== "instant";
    const [playTransition, setPlayTransition] = React2.useState(overlay.action === "hide" && !!hasTransition);
    const timeoutRef = React2.useRef(null);
    React2.useEffect(() => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (!overlay.transition || overlay.transition === "instant") {
        setPlayTransition(false);
        return;
      }
      if (overlay.action === "show") {
        setPlayTransition(false);
        timeoutRef.current = window.setTimeout(() => {
          setPlayTransition(true);
          timeoutRef.current = null;
        }, 0);
        return () => {
          if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        };
      }
      setPlayTransition(true);
      return () => {
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      };
    }, [overlay.id, overlay.transition, overlay.action]);
    const applyTransition = playTransition && overlay.transition && overlay.transition !== "instant";
    const transitionClass = applyTransition && overlay.transition ? getOverlayTransitionClass(overlay.transition, overlay.action === "hide") : "";
    const animDuration = `${overlay.duration ?? 0.5}s`;
    const isSlideTransition = overlay.transition === "slide";
    const slideStyle = isSlideTransition ? buildSlideStyle(overlay.x, overlay.y ?? 0, overlay.action, stageSize) : {};
    const containerStyle = {
      left: `${overlay.x}%`,
      top: `${overlay.y}%`,
      width: `${overlay.width}px`,
      height: `${overlay.height}px`,
      ...isSlideTransition ? {} : { transform: "translate(-50%, -50%)" }
    };
    if (overlay.action === "show" && hasTransition && !playTransition) {
      containerStyle.opacity = 0;
    }
    const imageStyle = {
      width: "100%",
      height: "100%",
      transform: `rotate(${overlay.rotation}deg) scale(${overlay.scaleX}, ${overlay.scaleY})`,
      transformOrigin: "center center",
      opacity: overlay.opacity
    };
    const className = `absolute${applyTransition ? ` ${transitionClass} transition-base` : ""}`;
    const style = {
      ...containerStyle,
      ...applyTransition ? { animationDuration: animDuration } : {},
      ...isSlideTransition ? slideStyle : {}
    };
    return /* @__PURE__ */ jsxRuntime2.jsx("div", { className, style, children: overlay.isVideo && overlay.videoUrl ? /* @__PURE__ */ jsxRuntime2.jsx(
      "video",
      {
        src: overlay.videoUrl,
        autoPlay: true,
        muted: true,
        loop: overlay.videoLoop,
        playsInline: true,
        className: "absolute inset-0 w-full h-full object-contain",
        style: imageStyle
      }
    ) : /* @__PURE__ */ jsxRuntime2.jsx(
      "img",
      {
        src: overlay.imageUrl,
        alt: "",
        className: "absolute inset-0 w-full h-full object-contain",
        style: imageStyle
      }
    ) });
  };
  const useTypewriter = (text, speed) => {
    const [displayText, setDisplayText] = React2.useState("");
    const hasFinished = displayText.length === text.length;
    React2.useEffect(() => {
      setDisplayText("");
      if (!text) return;
      const interval = setInterval(() => {
        setDisplayText((prev) => {
          if (prev.length < text.length) {
            return text.substring(0, prev.length + 1);
          } else {
            clearInterval(interval);
            return prev;
          }
        });
      }, 1e3 / speed);
      return () => clearInterval(interval);
    }, [text, speed]);
    const skip = () => setDisplayText(text);
    return { displayText, skip, hasFinished };
  };
  const useStageSize = (ref) => {
    const [size, setSize] = React2.useState({ width: 0, height: 0 });
    React2.useEffect(() => {
      if (!ref.current) return;
      const el = ref.current;
      const obs = new ResizeObserver(() => {
        const r2 = el.getBoundingClientRect();
        setSize({ width: r2.width, height: r2.height });
      });
      obs.observe(el);
      const r = el.getBoundingClientRect();
      setSize({ width: r.width, height: r.height });
      return () => obs.disconnect();
    }, [ref]);
    return size;
  };
  const DialogueBox = ({ dialogue, settings, projectUI, onFinished, variables, project }) => {
    var _a, _b, _c, _d;
    if (!dialogue) return null;
    const interpolatedText = interpolateVariables(dialogue.text, variables, project);
    const { displayText, skip, hasFinished } = useTypewriter(interpolatedText, settings.textSpeed);
    const handleClick = () => {
      if (hasFinished) {
        onFinished();
      } else {
        skip();
      }
    };
    const dialogueBoxUrl = projectUI.dialogueBoxImage ? projectUI.dialogueBoxImage.type === "video" ? (_a = project.videos[projectUI.dialogueBoxImage.id]) == null ? void 0 : _a.videoUrl : ((_b = project.images[projectUI.dialogueBoxImage.id]) == null ? void 0 : _b.imageUrl) || ((_c = project.backgrounds[projectUI.dialogueBoxImage.id]) == null ? void 0 : _c.imageUrl) : null;
    const isDialogueBoxVideo = ((_d = projectUI.dialogueBoxImage) == null ? void 0 : _d.type) === "video";
    const character = dialogue.characterId ? project.characters[dialogue.characterId] : null;
    const characterFont = character == null ? void 0 : character.fontFamily;
    const characterFontSize = character == null ? void 0 : character.fontSize;
    const characterFontWeight = character == null ? void 0 : character.fontWeight;
    const characterFontItalic = character == null ? void 0 : character.fontItalic;
    const dialogueTextStyle = {
      ...fontSettingsToStyle(projectUI.dialogueTextFont),
      ...characterFont ? { fontFamily: characterFont } : {},
      ...characterFontSize ? { fontSize: `${characterFontSize}px` } : {},
      ...characterFontWeight ? { fontWeight: characterFontWeight } : {},
      ...characterFontItalic ? { fontStyle: "italic" } : {}
    };
    return /* @__PURE__ */ jsxRuntime2.jsxs(
      "div",
      {
        className: `absolute bottom-5 left-5 right-5 p-5 z-20 cursor-pointer ${dialogueBoxUrl && !isDialogueBoxVideo ? "dialogue-box-custom bg-black/70" : "bg-black/70 rounded-lg border-2 border-slate-500"}`,
        style: dialogueBoxUrl && !isDialogueBoxVideo ? { borderImageSource: `url(${dialogueBoxUrl})` } : {},
        onClick: handleClick,
        children: [
          isDialogueBoxVideo && dialogueBoxUrl && /* @__PURE__ */ jsxRuntime2.jsx(
            "video",
            {
              autoPlay: true,
              loop: true,
              muted: true,
              className: "absolute inset-0 w-full h-full object-cover rounded-lg -z-10",
              style: { pointerEvents: "none" },
              children: /* @__PURE__ */ jsxRuntime2.jsx("source", { src: dialogueBoxUrl })
            }
          ),
          dialogue.characterName !== "Narrator" && /* @__PURE__ */ jsxRuntime2.jsx("h3", { className: "mb-2", style: { ...fontSettingsToStyle(projectUI.dialogueNameFont), color: dialogue.characterColor }, children: dialogue.characterName }),
          /* @__PURE__ */ jsxRuntime2.jsxs("p", { className: "leading-relaxed", style: dialogueTextStyle, children: [
            displayText,
            !hasFinished && /* @__PURE__ */ jsxRuntime2.jsx("span", { className: "animate-ping", children: "_" })
          ] })
        ]
      }
    );
  };
  const ChoiceMenu = ({ choices, projectUI, onSelect, variables, project }) => {
    var _a, _b, _c, _d;
    const choiceButtonUrl = projectUI.choiceButtonImage ? projectUI.choiceButtonImage.type === "video" ? (_a = project.videos[projectUI.choiceButtonImage.id]) == null ? void 0 : _a.videoUrl : ((_b = project.images[projectUI.choiceButtonImage.id]) == null ? void 0 : _b.imageUrl) || ((_c = project.backgrounds[projectUI.choiceButtonImage.id]) == null ? void 0 : _c.imageUrl) : null;
    const isChoiceButtonVideo = ((_d = projectUI.choiceButtonImage) == null ? void 0 : _d.type) === "video";
    return /* @__PURE__ */ jsxRuntime2.jsx("div", { className: "absolute inset-0 bg-black/30 z-30 flex flex-col items-center justify-center p-8 space-y-4", children: choices.map((choice, index) => {
      const interpolatedText = interpolateVariables(choice.text, variables, project);
      return /* @__PURE__ */ jsxRuntime2.jsxs(
        "button",
        {
          onClick: () => onSelect(choice),
          className: `px-8 py-4 relative ${choiceButtonUrl && !isChoiceButtonVideo ? "choice-button-custom bg-slate-800/80 hover:bg-slate-700/90" : "bg-slate-800/80 hover:bg-slate-700/90 border-2 border-slate-500 rounded-lg"}`,
          style: choiceButtonUrl && !isChoiceButtonVideo ? { borderImageSource: `url(${choiceButtonUrl})`, ...fontSettingsToStyle(projectUI.choiceTextFont) } : fontSettingsToStyle(projectUI.choiceTextFont),
          children: [
            isChoiceButtonVideo && choiceButtonUrl && /* @__PURE__ */ jsxRuntime2.jsx(
              "video",
              {
                autoPlay: true,
                loop: true,
                muted: true,
                className: "absolute inset-0 w-full h-full object-cover rounded-lg -z-10",
                style: { pointerEvents: "none" },
                children: /* @__PURE__ */ jsxRuntime2.jsx("source", { src: choiceButtonUrl })
              }
            ),
            /* @__PURE__ */ jsxRuntime2.jsx("span", { className: "relative z-10", children: interpolatedText })
          ]
        },
        index
      );
    }) });
  };
  const TextInputForm = ({ textInput, onSubmit, variables, project }) => {
    const [inputValue, setInputValue] = React2.useState("");
    const handleSubmit = (e) => {
      e.preventDefault();
      onSubmit(inputValue);
    };
    const interpolatedPrompt = interpolateVariables(textInput.prompt, variables, project);
    return /* @__PURE__ */ jsxRuntime2.jsx("div", { className: "absolute inset-0 bg-black/30 z-30 flex flex-col items-center justify-center p-8", children: /* @__PURE__ */ jsxRuntime2.jsxs("div", { className: "bg-black/70 rounded-lg border-2 border-slate-500 p-6 max-w-md w-full", children: [
      /* @__PURE__ */ jsxRuntime2.jsx("p", { className: "text-white mb-4 text-center", children: interpolatedPrompt }),
      /* @__PURE__ */ jsxRuntime2.jsxs("form", { onSubmit: handleSubmit, children: [
        /* @__PURE__ */ jsxRuntime2.jsx(
          "input",
          {
            type: "text",
            value: inputValue,
            onChange: (e) => setInputValue(e.target.value),
            placeholder: textInput.placeholder,
            maxLength: textInput.maxLength,
            className: "w-full px-3 py-2 bg-slate-800 text-white border border-slate-600 rounded focus:outline-none focus:border-slate-400",
            autoFocus: true
          }
        ),
        /* @__PURE__ */ jsxRuntime2.jsx(
          "button",
          {
            type: "submit",
            className: "w-full mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors",
            children: "Submit"
          }
        )
      ] })
    ] }) });
  };
  const ButtonElement = ({ element, style, playSound, onAction, getElementAssetUrl, variables = {}, project }) => {
    const [isHovered, setIsHovered] = React2.useState(false);
    const bgUrl = getElementAssetUrl(element.image);
    const hoverUrl = getElementAssetUrl(element.hoverImage);
    const displayUrl = isHovered && hoverUrl ? hoverUrl : bgUrl;
    const textStyle = fontSettingsToStyle(element.font);
    const interpolatedText = project ? interpolateVariables(element.text, variables, project) : element.text;
    const handleClick = () => {
      try {
        playSound(element.clickSoundId);
      } catch (e) {
      }
      if (element.action) {
        onAction(element.action);
      }
      if (element.actions && element.actions.length > 0) {
        element.actions.forEach((action) => onAction(action));
      }
    };
    return /* @__PURE__ */ jsxRuntime2.jsxs(
      "button",
      {
        style: { ...style, fontFamily: "inherit", fontSize: "inherit", lineHeight: "inherit" },
        className: "transition-transform transform hover:scale-105 relative flex items-center justify-center",
        onMouseEnter: () => {
          try {
            playSound(element.hoverSoundId);
          } catch (e) {
          }
          setIsHovered(true);
        },
        onMouseLeave: () => setIsHovered(false),
        onClick: handleClick,
        children: [
          displayUrl ? /* @__PURE__ */ jsxRuntime2.jsx("img", { src: displayUrl, alt: element.text, className: "absolute inset-0 w-full h-full object-fill" }) : /* @__PURE__ */ jsxRuntime2.jsx("div", { className: "absolute inset-0 w-full h-full bg-slate-700/80" }),
          /* @__PURE__ */ jsxRuntime2.jsx("span", { className: "relative z-10", style: { ...textStyle, display: "inline-block", pointerEvents: "none" }, children: interpolatedText })
        ]
      },
      element.id
    );
  };
  const getTransitionStyle = (transitionIn, duration, delay) => {
    const durationMs = duration || 300;
    const delayMs = delay || 0;
    if (!transitionIn || transitionIn === "none") return {};
    const transitionProp = `all ${durationMs}ms ease-out ${delayMs}ms`;
    return {
      transition: transitionProp,
      animation: `elementTransition${transitionIn} ${durationMs}ms ease-out ${delayMs}ms`
    };
  };
  const UIScreenRenderer = React2.memo(({ screenId, onAction, settings, onSettingsChange, assetResolver, gameSaves, playSound, variables = {}, onVariableChange, isClosing = false }) => {
    const { project } = useProject();
    const screen = project.uiScreens[screenId];
    const backgroundVideoRef = React2.useRef(null);
    React2.useEffect(() => {
      return () => {
        if (backgroundVideoRef.current) {
          backgroundVideoRef.current.pause();
          backgroundVideoRef.current.src = "";
          backgroundVideoRef.current.load();
        }
      };
    }, []);
    if (!screen) return /* @__PURE__ */ jsxRuntime2.jsxs("div", { className: "text-red-500", children: [
      "Error: Screen ",
      screenId,
      " not found."
    ] });
    const getBackgroundElement = () => {
      if (screen.background.type === "color") {
        return /* @__PURE__ */ jsxRuntime2.jsx("div", { className: "absolute inset-0", style: { backgroundColor: screen.background.value } });
      }
      if (screen.background.assetId) {
        const url = assetResolver(screen.background.assetId, screen.background.type);
        if (url) {
          if (screen.background.type === "image") {
            return /* @__PURE__ */ jsxRuntime2.jsx("img", { src: url, alt: "", className: "absolute inset-0 w-full h-full object-cover" });
          }
          if (screen.background.type === "video") {
            return /* @__PURE__ */ jsxRuntime2.jsx("video", { ref: backgroundVideoRef, src: url, autoPlay: true, loop: true, muted: true, playsInline: true, className: "absolute inset-0 w-full h-full object-cover" });
          }
        }
      }
      return null;
    };
    const renderElement = (element, variables2, project2) => {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D;
      console.log("🎯 renderElement called:", element.type, element.name, element.id);
      const transitionStyle = getTransitionStyle(element.transitionIn, element.transitionDuration, element.transitionDelay);
      const style = {
        position: "absolute",
        left: `${element.x}%`,
        top: `${element.y}%`,
        width: `${element.width}%`,
        height: `${element.height}%`,
        transform: `translate(-${element.anchorX * 100}%, -${element.anchorY * 100}%)`,
        overflow: "hidden",
        // Prevent content overflow when using cover
        ...transitionStyle
      };
      const getElementAssetUrl = (image) => {
        if (!image) return null;
        return assetResolver(image.id, image.type);
      };
      switch (element.type) {
        case UIElementType.Button: {
          const el = element;
          return /* @__PURE__ */ jsxRuntime2.jsx(ButtonElement, { element: el, style, playSound, onAction, getElementAssetUrl, variables: variables2, project: project2 }, el.id);
        }
        case UIElementType.Text: {
          const el = element;
          const hAlignClass = { left: "justify-start", center: "justify-center", right: "justify-end" }[el.textAlign || "center"];
          const vAlignClass = { top: "items-start", middle: "items-center", bottom: "items-end" }[el.verticalAlign || "middle"];
          const interpolatedText = interpolateVariables(el.text, variables2, project2);
          return /* @__PURE__ */ jsxRuntime2.jsx(
            "div",
            {
              style,
              className: `flex ${hAlignClass} ${vAlignClass} p-1`,
              children: /* @__PURE__ */ jsxRuntime2.jsx("div", { style: fontSettingsToStyle(el.font), children: interpolatedText })
            },
            el.id
          );
        }
        case UIElementType.Image: {
          const el = element;
          const bgType = ((_a = el.background) == null ? void 0 : _a.type) || "image";
          const bgValue = ((_b = el.background) == null ? void 0 : _b.type) === "color" ? el.background.value : ((_c = el.background) == null ? void 0 : _c.type) ? el.background.assetId : ((_d = el.image) == null ? void 0 : _d.id) || null;
          const containerStyle = {
            ...style,
            overflow: "hidden"
          };
          if (bgType === "color" && typeof bgValue === "string") {
            return /* @__PURE__ */ jsxRuntime2.jsx("div", { style: { ...containerStyle, backgroundColor: bgValue } }, el.id);
          }
          const url = bgValue ? bgType === "video" ? (_e = project2.videos[bgValue]) == null ? void 0 : _e.videoUrl : assetResolver(bgValue, "image") : null;
          if (!url || url === "" || url === "http://localhost:3000/") {
            return /* @__PURE__ */ jsxRuntime2.jsx("div", { style: containerStyle, className: "bg-slate-800/50" }, el.id);
          }
          const isVideo = bgType === "video";
          const mediaStyle = {
            width: "100%",
            height: "100%",
            objectFit: el.objectFit || "contain",
            display: "block"
          };
          if (isVideo) {
            return /* @__PURE__ */ jsxRuntime2.jsx("div", { style: containerStyle, children: /* @__PURE__ */ jsxRuntime2.jsxs(
              "video",
              {
                ref: (videoEl) => {
                  if (videoEl && url) {
                    if (!videoEl.src || videoEl.src === "http://localhost:3000/" || videoEl.src === window.location.href) {
                      videoEl.src = url;
                    }
                    setTimeout(() => {
                      if (videoEl.readyState >= 2) {
                        videoEl.play().catch((error) => {
                          console.error("[Video Play Error]", el.name, error);
                        });
                      } else {
                        setTimeout(() => videoEl.play().catch(() => {
                        }), 500);
                      }
                    }, 100);
                  }
                },
                src: url,
                style: mediaStyle,
                autoPlay: true,
                loop: true,
                muted: true,
                playsInline: true,
                children: [
                  /* @__PURE__ */ jsxRuntime2.jsx("source", { src: url, type: "video/webm" }),
                  /* @__PURE__ */ jsxRuntime2.jsx("source", { src: url, type: "video/mp4" }),
                  "Your browser doesn't support this video format."
                ]
              }
            ) }, el.id);
          } else {
            return /* @__PURE__ */ jsxRuntime2.jsx("div", { style: containerStyle, children: /* @__PURE__ */ jsxRuntime2.jsx(
              "img",
              {
                src: url,
                alt: el.name,
                style: mediaStyle
              }
            ) }, el.id);
          }
        }
        case UIElementType.SettingsSlider: {
          const el = element;
          let value;
          let min;
          let max;
          let step;
          if (el.variableId) {
            value = Number(variables2[el.variableId]) || (el.minValue ?? 0);
            min = el.minValue ?? 0;
            max = el.maxValue ?? 100;
            step = 1;
          } else {
            const settingKey = el.setting === "textSpeed" ? "textSpeed" : el.setting;
            value = settings[settingKey];
            min = el.setting === "textSpeed" ? 10 : 0;
            max = el.setting === "textSpeed" ? 100 : 1;
            step = el.setting === "textSpeed" ? 1 : 0.01;
          }
          const thumbUrl = el.thumbImage ? getElementAssetUrl(el.thumbImage) : null;
          const trackUrl = el.trackImage ? getElementAssetUrl(el.trackImage) : null;
          const customSliderStyle = {
            // Custom thumb via CSS variable (if no image)
            ...el.thumbColor && !thumbUrl ? {
              ["--slider-thumb-color"]: el.thumbColor
            } : {},
            // Custom track via CSS variable (if no image)
            ...el.trackColor && !trackUrl ? {
              ["--slider-track-color"]: el.trackColor
            } : {},
            // Thumb image as background
            ...thumbUrl ? {
              ["--slider-thumb-bg"]: `url(${thumbUrl})`
            } : {},
            // Track image as background
            ...trackUrl ? {
              ["--slider-track-bg"]: `url(${trackUrl})`
            } : {}
          };
          return /* @__PURE__ */ jsxRuntime2.jsx("div", { style, className: "flex items-center", children: /* @__PURE__ */ jsxRuntime2.jsx(
            "input",
            {
              type: "range",
              min,
              max,
              step,
              value,
              onChange: (e) => {
                const newValue = parseFloat(e.target.value);
                if (el.variableId) {
                  onVariableChange == null ? void 0 : onVariableChange(el.variableId, newValue);
                } else {
                  onSettingsChange(el.setting, newValue);
                }
                if (el.actions && el.actions.length > 0) {
                  el.actions.forEach((action) => onAction(action));
                }
              },
              style: customSliderStyle,
              className: thumbUrl || trackUrl ? "custom-slider" : ""
            }
          ) }, el.id);
        }
        case UIElementType.SettingsToggle: {
          const el = element;
          let isChecked;
          if (el.variableId) {
            const currentValue = variables2[el.variableId];
            if (el.checkedValue !== void 0 && el.uncheckedValue !== void 0) {
              isChecked = currentValue === el.checkedValue;
            } else {
              isChecked = Boolean(currentValue);
            }
          } else {
            isChecked = settings[el.setting];
          }
          const checkboxImage = isChecked ? el.checkedImage : el.uncheckedImage;
          const imageUrl = checkboxImage ? getElementAssetUrl(checkboxImage) : null;
          const handleToggle = () => {
            if (el.variableId) {
              if (el.checkedValue !== void 0 && el.uncheckedValue !== void 0) {
                const newValue = isChecked ? el.uncheckedValue : el.checkedValue;
                onVariableChange == null ? void 0 : onVariableChange(el.variableId, newValue);
              } else {
                onVariableChange == null ? void 0 : onVariableChange(el.variableId, !isChecked);
              }
            } else {
              onSettingsChange(el.setting, !isChecked);
            }
            if (el.actions && el.actions.length > 0) {
              el.actions.forEach((action) => onAction(action));
            }
          };
          return /* @__PURE__ */ jsxRuntime2.jsxs("div", { style, className: "flex items-center gap-2", children: [
            imageUrl ? /* @__PURE__ */ jsxRuntime2.jsx(
              "img",
              {
                src: imageUrl,
                alt: isChecked ? "checked" : "unchecked",
                onClick: handleToggle,
                className: "h-5 w-5 cursor-pointer object-contain"
              }
            ) : /* @__PURE__ */ jsxRuntime2.jsx(
              "input",
              {
                type: "checkbox",
                checked: isChecked,
                onChange: handleToggle,
                className: "h-5 w-5",
                style: el.checkboxColor ? { accentColor: el.checkboxColor } : {}
              }
            ),
            /* @__PURE__ */ jsxRuntime2.jsx("label", { style: fontSettingsToStyle(el.font), children: el.text })
          ] }, el.id);
        }
        case UIElementType.SaveSlotGrid: {
          const el = element;
          const isSaveMode = screenId === project2.ui.saveScreenId;
          return /* @__PURE__ */ jsxRuntime2.jsx("div", { style, className: "grid grid-cols-2 gap-4 overflow-y-auto p-2", children: Array.from({ length: el.slotCount }).map((_, i) => {
            const slotData = gameSaves[i + 1];
            const action = isSaveMode ? { type: UIActionType.SaveGame, slotNumber: i + 1 } : { type: UIActionType.LoadGame, slotNumber: i + 1 };
            return /* @__PURE__ */ jsxRuntime2.jsxs(
              "button",
              {
                onClick: () => {
                  if (!isSaveMode && !slotData) return;
                  onAction(action);
                },
                disabled: !isSaveMode && !slotData,
                className: "aspect-video bg-slate-800/80 p-3 rounded-lg border-2 border-slate-600 hover:border-sky-400 disabled:opacity-50 disabled:hover:border-slate-600 flex flex-col justify-between text-left",
                style: fontSettingsToStyle(el.font),
                children: [
                  /* @__PURE__ */ jsxRuntime2.jsxs("p", { className: "font-bold text-sky-300", children: [
                    "Slot ",
                    i + 1
                  ] }),
                  slotData ? /* @__PURE__ */ jsxRuntime2.jsxs("div", { className: "text-sm", children: [
                    /* @__PURE__ */ jsxRuntime2.jsx("p", { className: "truncate", children: slotData.sceneName }),
                    /* @__PURE__ */ jsxRuntime2.jsx("p", { className: "text-slate-400", children: new Date(slotData.timestamp).toLocaleString() })
                  ] }) : /* @__PURE__ */ jsxRuntime2.jsx("div", { className: "flex-grow flex items-center justify-center text-slate-500", children: el.emptySlotText })
                ]
              },
              i
            );
          }) }, el.id);
        }
        case UIElementType.CharacterPreview: {
          const el = element;
          const character = project2.characters[el.characterId];
          if (!character) return null;
          console.log(`[CharacterPreview] layerVariableMap:`, el.layerVariableMap);
          console.log(`[CharacterPreview] Available variables:`, Object.keys(variables2));
          const imageUrls = [];
          const videoUrls = [];
          let hasVideo = false;
          let videoLoop = false;
          if (character.baseVideoUrl) {
            videoUrls.push(character.baseVideoUrl);
            hasVideo = true;
            videoLoop = !!character.baseVideoLoop;
          } else if (character.baseImageUrl) {
            imageUrls.push(character.baseImageUrl);
          }
          const defaultExpression = el.expressionId ? character.expressions[el.expressionId] : null;
          Object.entries(character.layers).forEach(([layerId, layer]) => {
            const variableId = el.layerVariableMap[layerId];
            let asset = null;
            console.log(`[CharacterPreview] Processing layer ${layer.name} (${layerId}), mapped variableId:`, variableId);
            if (variableId && variables2) {
              const assetId = String(variables2[variableId] || "");
              console.log(`[CharacterPreview] Layer ${layer.name} (${layerId}): variableId=${variableId}, assetId from variable="${assetId}"`);
              console.log(`[CharacterPreview] Available assets in layer:`, Object.keys(layer.assets));
              if (assetId) {
                asset = layer.assets[assetId];
                if (asset) {
                  console.log(`[CharacterPreview] ✓ Found asset: ${asset.name}`);
                } else {
                  console.warn(`[CharacterPreview] ✗ Asset ID "${assetId}" not found in layer ${layer.name}!`);
                }
              } else {
                console.log(`[CharacterPreview] Variable ${variableId} is empty, skipping layer`);
              }
            } else if (defaultExpression && defaultExpression.layerConfiguration[layerId]) {
              const assetId = defaultExpression.layerConfiguration[layerId];
              console.log(`[CharacterPreview] Layer ${layer.name} using default expression asset: ${assetId}`);
              asset = assetId ? layer.assets[assetId] : null;
            } else {
              console.log(`[CharacterPreview] Layer ${layer.name} has no mapping and no default expression`);
            }
            if (asset) {
              if (asset.videoUrl) {
                videoUrls.push(asset.videoUrl);
                hasVideo = true;
                videoLoop = videoLoop || !!asset.loop;
              } else if (asset.imageUrl) {
                imageUrls.push(asset.imageUrl);
              }
            }
          });
          const containerStyle = {
            ...style,
            overflow: "hidden"
          };
          return /* @__PURE__ */ jsxRuntime2.jsx("div", { style: containerStyle, children: /* @__PURE__ */ jsxRuntime2.jsx("div", { className: "relative w-full h-full", children: hasVideo && videoUrls.length > 0 ? videoUrls.map((url, index) => /* @__PURE__ */ jsxRuntime2.jsx(
            "video",
            {
              src: url,
              autoPlay: true,
              muted: true,
              loop: videoLoop,
              playsInline: true,
              className: "absolute top-0 left-0 w-full h-full object-contain",
              style: { zIndex: index }
            },
            index
          )) : imageUrls.map((url, index) => /* @__PURE__ */ jsxRuntime2.jsx(
            "img",
            {
              src: url,
              alt: "",
              className: "absolute top-0 left-0 w-full h-full object-contain",
              style: { zIndex: index }
            },
            index
          )) }) }, el.id);
        }
        case UIElementType.TextInput: {
          const el = element;
          const currentValue = String(variables2[el.variableId] || "");
          return /* @__PURE__ */ jsxRuntime2.jsx(
            "div",
            {
              style,
              children: /* @__PURE__ */ jsxRuntime2.jsx(
                "input",
                {
                  type: "text",
                  value: currentValue,
                  onChange: (e) => {
                    onVariableChange == null ? void 0 : onVariableChange(el.variableId, e.target.value);
                  },
                  placeholder: el.placeholder,
                  maxLength: el.maxLength,
                  className: "w-full h-full outline-none",
                  style: {
                    backgroundColor: el.backgroundColor || "#1e293b",
                    color: ((_f = el.font) == null ? void 0 : _f.color) || "#f1f5f9",
                    fontSize: `${((_g = el.font) == null ? void 0 : _g.size) || 16}px`,
                    fontFamily: ((_h = el.font) == null ? void 0 : _h.family) || "Inter, system-ui, sans-serif",
                    fontWeight: ((_i = el.font) == null ? void 0 : _i.weight) || "normal",
                    fontStyle: ((_j = el.font) == null ? void 0 : _j.italic) ? "italic" : "normal",
                    border: `2px solid ${el.borderColor || "#475569"}`,
                    borderRadius: "4px",
                    padding: "8px 12px"
                  }
                }
              )
            },
            el.id
          );
        }
        case UIElementType.Dropdown: {
          const el = element;
          const currentValue = variables2[el.variableId];
          return /* @__PURE__ */ jsxRuntime2.jsx(
            "div",
            {
              style,
              children: /* @__PURE__ */ jsxRuntime2.jsx(
                "select",
                {
                  value: String(currentValue ?? ((_k = el.options[0]) == null ? void 0 : _k.value) ?? ""),
                  onChange: (e) => {
                    const selectedOption = el.options.find((opt) => String(opt.value) === e.target.value);
                    if (selectedOption) {
                      onVariableChange == null ? void 0 : onVariableChange(el.variableId, selectedOption.value);
                      if (el.actions && el.actions.length > 0) {
                        el.actions.forEach((action) => onAction(action));
                      }
                    }
                  },
                  className: "w-full h-full outline-none cursor-pointer",
                  style: {
                    backgroundColor: el.backgroundColor || "#1e293b",
                    color: ((_l = el.font) == null ? void 0 : _l.color) || "#f1f5f9",
                    fontSize: `${((_m = el.font) == null ? void 0 : _m.size) || 16}px`,
                    fontFamily: ((_n = el.font) == null ? void 0 : _n.family) || "Inter, system-ui, sans-serif",
                    fontWeight: ((_o = el.font) == null ? void 0 : _o.weight) || "normal",
                    fontStyle: ((_p = el.font) == null ? void 0 : _p.italic) ? "italic" : "normal",
                    border: `2px solid ${el.borderColor || "#475569"}`,
                    borderRadius: "4px",
                    padding: "8px 12px"
                  },
                  onMouseEnter: (e) => {
                    if (el.hoverColor) {
                      e.currentTarget.style.backgroundColor = el.hoverColor;
                    }
                  },
                  onMouseLeave: (e) => {
                    e.currentTarget.style.backgroundColor = el.backgroundColor || "#1e293b";
                  },
                  children: el.options.map((opt) => /* @__PURE__ */ jsxRuntime2.jsx("option", { value: String(opt.value), children: opt.label }, opt.id))
                }
              )
            },
            el.id
          );
        }
        case UIElementType.Checkbox: {
          const el = element;
          const currentValue = variables2[el.variableId];
          const isChecked = currentValue === el.checkedValue;
          return /* @__PURE__ */ jsxRuntime2.jsxs(
            "div",
            {
              style,
              className: "flex items-center gap-2 cursor-pointer",
              onClick: () => {
                const newValue = isChecked ? el.uncheckedValue : el.checkedValue;
                onVariableChange == null ? void 0 : onVariableChange(el.variableId, newValue);
                if (el.actions && el.actions.length > 0) {
                  el.actions.forEach((action) => onAction(action));
                }
              },
              children: [
                /* @__PURE__ */ jsxRuntime2.jsx(
                  "input",
                  {
                    type: "checkbox",
                    checked: isChecked,
                    onChange: () => {
                    },
                    className: "w-5 h-5 cursor-pointer",
                    style: {
                      accentColor: el.checkboxColor || "#3b82f6"
                    }
                  }
                ),
                /* @__PURE__ */ jsxRuntime2.jsx(
                  "span",
                  {
                    style: {
                      color: el.labelColor || "#f1f5f9",
                      fontSize: `${((_q = el.font) == null ? void 0 : _q.size) || 16}px`,
                      fontFamily: ((_r = el.font) == null ? void 0 : _r.family) || "Inter, system-ui, sans-serif",
                      fontWeight: ((_s = el.font) == null ? void 0 : _s.weight) || "normal",
                      fontStyle: ((_t = el.font) == null ? void 0 : _t.italic) ? "italic" : "normal",
                      cursor: "pointer",
                      userSelect: "none"
                    },
                    children: el.label
                  }
                )
              ]
            },
            el.id
          );
        }
        case UIElementType.AssetCycler: {
          const el = element;
          const character = project2.characters[el.characterId];
          const layer = character == null ? void 0 : character.layers[el.layerId];
          let currentAssetId = String(variables2[el.variableId] || "");
          console.log(`[AssetCycler] Rendering cycler for variable ${el.variableId}, current value:`, currentAssetId);
          let filteredAssetIds = el.assetIds;
          if (el.filterPattern) {
            const filterVarIds = el.filterVariableIds || (el.filterVariableId ? [el.filterVariableId] : []);
            if (filterVarIds.length > 0) {
              console.log(`[AssetCycler] Filter variables for ${el.variableId}:`, filterVarIds);
              const filterValues = {};
              let allFiltersHaveValues = true;
              for (const varId of filterVarIds) {
                const assetId = String(variables2[varId] || "");
                if (!assetId) {
                  allFiltersHaveValues = false;
                  break;
                }
                const asset = layer == null ? void 0 : layer.assets[assetId];
                const assetName = (asset == null ? void 0 : asset.name) || assetId;
                console.log(`[AssetCycler] Filter var ${varId}: assetId=${assetId}, assetName=${assetName}`);
                filterValues[varId] = assetName;
              }
              if (allFiltersHaveValues) {
                let pattern = el.filterPattern;
                const extractPart = (assetName, index) => {
                  const parts = assetName.split("_");
                  if (index >= 0 && index < parts.length) {
                    return parts[index];
                  }
                  return assetName;
                };
                for (const varId of filterVarIds) {
                  const assetName = filterValues[varId];
                  const indexedRegex = new RegExp(`\\{${varId}\\[(\\d+)\\]\\}`, "g");
                  pattern = pattern.replace(indexedRegex, (match, indexStr) => {
                    const index = parseInt(indexStr, 10);
                    const part = extractPart(assetName, index);
                    console.log(`[AssetCycler] Extracting part ${index} from ${assetName}: ${part}`);
                    return part;
                  });
                  const specificRegex = new RegExp(`\\{${varId}\\}`, "g");
                  pattern = pattern.replace(specificRegex, assetName);
                }
                const remainingPlaceholders = pattern.match(/\{[^}]*\}/g);
                if (remainingPlaceholders) {
                  for (let i = 0; i < Math.min(remainingPlaceholders.length, filterVarIds.length); i++) {
                    const varId = filterVarIds[i];
                    const assetName = filterValues[varId];
                    const indexMatch = remainingPlaceholders[i].match(/\[(\d+)\]/);
                    if (indexMatch) {
                      const index = parseInt(indexMatch[1], 10);
                      const part = extractPart(assetName, index);
                      console.log(`[AssetCycler] Generic placeholder [${index}] extracting from ${assetName}: ${part}`);
                      pattern = pattern.replace(/\{[^}]*\}/, part);
                    } else {
                      pattern = pattern.replace(/\{[^}]*\}/, assetName);
                    }
                  }
                }
                console.log(`[AssetCycler] Filtering with resolved pattern: ${pattern}`);
                filteredAssetIds = el.assetIds.filter((assetId) => {
                  const asset = layer == null ? void 0 : layer.assets[assetId];
                  if (!asset) return false;
                  const matches = asset.name.toLowerCase().includes(pattern.toLowerCase());
                  if (matches) {
                    console.log(`[AssetCycler] ✓ Match: ${asset.name} contains ${pattern}`);
                  }
                  return matches;
                });
                console.log(`[AssetCycler] Filtered assets (${filteredAssetIds.length}):`, filteredAssetIds);
              } else {
                console.log(`[AssetCycler] Not all filter variables have values yet, showing all ${filteredAssetIds.length} assets`);
              }
            }
          }
          const shouldInitialize = !currentAssetId && filteredAssetIds.length > 0;
          React2.useEffect(() => {
            if (shouldInitialize && onVariableChange) {
              const firstAsset = filteredAssetIds[0];
              console.log(`[AssetCycler] Initializing variable ${el.variableId} to:`, firstAsset);
              onVariableChange(el.variableId, firstAsset);
            }
          }, [shouldInitialize, filteredAssetIds, el.variableId, onVariableChange]);
          React2.useEffect(() => {
            if (el.filterVariableIds && el.filterVariableIds.length > 0 && filteredAssetIds.length > 0 && onVariableChange) {
              if (!filteredAssetIds.includes(currentAssetId)) {
                const firstFiltered = filteredAssetIds[0];
                console.log(`[AssetCycler] Filter changed - updating variable ${el.variableId} to first match:`, firstFiltered);
                onVariableChange(el.variableId, firstFiltered);
              }
            }
          }, [filteredAssetIds.join(","), el.filterVariableIds, el.variableId, currentAssetId, onVariableChange]);
          const currentIndex = filteredAssetIds.indexOf(currentAssetId);
          const currentAsset = currentAssetId && layer ? layer.assets[currentAssetId] : null;
          const handlePrevious = () => {
            if (filteredAssetIds.length === 0) return;
            const newIndex = currentIndex <= 0 ? filteredAssetIds.length - 1 : currentIndex - 1;
            console.log(`[AssetCycler] Previous: setting variable ${el.variableId} to:`, filteredAssetIds[newIndex]);
            onVariableChange == null ? void 0 : onVariableChange(el.variableId, filteredAssetIds[newIndex]);
          };
          const handleNext = () => {
            if (filteredAssetIds.length === 0) return;
            const newIndex = currentIndex >= filteredAssetIds.length - 1 ? 0 : currentIndex + 1;
            console.log(`[AssetCycler] Next: setting variable ${el.variableId} to:`, filteredAssetIds[newIndex]);
            onVariableChange == null ? void 0 : onVariableChange(el.variableId, filteredAssetIds[newIndex]);
          };
          return /* @__PURE__ */ jsxRuntime2.jsxs(
            "div",
            {
              style: {
                ...style,
                backgroundColor: el.backgroundColor || "rgba(30, 41, 59, 0.8)",
                borderRadius: "8px",
                padding: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                alignItems: "center",
                justifyContent: "center",
                opacity: el.visible === false ? 0 : 1,
                pointerEvents: el.visible === false ? "none" : "auto"
              },
              children: [
                el.label && /* @__PURE__ */ jsxRuntime2.jsx(
                  "div",
                  {
                    style: {
                      fontSize: `${(((_u = el.font) == null ? void 0 : _u.size) || 16) * 0.8}px`,
                      fontFamily: ((_v = el.font) == null ? void 0 : _v.family) || "Inter, system-ui, sans-serif",
                      fontWeight: ((_w = el.font) == null ? void 0 : _w.weight) || "normal",
                      fontStyle: ((_x = el.font) == null ? void 0 : _x.italic) ? "italic" : "normal",
                      color: ((_y = el.font) == null ? void 0 : _y.color) || "#f1f5f9",
                      opacity: 0.8,
                      textAlign: "center"
                    },
                    children: el.label
                  }
                ),
                /* @__PURE__ */ jsxRuntime2.jsxs("div", { style: { display: "flex", alignItems: "center", gap: "12px", width: "100%" }, children: [
                  /* @__PURE__ */ jsxRuntime2.jsx(
                    "button",
                    {
                      onClick: handlePrevious,
                      style: {
                        background: "none",
                        border: "none",
                        color: el.arrowColor || "#a855f7",
                        fontSize: `${el.arrowSize || 24}px`,
                        cursor: "pointer",
                        padding: "4px",
                        lineHeight: 1,
                        opacity: filteredAssetIds.length > 0 ? 1 : 0.3,
                        transition: "opacity 0.2s"
                      },
                      disabled: filteredAssetIds.length === 0,
                      children: "◀"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntime2.jsx(
                    "div",
                    {
                      style: {
                        flex: 1,
                        fontSize: `${((_z = el.font) == null ? void 0 : _z.size) || 16}px`,
                        fontFamily: ((_A = el.font) == null ? void 0 : _A.family) || "Inter, system-ui, sans-serif",
                        fontWeight: ((_B = el.font) == null ? void 0 : _B.weight) || "normal",
                        fontStyle: ((_C = el.font) == null ? void 0 : _C.italic) ? "italic" : "normal",
                        color: ((_D = el.font) == null ? void 0 : _D.color) || "#f1f5f9",
                        textAlign: "center",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      },
                      children: el.showAssetName && currentAsset ? currentAsset.name : currentIndex >= 0 ? `${currentIndex + 1} / ${filteredAssetIds.length}` : "–"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntime2.jsx(
                    "button",
                    {
                      onClick: handleNext,
                      style: {
                        background: "none",
                        border: "none",
                        color: el.arrowColor || "#a855f7",
                        fontSize: `${el.arrowSize || 24}px`,
                        cursor: "pointer",
                        padding: "4px",
                        lineHeight: 1,
                        opacity: filteredAssetIds.length > 0 ? 1 : 0.3,
                        transition: "opacity 0.2s"
                      },
                      disabled: filteredAssetIds.length === 0,
                      children: "▶"
                    }
                  )
                ] })
              ]
            },
            el.id
          );
        }
        default:
          return null;
      }
    };
    const transitionType = isClosing ? screen.transitionOut || "fade" : screen.transitionIn || "fade";
    const duration = screen.transitionDuration || 300;
    const screenTransitionStyle = {
      animation: transitionType !== "none" ? `screenTransition${transitionType}${isClosing ? "Out" : ""} ${duration}ms ease-out forwards` : void 0
    };
    screen.showDialogue && variables;
    return /* @__PURE__ */ jsxRuntime2.jsxs("div", { className: "absolute inset-0 w-full h-full", style: screenTransitionStyle, children: [
      getBackgroundElement(),
      Object.values(screen.elements).map((element) => renderElement(element, variables, project))
    ] }, `${screenId}-${isClosing ? "closing" : "open"}`);
  });
  const LivePreview = ({ onClose, hideCloseButton = false, autoStartMusic = false }) => {
    const { project } = useProject();
    const getValidTitleScreenId = React2.useCallback(() => {
      if (project.ui.titleScreenId && project.uiScreens[project.ui.titleScreenId]) {
        return project.ui.titleScreenId;
      }
      const fallbackByName = Object.values(project.uiScreens).find((s) => s.name.toLowerCase() === "title screen");
      if (fallbackByName) {
        return fallbackByName.id;
      }
      return Object.keys(project.uiScreens)[0] || null;
    }, [project.ui.titleScreenId, project.uiScreens]);
    const titleScreenId = getValidTitleScreenId();
    const [screenStack, setScreenStack] = React2.useState(titleScreenId ? [titleScreenId] : []);
    const [hudStack, setHudStack] = React2.useState([]);
    const [closingScreens, setClosingScreens] = React2.useState(/* @__PURE__ */ new Set());
    const [settings, setSettings] = React2.useState(defaultSettings);
    const [playerState, setPlayerState] = React2.useState(null);
    const [gameSaves, setGameSaves] = React2.useState({});
    const [isJustLoaded, setIsJustLoaded] = React2.useState(false);
    const [menuVariables, setMenuVariables] = React2.useState(() => {
      const initVars = {};
      Object.values(project.variables).forEach((v) => {
        initVars[v.id] = v.defaultValue;
      });
      return initVars;
    });
    React2.useEffect(() => {
      const updatedVars = {};
      Object.values(project.variables).forEach((v) => {
        updatedVars[v.id] = menuVariables[v.id] !== void 0 ? menuVariables[v.id] : v.defaultValue;
      });
      setMenuVariables(updatedVars);
    }, [project.variables]);
    React2.useEffect(() => {
      const loadCustomFonts = async () => {
        for (const charId in project.characters) {
          const char = project.characters[charId];
          if (char.fontUrl && char.fontFamily) {
            try {
              const fontFace = new FontFace(char.fontFamily, `url(${char.fontUrl})`);
              await fontFace.load();
              document.fonts.add(fontFace);
              console.log(`✓ Loaded custom font: ${char.fontFamily}`);
            } catch (error) {
              console.error(`Failed to load custom font for ${char.name}:`, error);
            }
          }
        }
      };
      loadCustomFonts();
    }, [project.characters]);
    const musicAudioRef = React2.useRef(new Audio());
    const ambientNoiseAudioRef = React2.useRef(new Audio());
    const menuMusicUrlRef = React2.useRef(null);
    const menuAmbientUrlRef = React2.useRef(null);
    const audioFadeInterval = React2.useRef(null);
    const ambientFadeInterval = React2.useRef(null);
    const stageRef = React2.useRef(null);
    const stageSize = useStageSize(stageRef);
    const audioCtxRef = React2.useRef(null);
    const sfxBufferCacheRef = React2.useRef(/* @__PURE__ */ new Map());
    const sfxSourceNodesRef = React2.useRef([]);
    const sfxMasterGainRef = React2.useRef(null);
    React2.useRef(null);
    React2.useRef(/* @__PURE__ */ new Map());
    const MAX_SIMULTANEOUS_SFX = 8;
    const savesPersistentRef = React2.useRef(true);
    const inMemorySavesRef = React2.useRef({});
    const queuedMusicRef = React2.useRef(null);
    const userGestureDetectedRef = React2.useRef(false);
    const sfxPoolRef = React2.useRef([]);
    const lastProcessedCommandRef = React2.useRef(null);
    const activeEffectTimeoutsRef = React2.useRef([]);
    const activeFlashRef = React2.useRef(null);
    const activeShakeRef = React2.useRef(null);
    const [flashTrigger, setFlashTrigger] = React2.useState(0);
    const assetResolver = React2.useCallback((assetId, type) => {
      var _a, _b, _c;
      if (!assetId) return null;
      switch (type) {
        case "audio":
          return ((_a = project.audio[assetId]) == null ? void 0 : _a.audioUrl) || null;
        case "video":
          return ((_b = project.videos[assetId]) == null ? void 0 : _b.videoUrl) || null;
        case "image": {
          if (project.backgrounds[assetId]) {
            const bg = project.backgrounds[assetId];
            return bg.videoUrl || bg.imageUrl || null;
          }
          if (project.images && project.images[assetId]) {
            const img = project.images[assetId];
            return img.videoUrl || img.imageUrl || null;
          }
          if (project.videos[assetId]) {
            return ((_c = project.videos[assetId]) == null ? void 0 : _c.videoUrl) || null;
          }
          for (const charId in project.characters) {
            const char = project.characters[charId];
            if (char.id === assetId) {
              return char.baseVideoUrl || char.baseImageUrl || null;
            }
            for (const layerId in char.layers) {
              const layer = char.layers[layerId];
              if (layer.assets[assetId]) {
                const asset = layer.assets[assetId];
                return asset.videoUrl || asset.imageUrl || null;
              }
            }
          }
          return null;
        }
      }
    }, [project]);
    const getAssetMetadata = React2.useCallback((assetId, type) => {
      if (!assetId) return { isVideo: false, loop: false };
      if (project.backgrounds[assetId]) {
        const bg = project.backgrounds[assetId];
        return { isVideo: !!bg.isVideo, loop: !!bg.loop };
      }
      if (project.images && project.images[assetId]) {
        const img = project.images[assetId];
        return { isVideo: !!img.isVideo, loop: !!img.loop };
      }
      for (const charId in project.characters) {
        const char = project.characters[charId];
        if (char.id === assetId) {
          return { isVideo: !!char.isBaseVideo, loop: !!char.baseVideoLoop };
        }
        for (const layerId in char.layers) {
          const layer = char.layers[layerId];
          if (layer.assets[assetId]) {
            const asset = layer.assets[assetId];
            return { isVideo: !!asset.isVideo, loop: !!asset.loop };
          }
        }
      }
      return { isVideo: false, loop: false };
    }, [project]);
    const fadeAudio = React2.useCallback((audioElement, targetVolume, duration, onComplete) => {
      const intervalRef = audioElement === musicAudioRef.current ? audioFadeInterval : ambientFadeInterval;
      if (intervalRef.current) clearInterval(intervalRef.current);
      const startVolume = audioElement.volume;
      const volumeChange = targetVolume - startVolume;
      if (duration === 0) {
        audioElement.volume = targetVolume;
        onComplete == null ? void 0 : onComplete();
        return;
      }
      const startTime = Date.now();
      intervalRef.current = window.setInterval(() => {
        const elapsedTime = Date.now() - startTime;
        const progress = Math.min(elapsedTime / (duration * 1e3), 1);
        audioElement.volume = startVolume + volumeChange * progress;
        if (progress >= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
          onComplete == null ? void 0 : onComplete();
        }
      }, 30);
    }, []);
    const stopAndResetMusic = React2.useCallback(() => {
      const audio = musicAudioRef.current;
      if (audio && !audio.paused) {
        fadeAudio(audio, 0, 0.5, () => {
          audio.pause();
          audio.src = "";
        });
      } else if (audio) {
        audio.src = "";
      }
      menuMusicUrlRef.current = null;
      const ambientAudio = ambientNoiseAudioRef.current;
      if (ambientAudio && !ambientAudio.paused) {
        fadeAudio(ambientAudio, 0, 0.5, () => {
          ambientAudio.pause();
          ambientAudio.src = "";
        });
      } else if (ambientAudio) {
        ambientAudio.src = "";
      }
      menuAmbientUrlRef.current = null;
    }, [fadeAudio]);
    const getGameSaves = React2.useCallback(() => {
      try {
        const savesJson = localStorage.getItem(`vn-saves-${project.id}`);
        return savesJson ? JSON.parse(savesJson) : {};
      } catch (e) {
        console.warn("Failed to load saves from localStorage:", e);
        return {};
      }
    }, [project.id]);
    const saveGameSaves = React2.useCallback((saves) => {
      try {
        localStorage.setItem(`vn-saves-${project.id}`, JSON.stringify(saves));
        savesPersistentRef.current = true;
      } catch (e) {
        console.error("Failed to save to localStorage:", e);
        savesPersistentRef.current = false;
        inMemorySavesRef.current = saves;
      }
    }, [project.id]);
    React2.useCallback(() => {
      const saves = savesPersistentRef.current ? getGameSaves() : inMemorySavesRef.current;
      const blob = new Blob([JSON.stringify(saves, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vn-saves-${project.id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, [getGameSaves, project.id]);
    React2.useEffect(() => {
      setGameSaves(getGameSaves());
    }, [getGameSaves, screenStack]);
    const saveGame = (slotNumber) => {
      var _a;
      if (!playerState) return;
      const musicCurrentTime = musicAudioRef.current ? musicAudioRef.current.currentTime : 0;
      const finalMusicState = {
        ...playerState.musicState,
        currentTime: musicCurrentTime,
        isPlaying: !musicAudioRef.current.paused
      };
      const saves = getGameSaves();
      saves[slotNumber] = {
        timestamp: Date.now(),
        sceneName: ((_a = project.scenes[playerState.currentSceneId]) == null ? void 0 : _a.name) || "Unknown Scene",
        playerStateData: {
          currentSceneId: playerState.currentSceneId,
          currentCommands: playerState.currentCommands,
          currentIndex: playerState.currentIndex,
          commandStack: playerState.commandStack,
          variables: playerState.variables,
          stageState: playerState.stageState,
          musicState: finalMusicState
        }
      };
      if (!savesPersistentRef.current) {
        inMemorySavesRef.current = saves;
      } else {
        saveGameSaves(saves);
      }
      setGameSaves(saves);
    };
    const loadGame = (slotNumber) => {
      var _a;
      stopAndResetMusic();
      const saves = savesPersistentRef.current ? getGameSaves() : inMemorySavesRef.current;
      const saveData = saves[slotNumber];
      if (saveData) {
        setPlayerState({
          mode: "playing",
          currentSceneId: saveData.playerStateData.currentSceneId,
          currentCommands: saveData.playerStateData.currentCommands || ((_a = project.scenes[saveData.playerStateData.currentSceneId]) == null ? void 0 : _a.commands) || [],
          currentIndex: saveData.playerStateData.currentIndex ?? 0,
          commandStack: saveData.playerStateData.commandStack || [],
          variables: saveData.playerStateData.variables,
          stageState: saveData.playerStateData.stageState,
          history: [],
          uiState: { dialogue: null, choices: null, textInput: null, movieUrl: null, isWaitingForInput: false, isTransitioning: false, transitionElement: null, flash: null, showHistory: false, screenSceneId: null },
          musicState: saveData.playerStateData.musicState
        });
        setScreenStack([]);
        setHudStack([]);
        setIsJustLoaded(true);
      }
    };
    const startNewGame = React2.useCallback(() => {
      var _a;
      stopAndResetMusic();
      const initialVariables = { ...menuVariables };
      let startSceneId = project.startSceneId;
      const startScene = project.scenes[startSceneId];
      if (startScene && startScene.conditions && startScene.conditions.length > 0) {
        const conditionsMet = startScene.conditions.every((condition) => {
          const varValue = initialVariables[condition.variableId];
          if (varValue === void 0) return false;
          switch (condition.operator) {
            case "is true":
              return !!varValue;
            case "is false":
              return !varValue;
            case "==":
              return String(varValue).toLowerCase() == String(condition.value).toLowerCase();
            case "!=":
              return String(varValue).toLowerCase() != String(condition.value).toLowerCase();
            case ">":
              return Number(varValue) > Number(condition.value);
            case "<":
              return Number(varValue) < Number(condition.value);
            case ">=":
              return Number(varValue) >= Number(condition.value);
            case "<=":
              return Number(varValue) <= Number(condition.value);
            case "contains":
              return String(varValue).toLowerCase().includes(String(condition.value).toLowerCase());
            case "startsWith":
              return String(varValue).toLowerCase().startsWith(String(condition.value).toLowerCase());
            default:
              return false;
          }
        });
        if (!conditionsMet && startScene.fallbackSceneId) {
          console.log(`Start scene "${startScene.name}" conditions not met, using fallback`);
          startSceneId = startScene.fallbackSceneId;
        }
      }
      setPlayerState({
        mode: "playing",
        currentSceneId: startSceneId,
        currentCommands: ((_a = project.scenes[startSceneId]) == null ? void 0 : _a.commands) || [],
        currentIndex: 0,
        commandStack: [],
        variables: initialVariables,
        stageState: { backgroundUrl: null, characters: {}, textOverlays: [], imageOverlays: [], buttonOverlays: [], screen: { shake: { active: false, intensity: 0 }, tint: "transparent", zoom: 1, panX: 0, panY: 0, transitionDuration: 0.5 } },
        history: [],
        uiState: { dialogue: null, choices: null, textInput: null, movieUrl: null, isWaitingForInput: false, isTransitioning: false, transitionElement: null, flash: null, showHistory: false, screenSceneId: null },
        musicState: { audioId: null, loop: false, currentTime: 0, isPlaying: false }
      });
      setScreenStack([]);
      setHudStack([]);
    }, [project, stopAndResetMusic, menuVariables]);
    const getAssetNameFromId2 = React2.useCallback((assetId) => {
      const background = project.backgrounds[assetId];
      if (background) return background.name;
      const image = project.images[assetId];
      if (image) return image.name;
      const video = project.videos[assetId];
      if (video) return video.name;
      const audio = project.audio[assetId];
      if (audio) return audio.name;
      for (const character of Object.values(project.characters)) {
        if (character && character.layers) {
          for (const layer of Object.values(character.layers)) {
            if (layer && layer.assets) {
              const asset = layer.assets[assetId];
              if (asset) return asset.name;
            }
          }
        }
      }
      return null;
    }, [project]);
    const evaluateConditions2 = React2.useCallback((conditions, variables) => {
      if (!conditions || conditions.length === 0) {
        return true;
      }
      return conditions.every((condition) => {
        const varValue = variables[condition.variableId];
        const projectVar = project.variables[condition.variableId];
        const effectiveVarValue = varValue !== void 0 ? varValue : projectVar ? projectVar.defaultValue : void 0;
        console.log("[DEBUG evaluateConditions]", {
          variableId: condition.variableId,
          operator: condition.operator,
          conditionValue: condition.value,
          effectiveVarValue,
          varValue,
          defaultValue: projectVar == null ? void 0 : projectVar.defaultValue
        });
        if (effectiveVarValue === void 0) {
          console.log("[DEBUG evaluateConditions] Variable undefined, returning false");
          return false;
        }
        let result = false;
        const stringVarValue = String(effectiveVarValue);
        const stringCondValue = String(condition.value);
        let assetName = null;
        if (stringVarValue.startsWith("asset-")) {
          assetName = getAssetNameFromId2(stringVarValue);
          console.log("[DEBUG evaluateConditions] Variable contains asset ID, resolved name:", assetName);
        }
        switch (condition.operator) {
          case "is true":
            result = !!effectiveVarValue;
            break;
          case "is false":
            result = !effectiveVarValue;
            break;
          case "==":
            result = stringVarValue.toLowerCase() === stringCondValue.toLowerCase() || assetName && assetName.toLowerCase() === stringCondValue.toLowerCase();
            break;
          case "!=":
            result = stringVarValue.toLowerCase() !== stringCondValue.toLowerCase() && (!assetName || assetName.toLowerCase() !== stringCondValue.toLowerCase());
            break;
          case ">":
            result = Number(effectiveVarValue) > Number(condition.value);
            break;
          case "<":
            result = Number(effectiveVarValue) < Number(condition.value);
            break;
          case ">=":
            result = Number(effectiveVarValue) >= Number(condition.value);
            break;
          case "<=":
            result = Number(effectiveVarValue) <= Number(condition.value);
            break;
          case "contains":
            result = stringVarValue.toLowerCase().includes(stringCondValue.toLowerCase()) || assetName && assetName.toLowerCase().includes(stringCondValue.toLowerCase());
            break;
          case "startsWith":
            result = stringVarValue.toLowerCase().startsWith(stringCondValue.toLowerCase()) || assetName && assetName.toLowerCase().startsWith(stringCondValue.toLowerCase());
            break;
          default:
            result = false;
        }
        console.log("[DEBUG evaluateConditions] Result:", result);
        return result;
      });
    }, [project.variables, getAssetNameFromId2]);
    const navigateToScene = React2.useCallback((targetSceneId, variables) => {
      let sceneToPlay = targetSceneId;
      let attempts = 0;
      const maxAttempts = 50;
      while (attempts < maxAttempts) {
        const scene = project.scenes[sceneToPlay];
        if (!scene) {
          console.error(`Scene not found: ${sceneToPlay}`);
          return targetSceneId;
        }
        if (evaluateConditions2(scene.conditions, variables)) {
          return sceneToPlay;
        }
        if (scene.fallbackSceneId && project.scenes[scene.fallbackSceneId]) {
          console.log(`Scene "${scene.name}" conditions failed, jumping to fallback: ${scene.fallbackSceneId}`);
          sceneToPlay = scene.fallbackSceneId;
        } else {
          const sceneIds = Object.keys(project.scenes);
          const currentIndex = sceneIds.indexOf(sceneToPlay);
          if (currentIndex !== -1 && currentIndex < sceneIds.length - 1) {
            sceneToPlay = sceneIds[currentIndex + 1];
            console.log(`Scene "${scene.name}" conditions failed, trying next scene: ${sceneToPlay}`);
          } else {
            console.log(`Scene "${scene.name}" conditions failed and no fallback/next scene available`);
            return sceneToPlay;
          }
        }
        attempts++;
      }
      console.error("Scene navigation exceeded max attempts - possible circular fallback");
      return targetSceneId;
    }, [project.scenes, evaluateConditions2]);
    React2.useEffect(() => {
      if ((playerState == null ? void 0 : playerState.mode) === "playing") {
        return;
      }
      const audio = musicAudioRef.current;
      const activeScreen = screenStack.length > 0 ? project.uiScreens[screenStack[screenStack.length - 1]] : null;
      if (!activeScreen) {
        if (!audio.paused) {
          fadeAudio(audio, 0, 0.5, () => audio.pause());
        }
        menuMusicUrlRef.current = null;
        return;
      }
      const musicInfo = activeScreen.music;
      if ((playerState == null ? void 0 : playerState.mode) === "paused" && musicInfo.policy === "continue") {
        return;
      }
      const newAudioUrl = (musicInfo == null ? void 0 : musicInfo.audioId) ? assetResolver(musicInfo.audioId, "audio") : null;
      const normalize = (value) => {
        if (!value) return null;
        try {
          return new URL(value, window.location.href).href;
        } catch (e) {
          return value;
        }
      };
      const currentSrcNormalized = audio.src ? normalize(audio.src) : null;
      const newSrcNormalized = normalize(newAudioUrl);
      if (!newAudioUrl) {
        if (!audio.paused) {
          fadeAudio(audio, 0, 0.5, () => audio.pause());
        }
        menuMusicUrlRef.current = null;
        return;
      }
      const startPlayback = () => {
        audio.loop = true;
        audio.play().then(() => {
          menuMusicUrlRef.current = newAudioUrl;
          fadeAudio(audio, settings.musicVolume, 0.5);
        }).catch((e) => {
          console.error("Menu music play failed:", e);
          if (!userGestureDetectedRef.current) {
            queuedMusicRef.current = { url: newAudioUrl, loop: true, fadeDuration: 0.5 };
          }
        });
      };
      if (currentSrcNormalized !== newSrcNormalized) {
        audio.src = newAudioUrl;
        audio.load();
        startPlayback();
      } else if (audio.paused) {
        startPlayback();
      } else {
        menuMusicUrlRef.current = newAudioUrl;
      }
    }, [screenStack, playerState == null ? void 0 : playerState.mode, project.uiScreens, assetResolver, settings.musicVolume, fadeAudio]);
    React2.useEffect(() => {
      if (musicAudioRef.current) musicAudioRef.current.volume = settings.musicVolume;
    }, [settings.musicVolume]);
    React2.useEffect(() => {
      const isInActiveGameplay = (playerState == null ? void 0 : playerState.mode) === "playing" && screenStack.length === 0;
      if (isInActiveGameplay) {
        return;
      }
      const audio = ambientNoiseAudioRef.current;
      const activeScreen = screenStack.length > 0 ? project.uiScreens[screenStack[screenStack.length - 1]] : null;
      if (!activeScreen) {
        if (audio && !audio.paused) {
          fadeAudio(audio, 0, 0.5, () => audio.pause());
        }
        menuAmbientUrlRef.current = null;
        return;
      }
      const ambientInfo = activeScreen.ambientNoise;
      if ((playerState == null ? void 0 : playerState.mode) === "paused" && ambientInfo.policy === "stop") {
        if (audio && !audio.paused) {
          fadeAudio(audio, 0, 0.5, () => audio.pause());
        }
        return;
      }
      const newAudioUrl = (ambientInfo == null ? void 0 : ambientInfo.audioId) ? assetResolver(ambientInfo.audioId, "audio") : null;
      const normalize = (value) => {
        if (!value) return null;
        try {
          return new URL(value, window.location.href).href;
        } catch (e) {
          return value;
        }
      };
      const currentSrcNormalized = (audio == null ? void 0 : audio.src) ? normalize(audio.src) : null;
      const newSrcNormalized = normalize(newAudioUrl);
      if (!newAudioUrl) {
        if (audio && !audio.paused) {
          fadeAudio(audio, 0, 0.5, () => audio.pause());
        }
        menuAmbientUrlRef.current = null;
        return;
      }
      const startAmbientPlayback = () => {
        if (!audio) return;
        audio.loop = true;
        audio.volume = 0;
        audio.play().then(() => {
          menuAmbientUrlRef.current = newAudioUrl;
          fadeAudio(audio, settings.sfxVolume, 0.5);
        }).catch((e) => {
          console.error("[Ambient] Play failed:", e);
        });
      };
      if (currentSrcNormalized !== newSrcNormalized) {
        if (!audio) return;
        audio.src = newAudioUrl;
        audio.load();
        startAmbientPlayback();
      } else if (audio && audio.paused) {
        startAmbientPlayback();
      } else {
        menuAmbientUrlRef.current = newAudioUrl;
      }
    }, [screenStack, playerState == null ? void 0 : playerState.mode, project.uiScreens, assetResolver, settings.sfxVolume, fadeAudio]);
    React2.useEffect(() => {
      if (ambientNoiseAudioRef.current) ambientNoiseAudioRef.current.volume = settings.sfxVolume;
    }, [settings.sfxVolume]);
    React2.useEffect(() => {
      if ((playerState == null ? void 0 : playerState.mode) !== "playing" || screenStack.length > 0) {
        return;
      }
      const normalize = (value) => {
        if (!value) return null;
        try {
          return new URL(value, window.location.href).href;
        } catch (e) {
          return value;
        }
      };
      const musicAudio = musicAudioRef.current;
      if (menuMusicUrlRef.current) {
        const currentSrc = (musicAudio == null ? void 0 : musicAudio.src) ? normalize(musicAudio.src) : null;
        const menuSrc = normalize(menuMusicUrlRef.current);
        if (currentSrc && menuSrc && currentSrc === menuSrc && musicAudio && !musicAudio.paused) {
          fadeAudio(musicAudio, 0, 0.5, () => musicAudio.pause());
        }
        menuMusicUrlRef.current = null;
      }
      const ambientAudio = ambientNoiseAudioRef.current;
      if (menuAmbientUrlRef.current && ambientAudio && !ambientAudio.paused) {
        fadeAudio(ambientAudio, 0, 0.5, () => ambientAudio.pause());
        menuAmbientUrlRef.current = null;
      }
    }, [playerState == null ? void 0 : playerState.mode, screenStack, fadeAudio]);
    React2.useEffect(() => {
      const handler = () => {
        userGestureDetectedRef.current = true;
        const queued = queuedMusicRef.current;
        if (queued) {
          const audio = musicAudioRef.current;
          audio.src = queued.url;
          audio.loop = queued.loop;
          audio.load();
          audio.play().then(() => {
            fadeAudio(audio, settings.musicVolume, queued.fadeDuration);
            queuedMusicRef.current = null;
          }).catch((e) => console.error("Queued music play failed:", e));
        }
      };
      window.addEventListener("click", handler, { once: true });
      return () => window.removeEventListener("click", handler);
    }, [fadeAudio, settings.musicVolume]);
    React2.useEffect(() => {
      if (autoStartMusic) {
        userGestureDetectedRef.current = true;
      }
    }, [autoStartMusic]);
    React2.useEffect(() => {
      if (isJustLoaded && (playerState == null ? void 0 : playerState.mode) === "playing") {
        const { musicState } = playerState;
        if (musicState.audioId) {
          const audio = musicAudioRef.current;
          const url = assetResolver(musicState.audioId, "audio");
          if (url) {
            audio.src = url;
            audio.loop = musicState.loop;
            audio.currentTime = musicState.currentTime;
            audio.play().then(() => {
              fadeAudio(audio, settings.musicVolume, 0.5);
            }).catch((e) => console.error("Failed to resume music on load:", e));
          }
        }
        setIsJustLoaded(false);
      }
    }, [isJustLoaded, playerState, assetResolver, fadeAudio, settings.musicVolume]);
    const stopAllSfx = React2.useCallback(() => {
      try {
        sfxSourceNodesRef.current.forEach((src) => {
          try {
            src.stop();
          } catch (e) {
          }
        });
      } catch (e) {
      }
      sfxSourceNodesRef.current = [];
      sfxPoolRef.current.forEach((a) => {
        try {
          a.pause();
          a.currentTime = 0;
          a.src = "";
        } catch (e) {
        }
      });
      sfxPoolRef.current = [];
      sfxBufferCacheRef.current.clear();
    }, []);
    const playSound = React2.useCallback((soundId, volume) => {
      console.log("[SFX] playSound called with soundId:", soundId, "volume:", volume);
      if (!soundId) return;
      try {
        const url = assetResolver(soundId, "audio");
        console.log("[SFX] assetResolver returned URL:", url, "for soundId:", soundId);
        if (!url) {
          console.warn(`[SFX] No audio URL found for soundId: ${soundId}`);
          return;
        }
        console.log("[SFX] Creating HTMLAudio element for playback");
        const audio = new Audio(url);
        audio.volume = (typeof volume === "number" ? Math.max(0, Math.min(1, volume)) : 1) * settings.sfxVolume;
        if (sfxPoolRef.current.length >= MAX_SIMULTANEOUS_SFX) {
          const oldest = sfxPoolRef.current.shift();
          try {
            oldest == null ? void 0 : oldest.pause();
            oldest.currentTime = 0;
          } catch (e) {
          }
        }
        sfxPoolRef.current.push(audio);
        console.log("[SFX] Playing audio, volume:", audio.volume);
        audio.play().then(() => {
          console.log("[SFX] Audio playback started successfully");
        }).catch((e) => {
          console.error("[SFX] Audio playback failed:", e);
        });
        audio.addEventListener("ended", () => {
          console.log("[SFX] Audio playback ended");
          sfxPoolRef.current = sfxPoolRef.current.filter((a) => a !== audio);
        }, { once: true });
      } catch (outerError) {
        console.error("[SFX] Critical error in playSound:", outerError);
        console.error("[SFX] Error stack:", outerError instanceof Error ? outerError.stack : "N/A");
      }
    }, [assetResolver, settings.sfxVolume]);
    React2.useEffect(() => {
      var _a;
      if (sfxMasterGainRef.current) {
        try {
          sfxMasterGainRef.current.gain.setTargetAtTime(settings.sfxVolume, ((_a = audioCtxRef.current) == null ? void 0 : _a.currentTime) || 0, 0.01);
        } catch (e) {
        }
      }
    }, [settings.sfxVolume]);
    React2.useEffect(() => {
      var _a;
      if (!playerState || playerState.mode !== "playing") {
        lastProcessedCommandRef.current = null;
        return;
      }
      if (playerState.uiState.isWaitingForInput || playerState.uiState.isTransitioning || playerState.uiState.choices) {
        return;
      }
      if (hudStack.length > 0) {
        return;
      }
      const command = playerState.currentCommands[playerState.currentIndex];
      if (!command) {
        if (playerState.commandStack.length > 0) {
          const popped = playerState.commandStack[playerState.commandStack.length - 1];
          setPlayerState((p) => {
            if (!p) return null;
            const newStack = p.commandStack.slice(0, -1);
            return { ...p, currentSceneId: popped.sceneId, currentCommands: popped.commands, currentIndex: popped.index, commandStack: newStack };
          });
        } else {
          console.log("End of scene - trying to advance to next scene");
          const sceneIds = Object.keys(project.scenes);
          const currentSceneIndex = sceneIds.indexOf(playerState.currentSceneId);
          if (currentSceneIndex !== -1 && currentSceneIndex < sceneIds.length - 1) {
            const nextSceneId = navigateToScene(sceneIds[currentSceneIndex + 1], playerState.variables);
            const nextScene = project.scenes[nextSceneId];
            if (nextScene) {
              console.log(`Advancing to next scene: ${nextSceneId}`);
              setPlayerState((p) => p ? {
                ...p,
                currentSceneId: nextSceneId,
                currentCommands: nextScene.commands,
                currentIndex: 0
              } : null);
            } else {
              console.log("No valid next scene - returning to title");
              const audio = musicAudioRef.current;
              if (audio) {
                audio.pause();
                audio.currentTime = 0;
                audio.src = "";
              }
              stopAllSfx();
              setPlayerState(null);
              if (project.ui.titleScreenId) {
                setScreenStack([project.ui.titleScreenId]);
              }
            }
          } else {
            console.log("Last scene completed - returning to title");
            const audio = musicAudioRef.current;
            if (audio) {
              audio.pause();
              audio.currentTime = 0;
              audio.src = "";
            }
            stopAllSfx();
            setPlayerState(null);
            if (project.ui.titleScreenId) {
              setScreenStack([project.ui.titleScreenId]);
            }
          }
        }
        lastProcessedCommandRef.current = null;
        return;
      }
      const commandSignature = {
        sceneId: playerState.currentSceneId,
        index: playerState.currentIndex,
        commandId: command.id
      };
      const lastSignature = lastProcessedCommandRef.current;
      if (lastSignature && lastSignature.sceneId === commandSignature.sceneId && lastSignature.index === commandSignature.index && lastSignature.commandId === commandSignature.commandId) {
        return;
      }
      lastProcessedCommandRef.current = commandSignature;
      if (command.type === CommandType.BranchStart) {
        const branchCmd = command;
        const conditionsMet2 = evaluateConditions2(branchCmd.conditions, playerState.variables);
        if (!conditionsMet2) {
          const branchEndIndex = playerState.currentCommands.findIndex(
            (cmd, idx) => idx > playerState.currentIndex && cmd.type === CommandType.BranchEnd && cmd.branchId === branchCmd.branchId
          );
          if (branchEndIndex !== -1) {
            setPlayerState((p) => p ? { ...p, currentIndex: branchEndIndex + 1 } : null);
          } else {
            setPlayerState((p) => p ? { ...p, currentIndex: p.currentIndex + 1 } : null);
          }
          return;
        }
        setPlayerState((p) => p ? { ...p, currentIndex: p.currentIndex + 1 } : null);
        return;
      }
      const conditionsMet = evaluateConditions2(command.conditions, playerState.variables);
      console.log("[DEBUG] Command:", command.type, "Index:", playerState.currentIndex, "Conditions met:", conditionsMet, "Variables:", playerState.variables);
      if (!conditionsMet) {
        console.log("[DEBUG] Skipping command due to failed conditions");
        setPlayerState((p) => p ? { ...p, currentIndex: p.currentIndex + 1 } : null);
        return;
      }
      const advance = () => {
        console.log("[DEBUG advance()] Called from command:", command.type, "Current index:", playerState.currentIndex);
        if (lastProcessedCommandRef.current && lastProcessedCommandRef.current.index > playerState.currentIndex) {
          console.log("[DEBUG advance()] Skipping - already advanced to", lastProcessedCommandRef.current.index);
          return;
        }
        const nextIndex = playerState.currentIndex + 1;
        if (nextIndex >= playerState.currentCommands.length) {
          if (playerState.commandStack.length > 0) {
            const popped = playerState.commandStack[playerState.commandStack.length - 1];
            setPlayerState((p) => {
              if (!p) return null;
              const newStack = p.commandStack.slice(0, -1);
              return { ...p, currentSceneId: popped.sceneId, currentCommands: popped.commands, currentIndex: popped.index, commandStack: newStack };
            });
          } else {
            const sceneIds = Object.keys(project.scenes);
            const currentSceneIndex = sceneIds.indexOf(playerState.currentSceneId);
            if (currentSceneIndex !== -1 && currentSceneIndex < sceneIds.length - 1) {
              const nextSceneId = navigateToScene(sceneIds[currentSceneIndex + 1], playerState.variables);
              const nextScene = project.scenes[nextSceneId];
              if (nextScene) {
                setPlayerState((p) => p ? {
                  ...p,
                  currentSceneId: nextSceneId,
                  currentCommands: nextScene.commands,
                  currentIndex: 0
                } : null);
                return;
              }
            }
            const audio = musicAudioRef.current;
            if (audio) {
              audio.pause();
              audio.currentTime = 0;
              audio.src = "";
            }
            stopAllSfx();
            setPlayerState(null);
            if (project.ui.titleScreenId) {
              setScreenStack([project.ui.titleScreenId]);
            }
          }
        } else {
          setPlayerState((p) => p ? { ...p, currentIndex: nextIndex } : null);
        }
      };
      const shouldRunAsync = ((_a = command.modifiers) == null ? void 0 : _a.runAsync) === true;
      const commandContext = {
        project,
        playerState,
        assetResolver,
        getAssetMetadata,
        musicAudioRef,
        fadeAudio,
        playSound,
        settings,
        advance,
        setPlayerState,
        activeEffectTimeoutsRef
      };
      let instantAdvance = true;
      (async () => {
        try {
          const applyResult = (result) => {
            if (result.updates) {
              setPlayerState((p) => {
                var _a2, _b, _c, _d, _e, _f, _g, _h;
                if (!p) return null;
                return {
                  ...p,
                  ...((_a2 = result.updates) == null ? void 0 : _a2.currentSceneId) !== void 0 ? { currentSceneId: result.updates.currentSceneId } : {},
                  ...((_b = result.updates) == null ? void 0 : _b.currentCommands) !== void 0 ? { currentCommands: result.updates.currentCommands } : {},
                  ...((_c = result.updates) == null ? void 0 : _c.currentIndex) !== void 0 ? { currentIndex: result.updates.currentIndex } : {},
                  ...((_d = result.updates) == null ? void 0 : _d.commandStack) !== void 0 ? { commandStack: result.updates.commandStack } : {},
                  ...((_e = result.updates) == null ? void 0 : _e.variables) !== void 0 ? { variables: { ...p.variables, ...result.updates.variables } } : {},
                  ...((_f = result.updates) == null ? void 0 : _f.stageState) !== void 0 ? { stageState: { ...p.stageState, ...result.updates.stageState } } : {},
                  ...((_g = result.updates) == null ? void 0 : _g.musicState) !== void 0 ? { musicState: { ...p.musicState, ...result.updates.musicState } } : {},
                  ...((_h = result.updates) == null ? void 0 : _h.uiState) !== void 0 ? { uiState: { ...p.uiState, ...result.updates.uiState } } : {}
                };
              });
            }
            instantAdvance = result.advance;
            if (result.delay && result.callback) {
              const timeoutId = window.setTimeout(result.callback, result.delay);
              activeEffectTimeoutsRef.current.push(timeoutId);
            } else if (result.callback) {
              result.callback();
            }
          };
          switch (command.type) {
            case CommandType.Group: {
              const result = handleGroup();
              applyResult(result);
              break;
            }
            case CommandType.BranchStart: {
              const result = handleBranchStart();
              applyResult(result);
              break;
            }
            case CommandType.BranchEnd: {
              const result = handleBranchEnd();
              applyResult(result);
              break;
            }
            case CommandType.Dialogue: {
              const result = handleDialogue(command, commandContext);
              applyResult(result);
              break;
            }
            case CommandType.SetBackground: {
              const result = await handleSetBackground(command, commandContext);
              applyResult(result);
              break;
            }
            case CommandType.ShowCharacter: {
              const result = handleShowCharacter(command, commandContext);
              applyResult(result);
              break;
            }
            case CommandType.HideCharacter: {
              const result = handleHideCharacter(command, commandContext);
              applyResult(result);
              break;
            }
            case CommandType.Choice: {
              const result = handleChoice(command, commandContext);
              applyResult(result);
              break;
            }
            case CommandType.SetVariable: {
              const result = handleSetVariable(command, commandContext);
              applyResult(result);
              break;
            }
            case CommandType.TextInput: {
              const result = handleTextInput(command, commandContext);
              applyResult(result);
              break;
            }
            case CommandType.Jump: {
              const result = handleJump(command, commandContext);
              applyResult(result);
              break;
            }
            case CommandType.PlayMusic: {
              const result = handlePlayMusic(command, commandContext);
              applyResult(result);
              break;
            }
            case CommandType.StopMusic: {
              const result = handleStopMusic(command, commandContext);
              applyResult(result);
              break;
            }
            case CommandType.PlaySoundEffect: {
              const result = handlePlaySoundEffect(command, commandContext);
              applyResult(result);
              break;
            }
            case CommandType.PlayMovie: {
              instantAdvance = false;
              setPlayerState((p) => p ? { ...p, uiState: { ...p.uiState, isWaitingForInput: true, movieUrl: assetResolver(command.videoId, "video") } } : null);
              break;
            }
            case CommandType.Wait: {
              instantAdvance = false;
              const cmd = command;
              const durationMs = (cmd.duration ?? 1) * 1e3;
              if (cmd.waitForInput) {
                let timeoutId = window.setTimeout(() => {
                  advance();
                  removeListeners();
                }, durationMs);
                const onUserAdvance = () => {
                  if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                  }
                  advance();
                  removeListeners();
                };
                const keyHandler = (e) => {
                  if (e.key === " " || e.key === "Enter" || e.key === "Escape") onUserAdvance();
                };
                const clickHandler = () => onUserAdvance();
                const removeListeners = () => {
                  window.removeEventListener("keydown", keyHandler);
                  window.removeEventListener("click", clickHandler);
                };
                window.addEventListener("keydown", keyHandler);
                window.addEventListener("click", clickHandler);
              } else {
                setTimeout(() => advance(), durationMs);
              }
              break;
            }
            case CommandType.ShakeScreen: {
              const cmd = command;
              activeShakeRef.current = { intensity: cmd.intensity, duration: cmd.duration };
              const timeoutId = window.setTimeout(() => {
                activeShakeRef.current = null;
                activeEffectTimeoutsRef.current = activeEffectTimeoutsRef.current.filter((id) => id !== timeoutId);
              }, cmd.duration * 1e3);
              activeEffectTimeoutsRef.current.push(timeoutId);
              break;
            }
            case CommandType.TintScreen: {
              const cmd = command;
              setPlayerState((p) => p ? { ...p, stageState: { ...p.stageState, screen: { ...p.stageState.screen, tint: cmd.color, transitionDuration: cmd.duration } } } : null);
              break;
            }
            case CommandType.PanZoomScreen: {
              const cmd = command;
              setPlayerState((p) => p ? { ...p, stageState: { ...p.stageState, screen: { ...p.stageState.screen, zoom: cmd.zoom, panX: cmd.panX, panY: cmd.panY, transitionDuration: cmd.duration } } } : null);
              break;
            }
            case CommandType.ResetScreenEffects: {
              const cmd = command;
              setPlayerState((p) => p ? { ...p, stageState: { ...p.stageState, screen: { ...p.stageState.screen, tint: "transparent", zoom: 1, panX: 0, panY: 0, transitionDuration: cmd.duration } } } : null);
              break;
            }
            case CommandType.FlashScreen: {
              const cmd = command;
              activeFlashRef.current = { color: cmd.color, duration: cmd.duration, key: Date.now() };
              setFlashTrigger((prev) => prev + 1);
              break;
            }
            case CommandType.ShowScreen: {
              instantAdvance = false;
              const cmd = command;
              setPlayerState((p) => p ? {
                ...p,
                uiState: {
                  ...p.uiState,
                  screenSceneId: p.currentSceneId
                }
              } : null);
              if (playerState && playerState.mode === "playing") {
                setHudStack((s) => [...s, cmd.screenId]);
              } else {
                setScreenStack((s) => [...s, cmd.screenId]);
              }
              break;
            }
            case CommandType.ShowText: {
              const result = handleShowText(command, commandContext);
              applyResult(result);
              break;
            }
            case CommandType.ShowImage: {
              const result = handleShowImage(command, commandContext);
              applyResult(result);
              break;
            }
            case CommandType.Label: {
              const result = handleLabel(command, commandContext);
              applyResult(result);
              break;
            }
            case CommandType.JumpToLabel: {
              const result = handleJumpToLabel(command, commandContext);
              applyResult(result);
              break;
            }
            case CommandType.HideText: {
              const result = handleHideText(command, commandContext);
              applyResult(result);
              break;
            }
            case CommandType.HideImage: {
              const result = handleHideImage(command, commandContext);
              applyResult(result);
              break;
            }
            case CommandType.ShowButton: {
              const result = handleShowButton(command, commandContext);
              applyResult(result);
              break;
            }
            case CommandType.HideButton: {
              const result = handleHideButton(command, commandContext);
              applyResult(result);
              break;
            }
          }
          console.log("[DEBUG] Command execution complete:", command.type, "| shouldRunAsync:", shouldRunAsync, "| instantAdvance:", instantAdvance);
          if (shouldRunAsync) {
            console.log("[DEBUG] Running async - advancing immediately");
            advance();
          } else if (instantAdvance) {
            console.log("[DEBUG] Instant advance - advancing now");
            advance();
          } else {
            console.log("[DEBUG] Waiting for command to handle advancement (callback/user input)");
          }
        } catch (error) {
          console.error("[CRITICAL ERROR] Command execution failed:", {
            commandType: command.type,
            commandId: command.id,
            index: playerState.currentIndex,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : void 0
          });
          advance();
        }
      })();
    }, [playerState, project, assetResolver, playSound, evaluateConditions2, fadeAudio, settings.musicVolume, startNewGame, stopAndResetMusic, stopAllSfx, hudStack]);
    const handleDialogueAdvance = () => {
      setPlayerState((p) => {
        if (!p || !p.uiState.dialogue) return p;
        const historyEntry = {
          timestamp: Date.now(),
          type: "dialogue",
          characterName: p.uiState.dialogue.characterName,
          characterColor: p.uiState.dialogue.characterColor,
          text: p.uiState.dialogue.text
        };
        return {
          ...p,
          currentIndex: p.currentIndex + 1,
          history: [...p.history, historyEntry],
          uiState: { ...p.uiState, isWaitingForInput: false, dialogue: null }
        };
      });
    };
    const handleChoiceSelect = (choice) => {
      var _a;
      console.log("[CHOICE] Selected:", choice.text, "Actions:", ((_a = choice.actions) == null ? void 0 : _a.length) || 0);
      setPlayerState((p) => {
        if (!p) return null;
        let newState = { ...p };
        const historyEntry = {
          timestamp: Date.now(),
          type: "choice",
          text: `Choice: ${choice.text}`,
          choiceText: choice.text
        };
        newState.history = [...newState.history, historyEntry];
        const actions = choice.actions || [];
        if (!choice.actions && choice.targetSceneId) {
          actions.push({ type: UIActionType.JumpToScene, targetSceneId: choice.targetSceneId });
        }
        for (const action of actions) {
          if (action.type === UIActionType.SetVariable) {
            const setVarAction = action;
            const variable = project.variables[setVarAction.variableId];
            if (!variable) {
              console.warn(`SetVariable action failed: Variable with ID ${setVarAction.variableId} not found.`);
              continue;
            }
            const currentVal = newState.variables[setVarAction.variableId];
            const changeValStr = String(setVarAction.value);
            let newVal = setVarAction.value;
            if (setVarAction.operator === "add") {
              newVal = (Number(currentVal) || 0) + (Number(changeValStr) || 0);
            } else if (setVarAction.operator === "subtract") {
              newVal = (Number(currentVal) || 0) - (Number(changeValStr) || 0);
            } else if (setVarAction.operator === "random") {
              const min = setVarAction.randomMin ?? 0;
              const max = setVarAction.randomMax ?? 100;
              newVal = Math.floor(Math.random() * (max - min + 1)) + min;
            } else {
              switch (variable.type) {
                case "number":
                  newVal = Number(changeValStr) || 0;
                  break;
                case "boolean":
                  if (typeof setVarAction.value === "boolean") {
                    newVal = setVarAction.value;
                  } else {
                    const normalized = String(setVarAction.value).trim().toLowerCase();
                    if (normalized === "true" || normalized === "1") {
                      newVal = true;
                    } else if (normalized === "false" || normalized === "0" || normalized === "") {
                      newVal = false;
                    } else {
                      newVal = !!setVarAction.value;
                    }
                  }
                  break;
                case "string":
                default:
                  newVal = changeValStr;
                  break;
              }
            }
            newState.variables = { ...newState.variables, [setVarAction.variableId]: newVal };
          }
        }
        newState.uiState = { ...newState.uiState, choices: null };
        const jumpAction = actions.find((a) => a.type === UIActionType.JumpToScene);
        if (jumpAction) {
          const actualSceneId = navigateToScene(jumpAction.targetSceneId, newState.variables);
          const newScene = project.scenes[actualSceneId];
          if (newScene) {
            newState.currentSceneId = actualSceneId;
            newState.currentCommands = newScene.commands;
            newState.currentIndex = 0;
          } else {
            console.error(`Scene not found for choice jump: ${actualSceneId}`);
            newState.currentIndex = newState.currentIndex + 1;
          }
        } else {
          newState.currentIndex = newState.currentIndex + 1;
        }
        return newState;
      });
    };
    const handleTextInputSubmit = (value) => {
      setPlayerState((p) => p ? {
        ...p,
        currentIndex: p.currentIndex + 1,
        variables: { ...p.variables, [p.uiState.textInput.variableId]: value },
        uiState: { ...p.uiState, isWaitingForInput: false, textInput: null }
      } : null);
    };
    const handleUIAction = (action) => {
      var _a, _b;
      console.log("handleUIAction called with:", action.type, action);
      if (!playerState && action.type === UIActionType.StartNewGame) {
        startNewGame();
      } else if ((playerState == null ? void 0 : playerState.mode) === "paused" && action.type === UIActionType.ReturnToGame) {
        setPlayerState((p) => p ? { ...p, mode: "playing" } : null);
        setScreenStack([]);
        if (musicAudioRef.current && musicAudioRef.current.paused && playerState.musicState.isPlaying) {
          musicAudioRef.current.play().catch((e) => console.error("Failed to resume music:", e));
        }
      } else if (action.type === UIActionType.GoToScreen) {
        const targetId = action.targetScreenId;
        if (playerState && playerState.mode === "playing") {
          setHudStack((s) => [...s, targetId]);
        } else {
          setScreenStack((stack) => [...stack, targetId]);
        }
      } else if (action.type === UIActionType.ReturnToPreviousScreen) {
        if (playerState && playerState.mode === "playing") {
          if (hudStack.length > 0) {
            const closingScreenId = hudStack[hudStack.length - 1];
            const closingScreen = project.uiScreens[closingScreenId];
            const transitionDuration = (closingScreen == null ? void 0 : closingScreen.transitionDuration) || 300;
            const hasTransition = (closingScreen == null ? void 0 : closingScreen.transitionOut) && closingScreen.transitionOut !== "none";
            if (hasTransition) {
              setClosingScreens((prev) => new Set(prev).add(closingScreenId));
              setTimeout(() => {
                setHudStack((s) => s.slice(0, -1));
                setClosingScreens((prev) => {
                  const next = new Set(prev);
                  next.delete(closingScreenId);
                  return next;
                });
                if (hudStack.length === 1) {
                  setPlayerState((p) => {
                    if (!p) return null;
                    return {
                      ...p,
                      currentIndex: p.currentIndex + 1,
                      stageState: {
                        ...p.stageState,
                        buttonOverlays: [],
                        imageOverlays: []
                      }
                    };
                  });
                }
              }, transitionDuration);
            } else {
              setHudStack((s) => s.slice(0, -1));
              if (hudStack.length === 1) {
                setPlayerState((p) => {
                  if (!p) return null;
                  return {
                    ...p,
                    currentIndex: p.currentIndex + 1,
                    stageState: {
                      ...p.stageState,
                      buttonOverlays: [],
                      imageOverlays: []
                    }
                  };
                });
              }
            }
          }
        } else {
          if (screenStack.length > 1) {
            const closingScreenId = screenStack[screenStack.length - 1];
            const closingScreen = project.uiScreens[closingScreenId];
            const transitionDuration = (closingScreen == null ? void 0 : closingScreen.transitionDuration) || 300;
            const hasTransition = (closingScreen == null ? void 0 : closingScreen.transitionOut) && closingScreen.transitionOut !== "none";
            if (hasTransition) {
              setClosingScreens((prev) => new Set(prev).add(closingScreenId));
              setTimeout(() => {
                setScreenStack((stack) => stack.slice(0, -1));
                setClosingScreens((prev) => {
                  const next = new Set(prev);
                  next.delete(closingScreenId);
                  return next;
                });
              }, transitionDuration);
            } else {
              setScreenStack((stack) => stack.slice(0, -1));
            }
          }
        }
      } else if (action.type === UIActionType.QuitToTitle) {
        const audio = musicAudioRef.current;
        if (audio) {
          audio.pause();
          audio.currentTime = 0;
          audio.src = "";
        }
        stopAllSfx();
        setPlayerState(null);
        setHudStack([]);
        if (project.ui.titleScreenId) setScreenStack([project.ui.titleScreenId]);
      } else if (action.type === UIActionType.SaveGame) {
        saveGame(action.slotNumber);
      } else if (action.type === UIActionType.LoadGame) {
        loadGame(action.slotNumber);
      } else if (action.type === UIActionType.JumpToScene) {
        const jumpAction = action;
        const targetScene = project.scenes[jumpAction.targetSceneId];
        console.log("JumpToScene handler triggered:", {
          targetSceneId: jumpAction.targetSceneId,
          sceneExists: !!targetScene,
          sceneName: targetScene == null ? void 0 : targetScene.name,
          currentSceneId: playerState == null ? void 0 : playerState.currentSceneId,
          hasPlayerState: !!playerState
        });
        if (!targetScene) {
          console.warn(`JumpToScene action failed: Scene with ID ${jumpAction.targetSceneId} not found.`);
          return;
        }
        const audio = musicAudioRef.current;
        if (!audio.paused) {
          fadeAudio(audio, 0, 0.5, () => {
            audio.pause();
            audio.currentTime = 0;
          });
        }
        setScreenStack([]);
        setHudStack([]);
        activeEffectTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
        activeEffectTimeoutsRef.current = [];
        activeFlashRef.current = null;
        setFlashTrigger(0);
        activeShakeRef.current = null;
        lastProcessedCommandRef.current = null;
        if (!playerState) {
          console.log("Initializing playerState for scene jump from title");
          const initialVariables = {};
          for (const varId in project.variables) {
            const v = project.variables[varId];
            initialVariables[v.id] = v.defaultValue;
          }
          setPlayerState({
            mode: "playing",
            currentSceneId: jumpAction.targetSceneId,
            currentCommands: targetScene.commands,
            currentIndex: 0,
            commandStack: [],
            variables: initialVariables,
            history: [],
            stageState: {
              backgroundUrl: null,
              characters: {},
              textOverlays: [],
              imageOverlays: [],
              buttonOverlays: [],
              screen: {
                shake: { active: false, intensity: 0 },
                tint: "transparent",
                zoom: 1,
                panX: 0,
                panY: 0,
                transitionDuration: 0.5
              }
            },
            uiState: {
              dialogue: null,
              choices: null,
              textInput: null,
              movieUrl: null,
              isWaitingForInput: false,
              isTransitioning: false,
              transitionElement: null,
              flash: null
            },
            musicState: {
              audioId: null,
              isPlaying: false,
              loop: false,
              currentTime: 0
            }
          });
        } else {
          console.log("Jumping to new scene from existing game state");
          console.log("[DEBUG Jump] Current variables before jump:", playerState.variables);
          setPlayerState((p) => {
            if (!p) return null;
            console.log("Setting new scene:", {
              targetSceneId: jumpAction.targetSceneId,
              commandCount: targetScene.commands.length,
              commands: targetScene.commands.map((c) => ({ type: c.type, id: c.id }))
            });
            console.log("[DEBUG Jump] Variables being carried over:", p.variables);
            return {
              ...p,
              currentSceneId: jumpAction.targetSceneId,
              currentCommands: targetScene.commands,
              currentIndex: 0,
              // Reset stage state to clean slate
              stageState: {
                backgroundUrl: null,
                characters: {},
                textOverlays: [],
                imageOverlays: [],
                buttonOverlays: [],
                screen: {
                  shake: { active: false, intensity: 0 },
                  tint: "transparent",
                  zoom: 1,
                  panX: 0,
                  panY: 0,
                  transitionDuration: 0.5
                }
              },
              // Clear any active UI state (dialogue, choices, etc.)
              uiState: {
                dialogue: null,
                choices: null,
                textInput: null,
                movieUrl: null,
                isWaitingForInput: false,
                isTransitioning: false,
                transitionElement: null,
                flash: null
              }
            };
          });
        }
      } else if (action.type === UIActionType.SetVariable && playerState) {
        const setVarAction = action;
        const variable = project.variables[setVarAction.variableId];
        if (!variable) {
          console.warn(`SetVariable action failed: Variable with ID ${setVarAction.variableId} not found.`);
          return;
        }
        setPlayerState((p) => {
          if (!p) return null;
          const currentVal = p.variables[setVarAction.variableId];
          const changeValStr = String(setVarAction.value);
          let newVal = setVarAction.value;
          if (setVarAction.operator === "add") {
            newVal = (Number(currentVal) || 0) + (Number(changeValStr) || 0);
          } else if (setVarAction.operator === "subtract") {
            newVal = (Number(currentVal) || 0) - (Number(changeValStr) || 0);
          } else if (setVarAction.operator === "random") {
            const min = setVarAction.randomMin ?? 0;
            const max = setVarAction.randomMax ?? 100;
            newVal = Math.floor(Math.random() * (max - min + 1)) + min;
          } else {
            switch (variable.type) {
              case "number":
                newVal = Number(changeValStr) || 0;
                break;
              case "boolean":
                newVal = changeValStr.toLowerCase() === "true";
                break;
              case "string":
              default:
                newVal = changeValStr;
                break;
            }
          }
          return { ...p, variables: { ...p.variables, [setVarAction.variableId]: newVal } };
        });
      } else if (action.type === UIActionType.CycleLayerAsset) {
        console.log("CycleLayerAsset handler triggered, playerState exists:", !!playerState);
        const cycleAction = action;
        console.log("CycleLayerAsset action details:", {
          characterId: cycleAction.characterId,
          layerId: cycleAction.layerId,
          variableId: cycleAction.variableId,
          direction: cycleAction.direction
        });
        const character = project.characters[cycleAction.characterId];
        if (!character) {
          console.warn(`CycleLayerAsset action failed: Character with ID ${cycleAction.characterId} not found.`);
          return;
        }
        console.log("Character found:", character.name);
        const layer = character.layers[cycleAction.layerId];
        if (!layer) {
          console.warn(`CycleLayerAsset action failed: Layer with ID ${cycleAction.layerId} not found.`);
          return;
        }
        console.log("Layer found:", layer.name);
        const assetsCount = Object.keys(layer.assets || {}).length;
        console.log("Assets count:", assetsCount);
        if (assetsCount === 0) {
          console.warn(`CycleLayerAsset action failed: Layer "${layer.name}" has no assets.`);
          return;
        }
        if (playerState) {
          setPlayerState((p) => {
            if (!p) return null;
            const currentIndex = Number(p.variables[cycleAction.variableId]) || 0;
            let newIndex;
            if (cycleAction.direction === "next") {
              newIndex = (currentIndex + 1) % assetsCount;
            } else {
              newIndex = (currentIndex - 1 + assetsCount) % assetsCount;
            }
            console.log(`CycleLayerAsset (in-game): ${character.name} layer "${layer.name}" from index ${currentIndex} to ${newIndex} (${cycleAction.direction}), total assets: ${assetsCount}`);
            return {
              ...p,
              variables: { ...p.variables, [cycleAction.variableId]: newIndex }
            };
          });
        } else {
          const currentIndex = Number(menuVariables[cycleAction.variableId]) || 0;
          let newIndex;
          if (cycleAction.direction === "next") {
            newIndex = (currentIndex + 1) % assetsCount;
          } else {
            newIndex = (currentIndex - 1 + assetsCount) % assetsCount;
          }
          console.log(`CycleLayerAsset (menu): ${character.name} layer "${layer.name}" from index ${currentIndex} to ${newIndex} (${cycleAction.direction}), total assets: ${assetsCount}`);
          setMenuVariables((vars) => ({
            ...vars,
            [cycleAction.variableId]: newIndex
          }));
        }
      } else if (action.type === UIActionType.JumpToLabel && playerState) {
        const jumpToLabelAction = action;
        const targetLabel = jumpToLabelAction.targetLabel;
        const targetSceneId = playerState.uiState.screenSceneId || playerState.currentSceneId;
        console.log("JumpToLabel handler triggered:", {
          targetLabel,
          currentSceneId: playerState.currentSceneId,
          currentSceneName: (_a = project.scenes[playerState.currentSceneId]) == null ? void 0 : _a.name,
          screenSceneId: playerState.uiState.screenSceneId,
          targetSceneId,
          targetSceneName: (_b = project.scenes[targetSceneId]) == null ? void 0 : _b.name
        });
        const targetScene = project.scenes[targetSceneId];
        if (!targetScene) {
          console.warn("JumpToLabel failed: Target scene not found");
          return;
        }
        const allLabels = targetScene.commands.filter((cmd) => cmd.type === CommandType.Label).map((cmd) => cmd.labelId);
        console.log("JumpToLabel: Available labels in target scene:", allLabels);
        const labelIndex = targetScene.commands.findIndex(
          (cmd) => cmd.type === CommandType.Label && cmd.labelId === targetLabel
        );
        if (labelIndex === -1) {
          console.warn(`JumpToLabel failed: Label "${targetLabel}" not found in scene "${targetScene.name}"`);
          console.warn("Looking for label:", targetLabel);
          console.warn("Available labels:", allLabels);
          return;
        }
        console.log(`JumpToLabel: Jumping to label "${targetLabel}" at index ${labelIndex} in scene "${targetScene.name}"`);
        setHudStack([]);
        setPlayerState((p) => {
          if (!p) return null;
          return {
            ...p,
            currentSceneId: targetSceneId,
            currentCommands: targetScene.commands,
            currentIndex: labelIndex,
            stageState: {
              ...p.stageState,
              buttonOverlays: [],
              imageOverlays: [],
              textOverlays: []
            },
            uiState: {
              ...p.uiState,
              dialogue: null,
              choices: null,
              isWaitingForInput: false,
              screenSceneId: null
              // Clear the stored scene ID after jumping
            }
          };
        });
      }
    };
    const handleVariableChange = (variableId, value) => {
      if (playerState) {
        setPlayerState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            variables: {
              ...prev.variables,
              [variableId]: value
            }
          };
        });
      } else {
        setMenuVariables((prev) => ({
          ...prev,
          [variableId]: value
        }));
      }
    };
    React2.useEffect(() => {
      const handleKeyDown = (e) => {
        if (!playerState) return;
        if (e.key === " " && playerState.mode === "playing" && playerState.uiState.dialogue && !playerState.uiState.choices && !playerState.uiState.textInput) {
          e.preventDefault();
          handleDialogueAdvance();
          return;
        }
        if ((e.key === "h" || e.key === "H") && playerState.mode === "playing" && !playerState.uiState.textInput) {
          e.preventDefault();
          setPlayerState((p) => p ? { ...p, uiState: { ...p.uiState, showHistory: !p.uiState.showHistory } } : null);
          return;
        }
        if (e.key === "Escape") {
          if (playerState.uiState.showHistory) {
            setPlayerState((p) => p ? { ...p, uiState: { ...p.uiState, showHistory: false } } : null);
            return;
          }
          if (playerState.mode === "playing") {
            setPlayerState((p) => p ? { ...p, mode: "paused" } : null);
            if (musicAudioRef.current && !musicAudioRef.current.paused) {
              musicAudioRef.current.pause();
            }
            if (project.ui.pauseScreenId) {
              setScreenStack([project.ui.pauseScreenId]);
            }
          } else if (playerState.mode === "paused") {
            if (screenStack.length > 1) {
              setScreenStack((s) => s.slice(0, -1));
            } else {
              setPlayerState((p) => p ? { ...p, mode: "playing" } : null);
              if (musicAudioRef.current && musicAudioRef.current.src && playerState.musicState.isPlaying) {
                musicAudioRef.current.play().catch((e2) => console.error("Failed to resume music:", e2));
              }
              setScreenStack([]);
            }
          }
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [playerState, project.ui.pauseScreenId, screenStack, handleDialogueAdvance]);
    React2.useEffect(() => {
      if (!settings.autoAdvance || !playerState || playerState.mode !== "playing") return;
      if (!playerState.uiState.dialogue || playerState.uiState.choices || playerState.uiState.textInput) return;
      const timer = setTimeout(() => {
        handleDialogueAdvance();
      }, settings.autoAdvanceDelay * 1e3);
      return () => clearTimeout(timer);
    }, [settings.autoAdvance, settings.autoAdvanceDelay, playerState == null ? void 0 : playerState.uiState.dialogue, playerState == null ? void 0 : playerState.uiState.choices, playerState == null ? void 0 : playerState.uiState.textInput, playerState == null ? void 0 : playerState.mode, handleDialogueAdvance]);
    const renderStage = () => {
      if (!playerState) return null;
      const state = playerState.stageState;
      const getPositionStyle2 = (position) => {
        if (typeof position === "object") {
          return {
            left: `${position.x}%`,
            top: `${position.y}%`
          };
        } else {
          const presetStyles = {
            "left": { top: "10%", left: "25%" },
            "center": { top: "10%", left: "50%" },
            "right": { top: "10%", left: "75%" },
            "off-left": { top: "10%", left: "-25%" },
            "off-right": { top: "10%", left: "125%" }
          };
          return presetStyles[position];
        }
      };
      const shakeClass = activeShakeRef.current ? "shake" : "";
      const intensityPx = activeShakeRef.current ? activeShakeRef.current.intensity * 1.5 : 0;
      const panZoomStyle = { transform: `scale(${state.screen.zoom}) translate(${state.screen.panX}%, ${state.screen.panY}%)`, transition: `transform ${state.screen.transitionDuration}s ease-in-out`, width: "100%", height: "100%" };
      const shakeIntensityStyle = activeShakeRef.current ? { "--shake-intensity-x": `${intensityPx}px`, "--shake-intensity-y": `${intensityPx * 0.7}px` } : {};
      const tintStyle = { backgroundColor: state.screen.tint, transition: `background-color ${state.screen.transitionDuration}s ease-in-out` };
      const handleStageClick = () => {
        if (playerState.uiState.dialogue && !playerState.uiState.choices && !playerState.uiState.textInput && !playerState.uiState.showHistory) {
          handleDialogueAdvance();
        }
      };
      return /* @__PURE__ */ jsxRuntime2.jsxs(
        "div",
        {
          ref: stageRef,
          className: "w-full h-full relative overflow-hidden bg-black",
          onClick: handleStageClick,
          style: { cursor: playerState.uiState.dialogue && !playerState.uiState.choices && !playerState.uiState.textInput ? "pointer" : "default" },
          children: [
            /* @__PURE__ */ jsxRuntime2.jsx("div", { style: panZoomStyle, children: /* @__PURE__ */ jsxRuntime2.jsxs("div", { className: `w-full h-full ${shakeClass} z-10`, style: shakeIntensityStyle, children: [
              state.backgroundUrl && (state.backgroundIsVideo ? /* @__PURE__ */ jsxRuntime2.jsx(
                "video",
                {
                  src: state.backgroundUrl,
                  autoPlay: true,
                  muted: true,
                  loop: state.backgroundLoop,
                  playsInline: true,
                  className: "absolute w-full h-full object-cover"
                }
              ) : /* @__PURE__ */ jsxRuntime2.jsx("img", { src: state.backgroundUrl, alt: "background", className: "absolute w-full h-full object-cover" })),
              playerState == null ? void 0 : playerState.uiState.transitionElement,
              Object.values(state.characters).map((char) => {
                var _a;
                let transitionClass = "";
                let animationDuration = "1s";
                let slideStyle = {};
                let positionStyle = getPositionStyle2(char.position);
                if (!char.transition || char.transition.type !== "slide") {
                  positionStyle = { ...positionStyle, transform: "translate3d(-50%, 0, 0)" };
                }
                if (char.transition) {
                  const isHideTransition = char.transition.action === "hide";
                  switch (char.transition.type) {
                    case "fade":
                      transitionClass = isHideTransition ? "transition-fade-out" : "transition-dissolve";
                      break;
                    case "dissolve":
                      transitionClass = isHideTransition ? "transition-dissolve-out" : "transition-dissolve";
                      break;
                    case "slide":
                      transitionClass = "transition-slide";
                      const startPos = char.transition.startPosition || char.position;
                      const endPos = char.transition.endPosition || char.position;
                      let startOffsetX = 0;
                      let startOffsetY = 0;
                      if (typeof startPos === "object" && typeof endPos === "object") {
                        startOffsetX = startPos.x - endPos.x;
                        startOffsetY = startPos.y - endPos.y;
                      } else {
                        const startPreset = typeof startPos === "string" ? startPos : "center";
                        const endPreset = typeof endPos === "string" ? endPos : "center";
                        const presetCoords = {
                          "left": { x: 25, y: 10 },
                          "center": { x: 50, y: 10 },
                          "right": { x: 75, y: 10 },
                          "off-left": { x: -25, y: 10 },
                          "off-right": { x: 125, y: 10 }
                        };
                        const startCoords = presetCoords[startPreset];
                        const endCoords = presetCoords[endPreset];
                        startOffsetX = startCoords.x - endCoords.x;
                        startOffsetY = startCoords.y - endCoords.y;
                      }
                      if (startOffsetX === 0 && ((_a = char.transition) == null ? void 0 : _a.action) === "show") {
                        let endX = 50;
                        if (typeof endPos === "object") endX = endPos.x;
                        else if (typeof endPos === "string") {
                          const presetMap = { left: 25, center: 50, right: 75, "off-left": -25, "off-right": 125 };
                          endX = presetMap[endPos] ?? 50;
                        }
                        startOffsetX = endX <= 50 ? -60 : 60;
                      }
                      slideStyle = {
                        "--slide-start-x": `${startOffsetX}%`,
                        "--slide-start-y": `${startOffsetY}%`,
                        "--slide-end-x": `0%`,
                        "--slide-end-y": `0%`
                      };
                      if (stageSize && stageSize.width > 0) {
                        const pxStartX = startOffsetX / 100 * stageSize.width;
                        const pxStartY = startOffsetY / 100 * stageSize.height;
                        slideStyle["--slide-start-px"] = `${pxStartX}px`;
                        slideStyle["--slide-end-px"] = `0px`;
                        slideStyle["--slide-start-py"] = `${pxStartY}px`;
                        slideStyle["--slide-end-py"] = `0px`;
                      }
                      break;
                    case "iris-in":
                      transitionClass = isHideTransition ? "transition-iris-out" : "transition-iris-in";
                      break;
                    case "wipe-right":
                      transitionClass = isHideTransition ? "transition-wipe-out-right" : "transition-wipe-right";
                      break;
                  }
                  animationDuration = `${char.transition.duration}s`;
                }
                return /* @__PURE__ */ jsxRuntime2.jsx("div", { className: `absolute h-[90%] w-auto aspect-[3/4] ${transitionClass} transition-base`, style: { ...positionStyle, animationDuration, ...slideStyle }, children: char.isVideo && char.videoUrls ? char.videoUrls.map((url, index) => /* @__PURE__ */ jsxRuntime2.jsx(
                  "video",
                  {
                    src: url,
                    autoPlay: true,
                    muted: true,
                    loop: char.videoLoop,
                    playsInline: true,
                    className: "absolute top-0 left-0 w-full h-full object-contain",
                    style: { zIndex: index }
                  },
                  index
                )) : char.imageUrls.map((url, index) => /* @__PURE__ */ jsxRuntime2.jsx(
                  "img",
                  {
                    src: url,
                    alt: "",
                    className: "absolute top-0 left-0 w-full h-full object-contain",
                    style: { zIndex: index }
                  },
                  index
                )) }, char.charId);
              }),
              state.textOverlays.map((overlay) => /* @__PURE__ */ jsxRuntime2.jsx(TextOverlayElement, { overlay, stageSize }, overlay.id)),
              state.imageOverlays.map((overlay) => /* @__PURE__ */ jsxRuntime2.jsx(ImageOverlayElement, { overlay, stageSize }, overlay.id)),
              state.buttonOverlays.map((overlay) => /* @__PURE__ */ jsxRuntime2.jsx(
                ButtonOverlayElement,
                {
                  overlay,
                  onAction: handleUIAction,
                  playSound,
                  onAdvance: overlay.waitForClick ? () => {
                    setPlayerState((p) => {
                      if (!p) return null;
                      return {
                        ...p,
                        currentIndex: p.currentIndex + 1,
                        uiState: { ...p.uiState, isWaitingForInput: false }
                      };
                    });
                  } : void 0
                },
                overlay.id
              ))
            ] }) }),
            /* @__PURE__ */ jsxRuntime2.jsx("div", { className: "absolute inset-0 pointer-events-none", style: tintStyle })
          ]
        }
      );
    };
    const HistoryPanel = ({ history, onClose: onClose2 }) => {
      return /* @__PURE__ */ jsxRuntime2.jsxs("div", { className: "absolute inset-0 bg-black/90 z-50 flex flex-col", children: [
        /* @__PURE__ */ jsxRuntime2.jsxs("div", { className: "flex items-center justify-between p-4 border-b border-slate-600", children: [
          /* @__PURE__ */ jsxRuntime2.jsx("h2", { className: "text-white text-2xl font-bold", children: "Dialogue History" }),
          /* @__PURE__ */ jsxRuntime2.jsx(
            "button",
            {
              onClick: onClose2,
              className: "text-white hover:text-slate-300 text-sm px-4 py-2 bg-slate-700 rounded",
              children: "Close (ESC / H)"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntime2.jsx("div", { className: "flex-1 overflow-y-auto p-4 space-y-3", children: history.length === 0 ? /* @__PURE__ */ jsxRuntime2.jsx("p", { className: "text-slate-400 text-center mt-8", children: "No dialogue history yet." }) : history.map((entry, index) => /* @__PURE__ */ jsxRuntime2.jsxs(
          "div",
          {
            className: `p-3 rounded ${entry.type === "choice" ? "bg-blue-900/30 border-l-4 border-blue-500" : "bg-slate-800/50"}`,
            children: [
              entry.type === "dialogue" && entry.characterName && /* @__PURE__ */ jsxRuntime2.jsx(
                "div",
                {
                  className: "font-bold mb-1",
                  style: { color: entry.characterColor || "#fff" },
                  children: entry.characterName
                }
              ),
              /* @__PURE__ */ jsxRuntime2.jsx("div", { className: "text-white", children: entry.text }),
              entry.type === "choice" && /* @__PURE__ */ jsxRuntime2.jsx("div", { className: "text-blue-300 text-sm mt-1 italic", children: "Selected choice" })
            ]
          },
          index
        )) })
      ] });
    };
    const renderPlayerUI = () => {
      if (!playerState || playerState.mode !== "playing") return null;
      const { uiState } = playerState;
      const currentHudScreenId = hudStack.length > 0 ? hudStack[hudStack.length - 1] : project.ui.gameHudScreenId;
      const currentHudScreen = currentHudScreenId ? project.uiScreens[currentHudScreenId] : null;
      const shouldShowDialogueOnHud = currentHudScreen == null ? void 0 : currentHudScreen.showDialogue;
      return /* @__PURE__ */ jsxRuntime2.jsxs(jsxRuntime2.Fragment, { children: [
        uiState.showHistory && /* @__PURE__ */ jsxRuntime2.jsx(
          HistoryPanel,
          {
            history: playerState.history,
            onClose: () => setPlayerState((p) => p ? { ...p, uiState: { ...p.uiState, showHistory: false } } : null)
          }
        ),
        uiState.movieUrl && /* @__PURE__ */ jsxRuntime2.jsx("div", { className: "absolute inset-0 bg-black z-40 flex flex-col items-center justify-center text-white", onClick: () => setPlayerState((p) => p ? { ...p, currentIndex: p.currentIndex + 1, uiState: { ...p.uiState, isWaitingForInput: false, movieUrl: null } } : null), children: /* @__PURE__ */ jsxRuntime2.jsx("video", { src: uiState.movieUrl, autoPlay: true, className: "w-full h-full", onEnded: () => setPlayerState((p) => p ? { ...p, currentIndex: p.currentIndex + 1, uiState: { ...p.uiState, isWaitingForInput: false, movieUrl: null } } : null) }) }),
        uiState.dialogue && (!currentHudScreen || shouldShowDialogueOnHud) && /* @__PURE__ */ jsxRuntime2.jsx(DialogueBox, { dialogue: uiState.dialogue, settings, projectUI: project.ui, onFinished: handleDialogueAdvance, variables: playerState.variables, project }),
        uiState.choices && /* @__PURE__ */ jsxRuntime2.jsx(ChoiceMenu, { choices: uiState.choices, projectUI: project.ui, onSelect: handleChoiceSelect, variables: playerState.variables, project }),
        uiState.textInput && /* @__PURE__ */ jsxRuntime2.jsx(TextInputForm, { textInput: uiState.textInput, onSubmit: handleTextInputSubmit, variables: playerState.variables, project }),
        activeFlashRef.current && /* @__PURE__ */ jsxRuntime2.jsx(
          "div",
          {
            className: "absolute inset-0 z-50 pointer-events-none",
            style: { backgroundColor: activeFlashRef.current.color, animation: `flash-anim ${activeFlashRef.current.duration}s ease-in-out` },
            onAnimationEnd: (e) => {
              if (e.target === e.currentTarget) {
                activeFlashRef.current = null;
                setFlashTrigger((prev) => prev + 1);
              }
            }
          },
          activeFlashRef.current.key
        )
      ] });
    };
    const currentScreenId = !playerState || playerState.mode === "paused" ? screenStack.length > 0 ? screenStack[screenStack.length - 1] : null : null;
    const handleClose = () => {
      const audio = musicAudioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        audio.src = "";
      }
      const ambientAudio = ambientNoiseAudioRef.current;
      if (ambientAudio) {
        ambientAudio.pause();
        ambientAudio.currentTime = 0;
        ambientAudio.src = "";
      }
      if (audioFadeInterval.current) {
        clearInterval(audioFadeInterval.current);
        audioFadeInterval.current = null;
      }
      if (ambientFadeInterval.current) {
        clearInterval(ambientFadeInterval.current);
        ambientFadeInterval.current = null;
      }
      stopAllSfx();
      const allVideos = document.querySelectorAll("video");
      allVideos.forEach((video) => {
        video.pause();
        video.src = "";
        video.load();
      });
      onClose();
    };
    React2.useEffect(() => {
      return () => {
        const audio = musicAudioRef.current;
        if (audio) {
          audio.pause();
          audio.src = "";
        }
        const ambientAudio = ambientNoiseAudioRef.current;
        if (ambientAudio) {
          ambientAudio.pause();
          ambientAudio.src = "";
        }
        if (audioFadeInterval.current) {
          clearInterval(audioFadeInterval.current);
        }
        if (ambientFadeInterval.current) {
          clearInterval(ambientFadeInterval.current);
        }
        sfxSourceNodesRef.current.forEach((src) => {
          try {
            src.stop();
          } catch (e) {
          }
        });
        sfxSourceNodesRef.current = [];
        const allVideos = document.querySelectorAll("video");
        allVideos.forEach((video) => {
          video.pause();
          video.src = "";
          video.load();
        });
      };
    }, []);
    if (!titleScreenId) {
      return /* @__PURE__ */ jsxRuntime2.jsxs("div", { className: "fixed inset-0 bg-black z-50 flex flex-col items-center justify-center text-white p-8 text-center", children: [
        /* @__PURE__ */ jsxRuntime2.jsx("h2", { className: "text-2xl text-red-500 font-bold mb-4", children: "Playback Error" }),
        /* @__PURE__ */ jsxRuntime2.jsx("p", { className: "max-w-md", children: "Could not start the game because no valid Title Screen is set. Please ensure a Title Screen exists and is configured in the Project Settings." }),
        /* @__PURE__ */ jsxRuntime2.jsx("button", { onClick: handleClose, className: "mt-8 bg-[var(--bg-tertiary)] hover:bg-[var(--accent-purple)] px-6 py-2 rounded-lg font-bold", children: "Return to Editor" })
      ] });
    }
    return /* @__PURE__ */ jsxRuntime2.jsxs("div", { className: "fixed inset-0 bg-black z-50 flex items-center justify-center", children: [
      /* @__PURE__ */ jsxRuntime2.jsx("style", { children: `
                @keyframes elementTransitionfade {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes elementTransitionslideUp {
                    from { opacity: 0; transform: translate(-50%, 20%); }
                    to { opacity: 1; transform: translate(-50%, -50%); }
                }
                @keyframes elementTransitionslideDown {
                    from { opacity: 0; transform: translate(-50%, -70%); }
                    to { opacity: 1; transform: translate(-50%, -50%); }
                }
                @keyframes elementTransitionslideLeft {
                    from { opacity: 0; transform: translate(-20%, -50%); }
                    to { opacity: 1; transform: translate(-50%, -50%); }
                }
                @keyframes elementTransitionslideRight {
                    from { opacity: 0; transform: translate(-80%, -50%); }
                    to { opacity: 1; transform: translate(-50%, -50%); }
                }
                @keyframes elementTransitionscale {
                    from { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
                    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                }
                
                /* Screen IN transitions */
                @keyframes screenTransitionfade {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes screenTransitionslideUp {
                    from { opacity: 0; transform: translateY(100%); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes screenTransitionslideDown {
                    from { opacity: 0; transform: translateY(-100%); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes screenTransitionslideLeft {
                    from { opacity: 0; transform: translateX(100%); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes screenTransitionslideRight {
                    from { opacity: 0; transform: translateX(-100%); }
                    to { opacity: 1; transform: translateX(0); }
                }
                
                /* Screen OUT transitions */
                @keyframes screenTransitionfadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
                }
                @keyframes screenTransitionslideUpOut {
                    from { opacity: 1; transform: translateY(0); }
                    to { opacity: 0; transform: translateY(-100%); }
                }
                @keyframes screenTransitionslideDownOut {
                    from { opacity: 1; transform: translateY(0); }
                    to { opacity: 0; transform: translateY(100%); }
                }
                @keyframes screenTransitionslideLeftOut {
                    from { opacity: 1; transform: translateX(0); }
                    to { opacity: 0; transform: translateX(-100%); }
                }
                @keyframes screenTransitionslideRightOut {
                    from { opacity: 1; transform: translateX(0); }
                    to { opacity: 0; transform: translateX(100%); }
                }
            ` }),
      /* @__PURE__ */ jsxRuntime2.jsxs("div", { className: "w-full h-full aspect-video relative", children: [
        (playerState == null ? void 0 : playerState.mode) === "playing" ? renderStage() : null,
        currentScreenId && /* @__PURE__ */ jsxRuntime2.jsx(
          UIScreenRenderer,
          {
            screenId: currentScreenId,
            onAction: handleUIAction,
            settings,
            onSettingsChange: (key, value) => setSettings((s) => ({ ...s, [key]: value })),
            assetResolver,
            gameSaves,
            playSound,
            variables: (playerState == null ? void 0 : playerState.variables) || menuVariables,
            onVariableChange: handleVariableChange,
            isClosing: closingScreens.has(currentScreenId)
          }
        ),
        // Render HUD screens while in playing mode. Priority: explicit hudStack top, then project.ui.gameHudScreenId
        (playerState == null ? void 0 : playerState.mode) === "playing" && (() => {
          const hudScreenId = hudStack.length > 0 ? hudStack[hudStack.length - 1] : project.ui.gameHudScreenId;
          return hudScreenId ? /* @__PURE__ */ jsxRuntime2.jsx(
            UIScreenRenderer,
            {
              screenId: hudScreenId,
              onAction: handleUIAction,
              settings,
              onSettingsChange: (key, value) => setSettings((s) => ({ ...s, [key]: value })),
              assetResolver,
              gameSaves,
              playSound,
              variables: (playerState == null ? void 0 : playerState.variables) || menuVariables,
              onVariableChange: handleVariableChange,
              isClosing: closingScreens.has(hudScreenId)
            }
          ) : null;
        })(),
        renderPlayerUI()
      ] }),
      !hideCloseButton && /* @__PURE__ */ jsxRuntime2.jsx("button", { onClick: handleClose, className: "absolute top-4 right-4 bg-slate-800/50 p-2 rounded-full hover:bg-slate-700/80 transition-colors z-50", children: /* @__PURE__ */ jsxRuntime2.jsx(XMarkIcon, { className: "w-8 h-8" }) })
    ] });
  };
  const StandalonePlayer = ({ project }) => {
    const [isReady, setIsReady] = React2.useState(false);
    const [showSplash, setShowSplash] = React2.useState(true);
    const [splashFadingOut, setSplashFadingOut] = React2.useState(false);
    React2.useEffect(() => {
      console.log("[Standalone Player] Loaded project:", project.title);
      setIsReady(true);
      const preventContextMenu = (e) => {
        e.preventDefault();
      };
      document.addEventListener("contextmenu", preventContextMenu);
      return () => {
        document.removeEventListener("contextmenu", preventContextMenu);
      };
    }, [project]);
    const handleSplashClick = () => {
      setSplashFadingOut(true);
      setTimeout(() => {
        setShowSplash(false);
      }, 800);
    };
    if (!isReady) {
      return /* @__PURE__ */ jsxRuntime2.jsx("div", { style: {
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1a1a2e",
        color: "#fff"
      }, children: /* @__PURE__ */ jsxRuntime2.jsx("div", { children: "Initializing game..." }) });
    }
    if (showSplash) {
      return /* @__PURE__ */ jsxRuntime2.jsxs(
        "div",
        {
          onClick: handleSplashClick,
          style: {
            width: "100vw",
            height: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#000",
            cursor: "pointer",
            opacity: splashFadingOut ? 0 : 1,
            transition: "opacity 0.8s ease-in-out"
          },
          children: [
            /* @__PURE__ */ jsxRuntime2.jsxs("div", { style: {
              textAlign: "center",
              animation: splashFadingOut ? "none" : "fadeIn 1s ease-in"
            }, children: [
              /* @__PURE__ */ jsxRuntime2.jsx("p", { style: {
                color: "#fff",
                fontSize: "1.5rem",
                fontFamily: "sans-serif",
                marginBottom: "2rem",
                letterSpacing: "0.2em",
                fontWeight: "300"
              }, children: "MADE USING" }),
              /* @__PURE__ */ jsxRuntime2.jsx("h1", { style: {
                color: "#00d9ff",
                fontSize: "4rem",
                fontFamily: "sans-serif",
                margin: "2rem 0",
                letterSpacing: "0.1em",
                fontWeight: "700",
                textShadow: "0 0 20px rgba(0, 217, 255, 0.5)"
              }, children: "FLOURISH" }),
              /* @__PURE__ */ jsxRuntime2.jsx("p", { style: {
                color: "#aaa",
                fontSize: "1.2rem",
                fontFamily: "sans-serif",
                letterSpacing: "0.3em",
                fontWeight: "300"
              }, children: "VISUAL NOVEL ENGINE" }),
              /* @__PURE__ */ jsxRuntime2.jsx("p", { style: {
                color: "#888",
                fontSize: "0.9rem",
                fontFamily: "sans-serif",
                marginTop: "3rem",
                fontStyle: "italic"
              }, children: "Click to continue" })
            ] }),
            /* @__PURE__ */ jsxRuntime2.jsx("style", { children: `
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                ` })
          ]
        }
      );
    }
    return /* @__PURE__ */ jsxRuntime2.jsxs("div", { style: {
      width: "100vw",
      height: "100vh",
      background: "#000",
      overflow: "hidden"
    }, children: [
      /* @__PURE__ */ jsxRuntime2.jsx("style", { children: `
                body {
                    user-select: none;
                    -webkit-user-select: none;
                    -moz-user-select: none;
                    -ms-user-select: none;
                }
                input, textarea, [contenteditable="true"] {
                    user-select: text;
                    -webkit-user-select: text;
                    -moz-user-select: text;
                    -ms-user-select: text;
                }
            ` }),
      /* @__PURE__ */ jsxRuntime2.jsx(ProjectProvider, { initialProject: project, children: /* @__PURE__ */ jsxRuntime2.jsx(LivePreview, { onClose: () => {
      }, hideCloseButton: true, autoStartMusic: true }) })
    ] });
  };
  const GameEngine2 = {
    /**
     * Mount the game to a DOM element
     * @param container - The DOM element to mount to
     * @param projectData - The VNProject data
     */
    mount: (container, projectData) => {
      if (!container) {
        throw new Error("Container element not found");
      }
      if (!projectData) {
        throw new Error("Project data is required");
      }
      const root = ReactDOM2.createRoot(container);
      root.render(
        /* @__PURE__ */ jsxRuntime2.jsx(React2.StrictMode, { children: /* @__PURE__ */ jsxRuntime2.jsx(StandalonePlayer, { project: projectData }) })
      );
    },
    /**
     * Get version information
     */
    version: "1.0.0",
    /**
     * Check if the engine is ready
     */
    isReady: () => {
      return typeof React2 !== "undefined" && typeof ReactDOM2 !== "undefined";
    }
  };
  if (typeof window !== "undefined") {
    window.GameEngine = GameEngine2;
  }
  exports.GameEngine = GameEngine2;
  exports.default = StandalonePlayer;
  Object.defineProperties(exports, { __esModule: { value: true }, [Symbol.toStringTag]: { value: "Module" } });
  return exports;
})({}, jsxRuntime, React, ReactDOM);
