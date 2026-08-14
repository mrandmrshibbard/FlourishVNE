

// Simple audio synthesis using Web Audio API to avoid external asset dependencies
let audioCtx: AudioContext | null = null;
let bgmNodes: { osc: OscillatorNode, gain: GainNode, modulator?: OscillatorNode, modGain?: GainNode, panner?: StereoPannerNode, filter?: BiquadFilterNode }[] = [];
// Removed bgmTimeout as we now use the beat scheduler for everything
let beatTimer: number | null = null;
let isMusicPlaying = false;
let areSoundEffectsEnabled = true;
let chordCount = 0;

// Song Configuration
interface SongConfig {
  name: string;
  bpm: number;
  mix: {
    chordWave: OscillatorType;
    arpWave: OscillatorType;
    kickVol: number;
    rimVol: number;
    shakerVol: number;
    chordVol: number;
  };
  filter: {
    chordCutoff: number; // If 0, uses FM Synthesis (Bell/Piano). If > 0, uses Subtractive (Pad/Synth)
    arpBaseFreq: number;
  };
}

const SONG_LIBRARY: SongConfig[] = [
  {
    name: "Sakura Drift", // Lo-Fi (Original)
    bpm: 80,
    mix: { chordWave: "sine", arpWave: "sawtooth", kickVol: 0.5, rimVol: 0.1, shakerVol: 0.035, chordVol: 0.06 },
    filter: { chordCutoff: 0, arpBaseFreq: 1200 }
  },
  {
    name: "Kyoto Gardens", // Zen/Ambient
    bpm: 60,
    mix: { chordWave: "triangle", arpWave: "sine", kickVol: 0, rimVol: 0, shakerVol: 0.02, chordVol: 0.05 },
    filter: { chordCutoff: 500, arpBaseFreq: 800 }
  },
  {
    name: "Shibuya Crossing", // Upbeat Pop
    bpm: 110,
    mix: { chordWave: "triangle", arpWave: "square", kickVol: 0.6, rimVol: 0.15, shakerVol: 0.04, chordVol: 0.05 },
    filter: { chordCutoff: 1500, arpBaseFreq: 1500 }
  },
  {
    name: "Neon Rain", // Synthwave
    bpm: 95,
    mix: { chordWave: "sawtooth", arpWave: "sawtooth", kickVol: 0.55, rimVol: 0.12, shakerVol: 0.03, chordVol: 0.035 },
    filter: { chordCutoff: 800, arpBaseFreq: 1000 }
  },
  // ── 2026-08 additions — same chill Lo-Fi vibe, four new flavours ──
  {
    name: "Midnight Study", // Classic head-nod Lo-Fi: FM e-piano, lazy kick
    bpm: 72,
    mix: { chordWave: "sine", arpWave: "sine", kickVol: 0.45, rimVol: 0.08, shakerVol: 0.028, chordVol: 0.06 },
    filter: { chordCutoff: 0, arpBaseFreq: 900 }
  },
  {
    name: "Rainy Window", // Mellow muffled pad, like music through glass
    bpm: 68,
    mix: { chordWave: "triangle", arpWave: "triangle", kickVol: 0.35, rimVol: 0.06, shakerVol: 0.024, chordVol: 0.055 },
    filter: { chordCutoff: 650, arpBaseFreq: 700 }
  },
  {
    name: "Paper Lanterns", // Warm floating bells, a touch brighter
    bpm: 76,
    mix: { chordWave: "sine", arpWave: "sine", kickVol: 0.4, rimVol: 0.1, shakerVol: 0.03, chordVol: 0.055 },
    filter: { chordCutoff: 0, arpBaseFreq: 1050 }
  },
  {
    name: "Slow Tides", // Deep, drumless-feeling drift — the sleepiest of the set
    bpm: 62,
    mix: { chordWave: "sawtooth", arpWave: "sine", kickVol: 0.3, rimVol: 0, shakerVol: 0.018, chordVol: 0.04 },
    filter: { chordCutoff: 450, arpBaseFreq: 600 }
  }
];

let currentSong = SONG_LIBRARY[0];
// Once the user PICKS a song (player dropdown / skip), stop shuffling on play — before this
// fix, toggleBackgroundMusic(true) re-randomised currentSong, so selecting a specific song
// from the list actually played a random one.
let songExplicitlyChosen = false;

