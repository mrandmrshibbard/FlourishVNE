import React, { useState, useMemo } from 'react';

interface HelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CommandDoc {
  name: string;
  category: string;
  description: string;
  params: string[];
  example: string;
}

const COMMAND_DOCS: CommandDoc[] = [
  { name: 'Dialogue', category: 'Story', description: 'Display character dialogue with optional speaker name and portrait.', params: ['text', 'characterId'], example: 'Show Sakura saying "Hello!" on the left side of the screen.' },
  { name: 'Choice', category: 'Story', description: 'Present the player with multiple options that affect the story path.', params: ['options[]', 'text', 'actions'], example: 'Ask the player "Where do you go?" with options "Park", "Library", "Home".' },
  { name: 'BranchStart', category: 'Story', description: 'Begin a named branch section for organizing story paths visually.', params: ['name', 'color', 'branchId'], example: 'Start a branch called "Sakura Route" colored pink to group related commands.' },
  { name: 'BranchEnd', category: 'Story', description: 'End a previously opened branch section.', params: ['branchId'], example: 'Close the "Sakura Route" branch block.' },
  { name: 'ShowCharacter', category: 'Visual', description: 'Display a character sprite on screen with position and expression.', params: ['characterId', 'expressionId', 'position', 'transition', 'duration'], example: 'Show Kai at center position with happy expression, fading in over 0.5 seconds.' },
  { name: 'HideCharacter', category: 'Visual', description: 'Remove a character from the screen with a transition.', params: ['characterId', 'transition', 'duration'], example: 'Hide Sakura with a fade-out transition over 1 second.' },
  { name: 'SetBackground', category: 'Visual', description: 'Change the background image of the scene.', params: ['backgroundId', 'transition', 'duration'], example: 'Set background to "school_hallway" with crossfade over 1 second.' },
  { name: 'ShowText', category: 'Visual', description: 'Display text overlay on screen at a specific position with styling.', params: ['text', 'x', 'y', 'fontSize', 'fontFamily', 'color', 'transition', 'duration'], example: 'Show "Chapter 1" centered on screen in large white text, fading in.' },
  { name: 'HideText', category: 'Visual', description: 'Remove a previously shown text overlay from the screen.', params: ['targetCommandId', 'transition', 'duration'], example: 'Hide the chapter title text with a fade-out.' },
  { name: 'ShowImage', category: 'Visual', description: 'Display an image overlay on screen with position, size, and rotation.', params: ['imageId', 'x', 'y', 'width', 'height', 'rotation', 'opacity', 'transition', 'duration'], example: 'Show a letter image centered on screen at 50% size, fading in.' },
  { name: 'HideImage', category: 'Visual', description: 'Remove a previously shown image overlay from the screen.', params: ['targetCommandId', 'transition', 'duration'], example: 'Hide the letter image with a fade-out transition.' },
  { name: 'ShowButton', category: 'Visual', description: 'Display an interactive button on screen with styling and click actions.', params: ['text', 'x', 'y', 'width', 'height', 'backgroundColor', 'textColor', 'onClick', 'transition'], example: 'Show a "Continue" button at the bottom center that jumps to the next scene when clicked.' },
  { name: 'HideButton', category: 'Visual', description: 'Remove a previously shown button from the screen.', params: ['targetCommandId', 'transition', 'duration'], example: 'Hide the "Continue" button with a fade-out.' },
  { name: 'PlayMusic', category: 'Audio', description: 'Start playing background music. Loops by default.', params: ['audioId', 'loop', 'fadeDuration', 'volume'], example: 'Play "romantic_theme.mp3" at 80% volume with 2s fade-in.' },
  { name: 'StopMusic', category: 'Audio', description: 'Stop the currently playing background music.', params: ['fadeDuration'], example: 'Stop music with a 1 second fade-out.' },
  { name: 'PlaySoundEffect', category: 'Audio', description: 'Play a one-shot sound effect.', params: ['audioId', 'volume'], example: 'Play door_knock sound at full volume.' },
  { name: 'StopSoundEffect', category: 'Audio', description: 'Stop all currently playing sound effects.', params: [], example: 'Stop all sound effects immediately.' },
  { name: 'PlayMovie', category: 'Media', description: 'Play a video file. In fullscreen mode, shows over a black background (cutscenes). In overlay mode, plays transparently on top of the scene (effects like falling petals, rain).', params: ['videoId', 'waitsForCompletion', 'displayMode', 'loop'], example: 'Play falling petals as a looping transparent overlay while dialogue continues underneath.' },
  { name: 'StopMovie', category: 'Media', description: 'Stop all currently playing movie overlays.', params: [], example: 'Stop the falling petals overlay when the scene changes.' },
  { name: 'SetVariable', category: 'Logic', description: 'Set a game variable to a value. Used for tracking choices and stats.', params: ['variableId', 'operator', 'value', 'randomMin', 'randomMax'], example: 'Set "playerScore" to 10, or add 5 to "friendshipLevel".' },
  { name: 'TextInput', category: 'Logic', description: 'Ask the player to type text input and store it in a variable.', params: ['variableId', 'prompt', 'placeholder', 'maxLength'], example: 'Ask "What is your name?" and store the answer in "playerName".' },
  { name: 'Jump', category: 'Flow', description: 'Jump to another scene immediately.', params: ['targetSceneId'], example: 'Jump to scene "chapter2_start".' },
  { name: 'Label', category: 'Flow', description: 'Define a named label point within a scene that can be jumped to.', params: ['labelId'], example: 'Create a label called "loop_start" to mark a return point.' },
  { name: 'JumpToLabel', category: 'Flow', description: 'Jump to a named label within the current scene.', params: ['labelId'], example: 'Jump back to the "loop_start" label to repeat a section.' },
  { name: 'Wait', category: 'Flow', description: 'Pause for a specified duration before continuing.', params: ['duration', 'waitForInput'], example: 'Wait 2 seconds before showing next dialogue, or wait for player click.' },
  { name: 'ShowScreen', category: 'Flow', description: 'Display a custom UI screen (menus, inventories, etc.).', params: ['screenId'], example: 'Show the "inventory_screen" UI overlay.' },
  { name: 'ShakeScreen', category: 'Effects', description: 'Apply a screen shake effect for dramatic impact.', params: ['duration', 'intensity'], example: 'Shake the screen for 0.5 seconds at medium intensity during an explosion.' },
  { name: 'TintScreen', category: 'Effects', description: 'Apply a color tint overlay to the entire screen.', params: ['color', 'duration'], example: 'Tint the screen red over 1 second to indicate danger.' },
  { name: 'FlashScreen', category: 'Effects', description: 'Flash the screen with a bright color for a brief moment.', params: ['color', 'duration'], example: 'Flash the screen white for 0.3 seconds for a lightning effect.' },
  { name: 'PanZoomScreen', category: 'Effects', description: 'Pan and zoom the camera to focus on a specific area.', params: ['zoom', 'panX', 'panY', 'duration'], example: 'Zoom in 2x on the left side of the screen over 1 second.' },
  { name: 'ResetScreenEffects', category: 'Effects', description: 'Reset all active screen effects (tint, zoom, etc.) back to normal.', params: ['duration'], example: 'Reset all screen effects smoothly over 0.5 seconds.' },
  { name: 'SetScreenOverlayEffect', category: 'Effects', description: 'Apply a persistent overlay effect like rain, snow, or particles.', params: ['effectType', 'intensity', 'variant', 'color'], example: 'Add a gentle snowfall effect at 50% intensity.' },
  { name: 'Group', category: 'Organization', description: 'Group multiple events together for visual organization in the editor.', params: ['name', 'commandIds'], example: 'Group the "enter classroom" events (background, characters, music) together.' },
];

