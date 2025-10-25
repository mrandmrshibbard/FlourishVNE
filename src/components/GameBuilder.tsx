/**
 * Game Builder Component
 * One-click game building with visual progress indicators
 * NO command line required - perfect for writers and artists!
 */

import React, { useState } from 'react';
import { VNProject } from '../types/project';
import { buildStandaloneGame, downloadBlob, estimateBuildSize, BuildProgress } from '../utils/gameBundler';

interface GameBuilderProps {
  project: VNProject;
  onClose: () => void;
}

type BuildStep = 'idle' | 'building' | 'success' | 'error';

export const GameBuilder: React.FC<GameBuilderProps> = ({ project, onClose }) => {
  const [buildStep, setBuildStep] = useState<BuildStep>('idle');
  const [progress, setProgress] = useState<BuildProgress>({
    step: 'prepare',
    progress: 0,
    message: 'Ready to build...'
  });
  const [error, setError] = useState<string>('');
  const [gameBlob, setGameBlob] = useState<Blob | null>(null);
  const [buildSize, setBuildSize] = useState<number>(0);

  const estimatedSize = estimateBuildSize(project);

  const handleBuild = async () => {
    try {
      setBuildStep('building');
      setError('');
      
      const blob = await buildStandaloneGame(project, (prog) => {
        setProgress(prog);
      });
      
      setGameBlob(blob);
      setBuildSize(blob.size / (1024 * 1024)); // Convert to MB
      setBuildStep('success');
      
    } catch (err) {
      console.error('Build error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setBuildStep('error');
    }
  };

  const handleDownload = () => {
    if (!gameBlob) return;
    
    const filename = `${project.title?.replace(/[^a-z0-9]/gi, '_') || 'game'}_standalone.zip`;
    downloadBlob(gameBlob, filename);
  };

  const handleReset = () => {
    setBuildStep('idle');
    setProgress({ step: 'prepare', progress: 0, message: 'Ready to build...' });
    setGameBlob(null);
    setError('');
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>🎮 Build Standalone Game</h2>
          <button onClick={onClose} style={styles.closeButton}>✕</button>
        </div>

        <div style={styles.content}>
          {buildStep === 'idle' && (
            <>
              <div style={styles.infoBox}>
                <h3 style={styles.infoTitle}>What is this?</h3>
                <p style={styles.infoText}>
                  This creates a <strong>complete, playable game</strong> that you can:
                </p>
                <ul style={styles.list}>
                  <li>✅ Upload to <strong>itch.io</strong> (easiest!)</li>
                  <li>✅ Share on any web host (Netlify, GitHub Pages, etc.)</li>
                  <li>✅ Send to friends as a ZIP file</li>
                  <li>✅ Play offline in any browser</li>
                </ul>
                <p style={styles.infoText}>
                  <strong>No coding required!</strong> Just download and upload.
                </p>
              </div>

              <div style={styles.statsBox}>
                <div style={styles.stat}>
                  <div style={styles.statLabel}>Estimated Size:</div>
                  <div style={styles.statValue}>{estimatedSize.toFixed(1)} MB</div>
                </div>
                <div style={styles.stat}>
                  <div style={styles.statLabel}>Scenes:</div>
                  <div style={styles.statValue}>{Object.keys(project.scenes || {}).length}</div>
                </div>
                <div style={styles.stat}>
                  <div style={styles.statLabel}>Characters:</div>
                  <div style={styles.statValue}>{Object.keys(project.characters || {}).length}</div>
                </div>
              </div>

              <button onClick={handleBuild} style={styles.buildButton}>
                🚀 Build My Game
              </button>

              <div style={styles.helpBox}>
                <p style={styles.helpText}>
                  <strong>First time?</strong> After building, you'll get a ZIP file. 
                  Upload it to <a href="https://itch.io" target="_blank" rel="noopener noreferrer" style={styles.link}>itch.io</a> and 
                  you're done! No command line needed.
                </p>
              </div>
            </>
          )}

          {buildStep === 'building' && (
            <div style={styles.progressContainer}>
              <div style={styles.progressBar}>
                <div style={{ ...styles.progressFill, width: `${progress.progress}%` }} />
              </div>
              <div style={styles.progressText}>{progress.progress}%</div>
              <div style={styles.progressMessage}>{progress.message}</div>
              
              <div style={styles.progressSteps}>
                <div style={getStepStyle(progress.step, 'prepare')}>📋 Preparing</div>
                <div style={getStepStyle(progress.step, 'generate')}>⚙️ Generating</div>
                <div style={getStepStyle(progress.step, 'assets')}>🎨 Bundling Assets</div>
                <div style={getStepStyle(progress.step, 'finalize')}>📦 Finalizing</div>
              </div>
            </div>
          )}

          {buildStep === 'success' && (
            <div style={styles.successContainer}>
              <div style={styles.successIcon}>✅</div>
              <h3 style={styles.successTitle}>Game Built Successfully!</h3>
              <p style={styles.successText}>
                Your game is ready to share with the world!
              </p>

              <div style={styles.buildInfo}>
                <div style={styles.buildStat}>
                  <strong>File Size:</strong> {buildSize.toFixed(1)} MB
                </div>
                <div style={styles.buildStat}>
                  <strong>Format:</strong> HTML5 (ZIP)
                </div>
              </div>

              <button onClick={handleDownload} style={styles.downloadButton}>
                ⬇️ Download Game ZIP
              </button>

              <div style={styles.nextSteps}>
                <h4 style={styles.nextStepsTitle}>What's Next?</h4>
                <ol style={styles.nextStepsList}>
                  <li>
                    <strong>Upload to itch.io (Recommended):</strong>
                    <br />
                    Go to <a href="https://itch.io/game/new" target="_blank" rel="noopener noreferrer" style={styles.link}>itch.io/game/new</a>
                    <br />
                    Choose "HTML" as the upload type
                    <br />
                    Upload the ZIP file you just downloaded
                    <br />
                    Check "This file will be played in the browser"
                    <br />
                    Publish!
                  </li>
                  <li>
                    <strong>Or host yourself:</strong> Unzip and upload the contents to any web host
                  </li>
                  <li>
                    <strong>Or share offline:</strong> Send the ZIP to friends - they can unzip and open index.html
                  </li>
                </ol>
              </div>

              <button onClick={handleReset} style={styles.resetButton}>
                Build Another Version
              </button>
            </div>
          )}

          {buildStep === 'error' && (
            <div style={styles.errorContainer}>
              <div style={styles.errorIcon}>❌</div>
              <h3 style={styles.errorTitle}>Build Failed</h3>
              <p style={styles.errorMessage}>{error}</p>
              
              <div style={styles.errorHelp}>
                <p><strong>Common fixes:</strong></p>
                <ul style={styles.list}>
                  <li>Make sure your project has at least one scene</li>
                  <li>Check that all assets are properly loaded</li>
                  <li>Try closing and reopening the app</li>
                </ul>
              </div>

              <button onClick={handleReset} style={styles.retryButton}>
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function getStepStyle(currentStep: string, targetStep: string) {
  const isActive = currentStep === targetStep;
  const isPast = ['prepare', 'generate', 'assets', 'finalize'].indexOf(currentStep) > 
                 ['prepare', 'generate', 'assets', 'finalize'].indexOf(targetStep);
  
  return {
    ...styles.progressStep,
    ...(isActive ? styles.progressStepActive : {}),
    ...(isPast ? styles.progressStepComplete : {})
  };
}

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: '20px'
  },
  modal: {
    background: '#1e1e1e',
    borderRadius: '12px',
    maxWidth: '600px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    borderBottom: '1px solid #333'
  },
  title: {
    margin: 0,
    color: '#fff',
    fontSize: '24px'
  },
  closeButton: {
    background: 'transparent',
    border: 'none',
    color: '#999',
    fontSize: '24px',
    cursor: 'pointer',
    padding: '0 10px'
  },
  content: {
    padding: '20px'
  },
  infoBox: {
    background: '#2a2a2a',
    padding: '20px',
    borderRadius: '8px',
    marginBottom: '20px'
  },
  infoTitle: {
    margin: '0 0 10px 0',
    color: '#4CAF50',
    fontSize: '18px'
  },
  infoText: {
    margin: '10px 0',
    color: '#ccc',
    lineHeight: '1.6'
  },
  list: {
    margin: '10px 0',
    paddingLeft: '20px',
    color: '#ccc',
    lineHeight: '1.8'
  },
  statsBox: {
    display: 'flex',
    gap: '15px',
    marginBottom: '20px'
  },
  stat: {
    flex: 1,
    background: '#2a2a2a',
    padding: '15px',
    borderRadius: '8px',
    textAlign: 'center' as const
  },
  statLabel: {
    color: '#999',
    fontSize: '12px',
    marginBottom: '5px'
  },
  statValue: {
    color: '#fff',
    fontSize: '24px',
    fontWeight: 'bold' as const
  },
  buildButton: {
    width: '100%',
    padding: '15px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '18px',
    fontWeight: 'bold' as const,
    cursor: 'pointer',
    marginBottom: '20px'
  },
  helpBox: {
    background: '#2a2a2a',
    padding: '15px',
    borderRadius: '8px',
    borderLeft: '4px solid #2196F3'
  },
  helpText: {
    margin: 0,
    color: '#ccc',
    fontSize: '14px',
    lineHeight: '1.6'
  },
  link: {
    color: '#2196F3',
    textDecoration: 'none'
  },
  progressContainer: {
    padding: '20px 0'
  },
  progressBar: {
    width: '100%',
    height: '30px',
    background: '#2a2a2a',
    borderRadius: '15px',
    overflow: 'hidden',
    marginBottom: '10px'
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #4CAF50, #8BC34A)',
    transition: 'width 0.3s ease'
  },
  progressText: {
    textAlign: 'center' as const,
    color: '#fff',
    fontSize: '24px',
    fontWeight: 'bold' as const,
    marginBottom: '10px'
  },
  progressMessage: {
    textAlign: 'center' as const,
    color: '#999',
    marginBottom: '20px'
  },
  progressSteps: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px'
  },
  progressStep: {
    padding: '10px',
    background: '#2a2a2a',
    borderRadius: '8px',
    textAlign: 'center' as const,
    color: '#666',
    fontSize: '14px'
  },
  progressStepActive: {
    background: '#667eea',
    color: '#fff'
  },
  progressStepComplete: {
    background: '#4CAF50',
    color: '#fff'
  },
  successContainer: {
    textAlign: 'center' as const
  },
  successIcon: {
    fontSize: '64px',
    marginBottom: '20px'
  },
  successTitle: {
    margin: '0 0 10px 0',
    color: '#4CAF50',
    fontSize: '24px'
  },
  successText: {
    color: '#ccc',
    marginBottom: '20px'
  },
  buildInfo: {
    display: 'flex',
    gap: '20px',
    justifyContent: 'center',
    marginBottom: '20px'
  },
  buildStat: {
    color: '#999',
    fontSize: '14px'
  },
  downloadButton: {
    padding: '15px 30px',
    background: '#4CAF50',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '18px',
    fontWeight: 'bold' as const,
    cursor: 'pointer',
    marginBottom: '30px'
  },
  nextSteps: {
    background: '#2a2a2a',
    padding: '20px',
    borderRadius: '8px',
    textAlign: 'left' as const,
    marginBottom: '20px'
  },
  nextStepsTitle: {
    margin: '0 0 15px 0',
    color: '#fff'
  },
  nextStepsList: {
    margin: 0,
    paddingLeft: '20px',
    color: '#ccc',
    lineHeight: '1.8'
  },
  resetButton: {
    padding: '10px 20px',
    background: 'transparent',
    color: '#999',
    border: '1px solid #999',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  errorContainer: {
    textAlign: 'center' as const
  },
  errorIcon: {
    fontSize: '64px',
    marginBottom: '20px'
  },
  errorTitle: {
    margin: '0 0 10px 0',
    color: '#f44336',
    fontSize: '24px'
  },
  errorMessage: {
    color: '#ccc',
    background: '#2a2a2a',
    padding: '15px',
    borderRadius: '8px',
    marginBottom: '20px',
    fontFamily: 'monospace'
  },
  errorHelp: {
    background: '#2a2a2a',
    padding: '20px',
    borderRadius: '8px',
    textAlign: 'left' as const,
    marginBottom: '20px'
  },
  retryButton: {
    padding: '15px 30px',
    background: '#f44336',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '18px',
    cursor: 'pointer'
  }
};