const LOOKAHEAD = 25.0; // ms
const SCHEDULE_AHEAD_TIME = 0.1; // s
let nextNoteTime = 0.0;
let currentSequenceStep = 0; // 0-31 (2 bars of 16th notes)
let noiseBuffer: AudioBuffer | null = null;
let currentChordNotes: number[] = []; // Store current chord for the arpeggiator

// Note Frequencies
const N = {
  C3: 130.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, Ab4: 415.30, A4: 440.00, Bb4: 466.16, B4: 493.88,
  C5: 523.25, Eb5: 622.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
  C6: 1046.50
};

// Chord Progressions
const progressions = [
  // 1. Chill: ii - V - I (The Lo-Fi Staple)
  [
    [N.D4, N.F4, N.A4, N.C5], // Dm7
    [N.G3, N.F4, N.A4, N.B4], // G7
    [N.C4, N.E4, N.G4, N.B4], // Cmaj7
    [N.C4, N.G4, N.B4, N.D5]  // Cmaj9
  ],
  // 2. Sentimental: IV - V - iii - vi (Anime Classic)
  [
    [N.F4, N.A4, N.C5, N.E5], // Fmaj7
    [N.G4, N.B4, N.D5, N.F5], // G7
    [N.E4, N.G4, N.B4, N.D5], // Em7
    [N.A3, N.C4, N.E4, N.G4]  // Am7
  ],
  // 3. Bittersweet: IV - iv - I
  [
    [N.F4, N.A4, N.C5, N.E5], // Fmaj7
    [N.F4, N.Ab4, N.C5, N.Eb5], // Fm7
    [N.C4, N.E4, N.G4, N.B4], // Cmaj7
    [N.C4, N.E4, N.G4, N.B4]  // Cmaj7 (Hold)
  ],
  // 4. Rising: I - iii - IV - V
  [
    [N.C4, N.E4, N.G4, N.B4], // Cmaj7
    [N.E4, N.G4, N.B4, N.D5], // Em7
    [N.F4, N.A4, N.C5, N.E5], // Fmaj7
    [N.G4, N.B4, N.D5, N.F5]  // G7
  ],
  // 5. Strings: vi - IV - I - V
  [
    [N.A3, N.C4, N.E4, N.G4], // Am7
    [N.F3, N.A4, N.C5, N.E5], // Fmaj7
    [N.C4, N.E4, N.G4, N.B4], // Cmaj7
    [N.G3, N.B3, N.D4, N.F4]  // G7
  ]
];

const melodyNotes = [N.C5, N.D5, N.E5, N.G5, N.A5, N.C6];

let currentProgressionIdx = 0;
let currentChordIdx = 0;

const getCtx = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
};

// Create a buffer of white noise for percussion use
const getNoiseBuffer = (ctx: AudioContext) => {
    if (!noiseBuffer) {
        const bufferSize = ctx.sampleRate * 2; // 2 seconds
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        noiseBuffer = buffer;
    }
    return noiseBuffer;
};

export const toggleSoundEffects = (enable: boolean) => {
  areSoundEffectsEnabled = enable;
  if (!enable && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
};

export const playSound = (type: 'correct' | 'wrong' | 'complete' | 'click') => {
  if (!areSoundEffectsEnabled) return;
  
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'correct') {
      // Pleasant major chord sound
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.1); // E5
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);

      // Harmony
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(783.99, ctx.currentTime); // G5
      gain2.gain.setValueAtTime(0.2, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc2.start();
      osc2.stop(ctx.currentTime + 0.5);

    } else if (type === 'wrong') {
      // Low buzz/thud
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);

    } else if (type === 'complete') {
      // Victory fanfare sequence
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.type = 'sine';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.1);
        g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.1 + 0.6);
        o.start(ctx.currentTime + i * 0.1);
        o.stop(ctx.currentTime + i * 0.1 + 0.6);
      });

    } else if (type === 'click') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
    }
  } catch (e) {
    console.error("Audio play failed", e);
  }
};