const CATEGORIES = ['Story', 'Visual', 'Audio', 'Logic', 'Flow', 'Effects', 'Organization'];

const CATEGORY_COLORS: Record<string, string> = {
  Story: '#f472b6',
  Visual: '#a78bfa',
  Audio: '#34d399',
  Logic: '#fbbf24',
  Flow: '#60a5fa',
  Effects: '#fb923c',
  Organization: '#94a3b8',
};

interface SectionState {
  gettingStarted: boolean;
  commands: boolean;
  shortcuts: boolean;
  tips: boolean;
}

const KEYBOARD_SHORTCUTS = [
  { keys: 'Ctrl + Z', action: 'Undo last action' },
  { keys: 'Ctrl + Y', action: 'Redo last action' },
  { keys: 'Ctrl + Shift + Z', action: 'Redo last action (alternative)' },
  { keys: 'Ctrl + S', action: 'Export / Save project' },
  { keys: 'Delete', action: 'Delete selected event' },
  { keys: 'Ctrl + D', action: 'Duplicate selected event' },
  { keys: 'Ctrl + C', action: 'Copy selected event' },
  { keys: 'Ctrl + V', action: 'Paste event' },
  { keys: 'Space', action: 'Play / Preview scene' },
  { keys: 'Escape', action: 'Close panel or cancel action' },
];

