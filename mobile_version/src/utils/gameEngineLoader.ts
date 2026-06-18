/**
 * Game Engine Loader
 * This module provides the pre-built game engine bundle
 */

/**
 * Gets the game engine code
 * In production, this reads the built bundle file
 * The bundle is created by running: npm run build:standalone
 */
export async function getGameEngineCode(): Promise<string> {
  try {
    // Try to fetch the pre-built engine
    const response = await fetch('/dist-standalone/game-engine.js');
    
    if (!response.ok) {
      throw new Error(`Failed to load game engine: ${response.status}`);
    }
    
    const code = await response.text();
    
    if (!code || code.trim().length === 0) {
      throw new Error('Game engine bundle is empty');
    }
    
    return code;
  } catch (error) {
    console.error('Failed to load game engine:', error);
    throw new Error(
      'Game engine bundle not found! Make sure to run "npm run build:standalone" first, ' +
      'and ensure the dist-standalone folder is accessible.'
    );
  }
}

/**
 * Checks if the game engine bundle exists
 */
export async function isGameEngineBuilt(): Promise<boolean> {
  try {
    const response = await fetch('/dist-standalone/game-engine.js', { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}