export const speakKana = (text: string, rate: number = 0.9) => {
  if (!areSoundEffectsEnabled) return;
  if (!('speechSynthesis' in window)) return;
  
  // Cancel any pending speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.rate = rate; 
  utterance.volume = 1;
  
  // Try to find a Japanese voice
  const voices = window.speechSynthesis.getVoices();
  const jaVoice = voices.find(v => v.lang.includes('ja'));
  if (jaVoice) {
    utterance.voice = jaVoice;
  }

  window.speechSynthesis.speak(utterance);
};


// Ambient Music & Beat Generator

export const toggleBackgroundMusic = (enable: boolean) => {
  const ctx = getCtx();
  if (enable) {
    if (isMusicPlaying) return;

    // Shuffle only until the user picks a song themselves — an explicit pick sticks.
    if (!songExplicitlyChosen) {
        currentSong = SONG_LIBRARY[Math.floor(Math.random() * SONG_LIBRARY.length)];
    }

    isMusicPlaying = true;
    chordCount = 0; // Reset progress
    currentSequenceStep = 0;
    
    // Pick initial progression
    currentProgressionIdx = Math.floor(Math.random() * progressions.length);
    currentChordIdx = 0;

    // Prepare buffers
    getNoiseBuffer(ctx);
    
    // Start Beat Loop (Master Clock)
    nextNoteTime = ctx.currentTime + 0.1;
    scheduleBeat();

  } else {
    isMusicPlaying = false;
    
    // Stop beat loop
    if (beatTimer) {
        clearTimeout(beatTimer);
        beatTimer = null;
    }
    
    // Fade out existing nodes
    bgmNodes.forEach(({ gain, modGain }) => {
      try {
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
        if (modGain) modGain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
      } catch (e) {}
    });
    setTimeout(() => {
      bgmNodes.forEach(n => { 
        try { n.osc.stop(); if (n.modulator) n.modulator.stop(); } catch(e){} 
      });
      bgmNodes = [];
    }, 1000);
  }
};

// --- Beat Scheduler (Master Clock) ---

const nextNote = () => {
    const secondsPerBeat = 60.0 / currentSong.bpm;
    // 16th notes = 0.25 beats
    nextNoteTime += 0.25 * secondsPerBeat;
    
    currentSequenceStep++;
    // 2 Bars of 16th notes = 32 steps
    if (currentSequenceStep === 32) {
        currentSequenceStep = 0;
    }
}

const scheduleBeatNote = (step: number, time: number) => {
    const ctx = getCtx();
    
    // --- 1. Master Chord Trigger (Every 32 steps = 2 Bars) ---
    if (step === 0) {
        playNextEvent(ctx, time);
    }

    // --- 2. Percussion ---
    // Beat pattern repeats every 16 steps (1 Bar)
    const barStep = step % 16;

    // Kick: 1, 3.5
    if (barStep === 0 || barStep === 10) {
        playKick(ctx, time);
    }
    
    // Rimshot: 2, 4
    if (barStep === 4 || barStep === 12) {
        playRim(ctx, time);
    }

    // Shaker: 16th feel
    // Skip shaker on Kick hits to keep mix clean
    if (barStep !== 0) {
        const isOffBeat = barStep % 4 === 2;
        const vol = isOffBeat ? currentSong.mix.shakerVol : (currentSong.mix.shakerVol * 0.4);
        playShaker(ctx, time, vol);
    }

    // --- 3. Arpeggiator ---
    // Joins after 2 chords (~12 seconds)
    // Plays on 8th notes (every even step) for consistent rhythm
    if (chordCount > 2 && currentChordNotes.length > 0) {
        if (step % 2 === 0) {
            // 90% chance to play a note for slight variation, or 100% for steady
            if (Math.random() < 0.9) {
                // Pick a random note from the current chord (base + octave)
                const pool = [...currentChordNotes, ...currentChordNotes.map(f => f * 2)];
                const freq = pool[Math.floor(Math.random() * pool.length)];
                playArpNote(ctx, freq, time);
            }
        }
    }
    
    // --- 4. Sparkle Melody ---
    // Occasional accents (rare)
    if (chordCount > 8 && step === 0 && Math.random() < 0.3) {
        playMelodyNote(ctx, time + 0.5); // Offset slightly
    }
};