const TIPS = [
  { title: 'Organize with Scenes', tip: 'Break your story into logical scenes. Each scene should represent a distinct location, conversation, or event. This makes it easier to navigate and edit your project.' },
  { title: 'Use Variables for Branching', tip: 'Track player choices with variables (e.g., "friendshipLevel", "route"). Use conditions to create branching paths based on these values for a more dynamic story.' },
  { title: 'Preview Often', tip: 'Use the Play button frequently to test your scenes. This helps catch dialogue errors, missing transitions, and pacing issues early.' },
  { title: 'Layer Your Audio', tip: 'Combine background music with sound effects for immersive scenes. Use fade-in/out durations for smooth audio transitions between scenes.' },
  { title: 'Use Labels for Loops', tip: 'Instead of duplicating content, use Label and JumpToLabel commands to create loops within a scene — great for retry mechanics or repeated dialogue.' },
  { title: 'Command Stacking', tip: 'Use the async modifier on commands to run them in parallel. This lets you show a character, change background, and play music all at once for cinematic moments.' },
  { title: 'Branches for Organization', tip: 'Use BranchStart/BranchEnd to visually group related commands in the editor. Color-code branches to quickly identify different story routes.' },
  { title: 'Screen Effects for Drama', tip: 'Combine ShakeScreen, FlashScreen, and TintScreen effects with sound effects for impactful dramatic moments like explosions or revelations.' },
];

const ChevronIcon: React.FC<{ isOpen: boolean }> = ({ isOpen }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
  >
    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
  </svg>
);