const scheduleBeat = () => {
    if (!isMusicPlaying) return;
    
    const ctx = getCtx();
    
    while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_TIME) {
        scheduleBeatNote(currentSequenceStep, nextNoteTime);
        nextNote();
    }
    
    beatTimer = window.setTimeout(scheduleBeat, LOOKAHEAD);
};

// --- Instrument Synthesis ---

const playKick = (ctx: AudioContext, time: number) => {
    if (currentSong.mix.kickVol <= 0) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'sine';
    
    // Pitch sweep
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
    
    // Envelope
    gain.gain.setValueAtTime(currentSong.mix.kickVol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
    
    osc.start(time);
    osc.stop(time + 0.5);
};

const playRim = (ctx: AudioContext, time: number) => {
    if (currentSong.mix.rimVol <= 0) return;

    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, time);
    oscGain.gain.setValueAtTime(currentSong.mix.rimVol, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    
    osc.start(time);
    osc.stop(time + 0.1);

    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const noiseFilter = ctx.createBiquadFilter();
    const noiseGain = ctx.createGain();
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 2000;
    
    noiseGain.gain.setValueAtTime(currentSong.mix.rimVol * 1.2, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    
    noise.start(time);
    noise.stop(time + 0.15);
};

const playShaker = (ctx: AudioContext, time: number, amp: number) => {
    if (amp <= 0) return;

    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    
    gain.gain.setValueAtTime(amp, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    
    noise.start(time);
    noise.stop(time + 0.05);
};


// --- Chord Event Logic ---

const playNextEvent = (ctx: AudioContext, time: number) => {
    // Logic to pick chord
    const prog = progressions[currentProgressionIdx];
    const chord = prog[currentChordIdx];

    chordCount++;
    currentChordNotes = chord; // Update for Arpeggiator

    // 1. Play Main Chord
    playChord(ctx, chord, time);

    // 2. Play Harmony Pad (Strings) - Joins in after 4 chords
    if (chordCount > 4) {
        // Play Root and 5th of the chord as a warm pad
        const padNotes = [chord[0], chord[2]]; 
        playHarmonyPad(ctx, padNotes, time);
    }

    // Advance index
    currentChordIdx++;
    if (currentChordIdx >= prog.length) {
        currentChordIdx = 0;
        // 50% chance to switch progression
        if (Math.random() > 0.5) {
            currentProgressionIdx = Math.floor(Math.random() * progressions.length);
        }
    }
};

const playChord = (ctx: AudioContext, freqs: number[], time: number) => {
  // Clean up old nodes.
  if (bgmNodes.length > 80) {
      bgmNodes.slice(0, 20).forEach(n => {
          try { n.gain.disconnect(); n.modGain?.disconnect(); n.panner?.disconnect(); n.filter?.disconnect(); } catch(e){}
      });
      bgmNodes = bgmNodes.slice(20);
  }

  const pan = -0.3 + Math.random() * 0.6;

  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    
    osc.type = currentSong.mix.chordWave;
    osc.frequency.value = freq;
    
    panner.pan.value = pan;
    
    const start = time + (i * 0.04); 
    const duration = 5.0; // Sustain
    
    if (currentSong.filter.chordCutoff === 0) {
        // --- FM Synthesis Mode (Bell/E-Piano) ---
        const modulator = ctx.createOscillator();
        const modGain = ctx.createGain();

        modulator.type = 'sine';
        modulator.frequency.value = freq * (4 + (Math.random() * 0.02)); 
        modGain.gain.value = freq * (0.5 + Math.random() * 0.2); 
        
        modulator.connect(modGain);
        modGain.connect(osc.frequency);
        osc.connect(gain);
        gain.connect(panner);
        
        // Envelope
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(currentSong.mix.chordVol, start + 0.05); 
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        
        // Mod Envelope
        modGain.gain.setValueAtTime(freq * 1.5, start);
        modGain.gain.exponentialRampToValueAtTime(freq * 0.1, start + 0.6);

        modulator.start(start);
        modulator.stop(start + duration);
        bgmNodes.push({ osc, gain, modulator, modGain, panner });

    } else {
        // --- Subtractive Synthesis Mode (Pads/Synths) ---
        const filter = ctx.createBiquadFilter();
        
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(currentSong.filter.chordCutoff, start);
        // Slight filter movement
        filter.frequency.linearRampToValueAtTime(currentSong.filter.chordCutoff * 0.8, start + 2);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(panner);
        
        // Slower attack for pads
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(currentSong.mix.chordVol, start + 0.5); 
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

        bgmNodes.push({ osc, gain, filter, panner });
    }

    panner.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration);
  });
};