const HelpPanel: React.FC<HelpPanelProps> = ({ isOpen, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sections, setSections] = useState<SectionState>({
    gettingStarted: true,
    commands: true,
    shortcuts: false,
    tips: false,
  });

  const toggleSection = (section: keyof SectionState) => {
    setSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const filteredCommands = useMemo(() => {
    if (!searchQuery.trim()) return COMMAND_DOCS;
    const q = searchQuery.toLowerCase();
    return COMMAND_DOCS.filter(
      cmd =>
        cmd.name.toLowerCase().includes(q) ||
        cmd.category.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q) ||
        cmd.params.some(p => p.toLowerCase().includes(q)) ||
        cmd.example.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const filteredShortcuts = useMemo(() => {
    if (!searchQuery.trim()) return KEYBOARD_SHORTCUTS;
    const q = searchQuery.toLowerCase();
    return KEYBOARD_SHORTCUTS.filter(
      s => s.keys.toLowerCase().includes(q) || s.action.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const filteredTips = useMemo(() => {
    if (!searchQuery.trim()) return TIPS;
    const q = searchQuery.toLowerCase();
    return TIPS.filter(
      t => t.title.toLowerCase().includes(q) || t.tip.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const hasGettingStartedMatch = useMemo(() => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const text = 'getting started project scene preview create add play editor hub';
    return text.includes(q);
  }, [searchQuery]);

  const groupedCommands = useMemo((): Array<[string, CommandDoc[]]> => {
    const result: Array<[string, CommandDoc[]]> = [];
    for (const cat of CATEGORIES) {
      const cmds = filteredCommands.filter(c => c.category === cat);
      if (cmds.length > 0) result.push([cat, cmds]);
    }
    return result;
  }, [filteredCommands]);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 transition-opacity duration-300"
          onClick={onClose}
        />
      )}
      <div
        className={`fixed top-0 right-0 h-full w-[400px] z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{
          backgroundColor: '#0f172a',
          borderLeft: '1px solid #334155',
          boxShadow: '-8px 0 30px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <span className="text-lg">📖</span>
            <h2 className="text-white font-semibold text-base">Help & Reference</h2>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-white p-1 rounded-md hover:bg-[var(--bg-primary)] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
          <div className="relative">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            >
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              placeholder="Search events, shortcuts, tips..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--bg-primary)] text-white text-sm pl-9 pr-3 py-2 rounded-lg border border-[var(--border-default)] focus:border-cyan-500 focus:outline-none placeholder-slate-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#475569 #0f172a' }}>
          {hasGettingStartedMatch && (
            <div className="border-b border-[var(--border-subtle)]/50">
              <button
                onClick={() => toggleSection('gettingStarted')}
                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[var(--bg-primary)]/50 transition-colors"
              >
                <ChevronIcon isOpen={sections.gettingStarted} />
                <span className="text-cyan-400 font-medium text-sm">Getting Started</span>
              </button>
              {sections.gettingStarted && (
                <div className="px-4 pb-4 space-y-3">
                  <div className="bg-[var(--bg-primary)]/50 rounded-lg p-3">
                    <h4 className="text-white text-xs font-semibold mb-1">1. Create a Project</h4>
                    <p className="text-[var(--text-secondary)] text-xs leading-relaxed">From the Project Hub, click "New Project" to start fresh or open an existing .zip project file.</p>
                  </div>
                  <div className="bg-[var(--bg-primary)]/50 rounded-lg p-3">
                    <h4 className="text-white text-xs font-semibold mb-1">2. Add Scenes</h4>
                    <p className="text-[var(--text-secondary)] text-xs leading-relaxed">Use the Scenes tab to create scenes. Each scene contains a sequence of commands that make up your story.</p>
                  </div>
                  <div className="bg-[var(--bg-primary)]/50 rounded-lg p-3">
                    <h4 className="text-white text-xs font-semibold mb-1">3. Add Commands</h4>
                    <p className="text-[var(--text-secondary)] text-xs leading-relaxed">Inside a scene, add commands like Dialogue, ShowCharacter, and SetBackground to build your visual novel.</p>
                  </div>
                  <div className="bg-[var(--bg-primary)]/50 rounded-lg p-3">
                    <h4 className="text-white text-xs font-semibold mb-1">4. Add Characters & Assets</h4>
                    <p className="text-[var(--text-secondary)] text-xs leading-relaxed">Use the Characters tab to create characters with expressions, and the Assets tab to import backgrounds, images, and audio.</p>
                  </div>
                  <div className="bg-[var(--bg-primary)]/50 rounded-lg p-3">
                    <h4 className="text-white text-xs font-semibold mb-1">5. Preview & Export</h4>
                    <p className="text-[var(--text-secondary)] text-xs leading-relaxed">Click "Play" to preview your game live. When ready, use "Export" to save as .zip or "Build" to create a standalone game.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {filteredCommands.length > 0 && (
            <div className="border-b border-[var(--border-subtle)]/50">
              <button
                onClick={() => toggleSection('commands')}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--bg-primary)]/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ChevronIcon isOpen={sections.commands} />
                  <span className="text-cyan-400 font-medium text-sm">Events Reference</span>
                </div>
                <span className="text-[var(--text-muted)] text-xs">{filteredCommands.length} events</span>
              </button>
              {sections.commands && (
                <div className="px-4 pb-4 space-y-4">
                  {groupedCommands.map(([category, cmds]) => (
                    <div key={category}>
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: CATEGORY_COLORS[category] || '#94a3b8' }}
                        />
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: CATEGORY_COLORS[category] || '#94a3b8' }}>
                          {category}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {cmds.map(cmd => (
                          <CommandCard key={cmd.name} cmd={cmd} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {filteredShortcuts.length > 0 && (
            <div className="border-b border-[var(--border-subtle)]/50">
              <button
                onClick={() => toggleSection('shortcuts')}
                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[var(--bg-primary)]/50 transition-colors"
              >
                <ChevronIcon isOpen={sections.shortcuts} />
                <span className="text-cyan-400 font-medium text-sm">Keyboard Shortcuts</span>
              </button>
              {sections.shortcuts && (
                <div className="px-4 pb-4 space-y-1">
                  {filteredShortcuts.map((shortcut, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-[var(--bg-primary)]/50">
                      <span className="text-[var(--text-primary)] text-xs">{shortcut.action}</span>
                      <kbd className="bg-[var(--bg-primary)] border border-[var(--border-default)] text-[var(--text-primary)] text-[10px] px-2 py-0.5 rounded font-mono">
                        {shortcut.keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {filteredTips.length > 0 && (
            <div className="border-b border-[var(--border-subtle)]/50">
              <button
                onClick={() => toggleSection('tips')}
                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[var(--bg-primary)]/50 transition-colors"
              >
                <ChevronIcon isOpen={sections.tips} />
                <span className="text-cyan-400 font-medium text-sm">Tips & Tricks</span>
              </button>
              {sections.tips && (
                <div className="px-4 pb-4 space-y-2">
                  {filteredTips.map((tip, i) => (
                    <div key={i} className="bg-[var(--bg-primary)]/50 rounded-lg p-3">
                      <h4 className="text-amber-400 text-xs font-semibold mb-1">💡 {tip.title}</h4>
                      <p className="text-[var(--text-secondary)] text-xs leading-relaxed">{tip.tip}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {searchQuery && filteredCommands.length === 0 && filteredShortcuts.length === 0 && filteredTips.length === 0 && !hasGettingStartedMatch && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <span className="text-3xl mb-3">🔍</span>
              <p className="text-[var(--text-secondary)] text-sm">No results found for "{searchQuery}"</p>
              <p className="text-[var(--text-muted)] text-xs mt-1">Try searching for a command name, category, or keyword.</p>
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)]/80">
          <p className="text-[var(--text-muted)] text-[10px] text-center">Flourish Visual Novel Engine</p>
        </div>
      </div>
    </>
  );
};

const CommandCard: React.FC<{ cmd: CommandDoc }> = ({ cmd }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className="bg-[var(--bg-primary)]/60 rounded-lg border border-[var(--border-subtle)]/50 overflow-hidden cursor-pointer hover:border-[var(--border-default)] transition-colors"
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <code className="text-white text-xs font-mono font-semibold">{cmd.name}</code>
        </div>
        <ChevronIcon isOpen={isExpanded} />
      </div>
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-[var(--border-subtle)]/30 pt-2">
          <p className="text-[var(--text-primary)] text-xs leading-relaxed">{cmd.description}</p>
          {cmd.params.length > 0 && (
            <div>
              <span className="text-[var(--text-muted)] text-[10px] uppercase tracking-wider font-semibold">Parameters</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {cmd.params.map(p => (
                  <span key={p} className="bg-[var(--bg-secondary)]/80 text-cyan-300 text-[10px] px-1.5 py-0.5 rounded font-mono">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <span className="text-[var(--text-muted)] text-[10px] uppercase tracking-wider font-semibold">Example</span>
            <p className="text-emerald-400/80 text-xs mt-0.5 italic">"{cmd.example}"</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default HelpPanel;