const playArpNote = (ctx: AudioContext, freq: number, time: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const panner = ctx.createStereoPanner();

    osc.type = currentSong.mix.arpWave;
    osc.frequency.value = freq;

    // Filter Logic
    filter.type = 'lowpass';
    filter.Q.value = 4; 
    filter.frequency.setValueAtTime(currentSong.filter.arpBaseFreq / 10, time);
    filter.frequency.linearRampToValueAtTime(currentSong.filter.arpBaseFreq + (Math.random() * 400), time + 0.03); 
    filter.frequency.exponentialRampToValueAtTime(currentSong.filter.arpBaseFreq / 5, time + 0.3); 

    // Amplitude Envelope
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.035, time + 0.01); // Fast attack
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5); // Decay

    panner.pan.value = -0.5 + Math.random(); 

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(ctx.destination);

    osc.start(time);
    osc.stop(time + 0.6);

    bgmNodes.push({ osc, gain, filter, panner });
};

const playHarmonyPad = (ctx: AudioContext, freqs: number[], time: number) => {
    const pan = -0.2 + Math.random() * 0.4;

    freqs.forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const panner = ctx.createStereoPanner();

        osc.type = 'triangle';
        osc.frequency.value = freq;

        filter.type = 'lowpass';
        filter.frequency.value = 600; 
        filter.Q.value = 1;

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(panner);
        panner.connect(ctx.destination);
        panner.pan.value = pan;

        const duration = 7.0; // Overlaps next chord significantly

        // Slow swell
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.025, time + 2.0);
        gain.gain.linearRampToValueAtTime(0, time + duration);

        filter.frequency.setValueAtTime(600, time);
        filter.frequency.linearRampToValueAtTime(800, time + 3.0);
        filter.frequency.linearRampToValueAtTime(400, time + duration);

        osc.start(time);
        osc.stop(time + duration);

        bgmNodes.push({ osc, gain, filter, panner });
    });
};

const playMelodyNote = (ctx: AudioContext, time: number) => {
    const freq = melodyNotes[Math.floor(Math.random() * melodyNotes.length)];
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();

    osc.type = 'sine';
    osc.frequency.value = freq;
    
    osc.connect(gain);
    gain.connect(panner);
    panner.connect(ctx.destination);

    panner.pan.value = -0.5 + Math.random();

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.05, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 1.5);

    osc.start(time);
    osc.stop(time + 1.5);
};


// --- Public API for external Music Player ---

/** Returns whether background music is currently playing */
export const isBgmPlaying = (): boolean => isMusicPlaying;

/** Returns the name of the currently selected song */
export const getCurrentSongName = (): string => currentSong.name;

/** Returns the full list of song names */
export const getSongList = (): string[] => SONG_LIBRARY.map(s => s.name);

/** Skip to a specific song by name, or pick a random different one if no name given */
export const skipToNextSong = (songName?: string): string => {
    const wasPlaying = isMusicPlaying;

    // Stop current playback
    if (wasPlaying) {
        toggleBackgroundMusic(false);
    }

    // Pick the next song — and pin it, so restarting playback doesn't reshuffle it away.
    songExplicitlyChosen = true;
    if (songName) {
        const found = SONG_LIBRARY.find(s => s.name === songName);
        if (found) currentSong = found;
    } else {
        // Pick a random different song
        const others = SONG_LIBRARY.filter(s => s.name !== currentSong.name);
        currentSong = others[Math.floor(Math.random() * others.length)] || SONG_LIBRARY[0];
    }

    // Restart if it was playing
    if (wasPlaying) {
        // Small delay to let fade-out finish
        setTimeout(() => toggleBackgroundMusic(true), 150);
    }

    return currentSong.name;
};