/**
 * Game Builder Component
 * One-click game building with visual progress indicators
 * NO command line required - perfect for writers and artists!
 */

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { VNProject } from '../types/project';
import { buildStandaloneGame, downloadBlob, estimateBuildSize, BuildProgress } from '../utils/gameBundler';
import { validateProjectForBuild, ValidationResult } from '../utils/buildValidator';
import { GamepadIcon, XMarkIcon, GlobeIcon, SaveIcon, CheckIcon, ArrowDownTrayIcon } from './icons';

interface GameBuilderProps {
  project: VNProject;
  onClose: () => void;
}

type BuildStep = 'idle' | 'building' | 'success' | 'error';
type BuildType = 'web' | 'desktop';
type DesktopFormat = 'standalone' | 'installer';

export const GameBuilder: React.FC<GameBuilderProps> = ({ project, onClose }) => {
  const { t } = useTranslation('gameBuilder');
  const [buildStep, setBuildStep] = useState<BuildStep>('idle');
  const [buildType, setBuildType] = useState<BuildType>('web');
  const [desktopFormat, setDesktopFormat] = useState<DesktopFormat>('standalone');
  const [progress, setProgress] = useState<BuildProgress>({
    step: 'prepare',
    progress: 0,
    message: t('ready')
  });
  const [error, setError] = useState<string>('');
  const [gameBlob, setGameBlob] = useState<Blob | null>(null);
  const [buildSize, setBuildSize] = useState<number>(0);
  const [iconDataUrl, setIconDataUrl] = useState<string>('');
  const iconInputRef = React.useRef<HTMLInputElement>(null);

  const estimatedSize = estimateBuildSize(project);
  const validation = useMemo(() => validateProjectForBuild(project), [project]);

  const handleIconSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t('iconError'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setIconDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleBuild = async () => {
    try {
      setBuildStep('building');
      setError('');
      
      let blob: Blob;
      
      if (buildType === 'desktop') {
        // Import the desktop build function dynamically
        const { buildDesktopGame } = await import('../utils/desktopGameBundler');
        blob = await buildDesktopGame(project, (prog) => {
          setProgress(prog);
        }, iconDataUrl || undefined, desktopFormat);
        
        // Desktop builds save the file directly via Electron,
        // so we don't need to download the blob
        if (blob.size === 0) {
          setBuildStep('success');
          return;
        }
      } else {
        blob = await buildStandaloneGame(project, (prog) => {
          setProgress(prog);
        });
      }
      
      setGameBlob(blob);
      setBuildSize(blob.size / (1024 * 1024)); // Convert to MB
      setBuildStep('success');
      
    } catch (err) {
      console.error('Build error:', err);
      setError(err instanceof Error ? err.message : t('error.unknown'));
      setBuildStep('error');
    }
  };

  const handleDownload = async () => {
    if (!gameBlob) return;
    
    const filename = `${project.title?.replace(/[^a-z0-9]/gi, '_') || 'game'}_standalone.zip`;

    // In Electron, use a native save dialog defaulting to Builds/Web
    const api = (window as any).electronAPI;
    if (api?.saveProjectToPath) {
      try {
        const paths = await api.getUserDataPaths?.();
        const defaultDir = paths?.buildsWeb;
        const archiveData = new Uint8Array(await gameBlob.arrayBuffer());
        await api.saveProjectToPath(archiveData, filename, undefined, 'zip', defaultDir);
      } catch (err) {
        console.error('Save dialog failed, falling back to browser download:', err);
        downloadBlob(gameBlob, filename);
      }
      return;
    }

    downloadBlob(gameBlob, filename);
  };

  const handleReset = () => {
    setBuildStep('idle');
    setProgress({ step: 'prepare', progress: 0, message: t('ready') });
    setGameBlob(null);
    setError('');
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}><GamepadIcon style={{ display: 'inline-block', verticalAlign: 'middle', width: 28, height: 28, marginRight: 8 }} /> {t('title')}</h2>
          <button onClick={onClose} style={styles.closeButton}><XMarkIcon style={{ width: 24, height: 24 }} /></button>
        </div>

        <div style={styles.content}>
          {buildStep === 'idle' && (
            <>
              <div style={styles.buildTypeSelector}>
                <h3 style={styles.selectorTitle}>{t('chooseBuildType')}</h3>
                <div style={styles.buildTypes}>
                  <button
                    onClick={() => setBuildType('web')}
                    style={{
                      ...styles.buildTypeButton,
                      ...(buildType === 'web' ? styles.buildTypeButtonActive : {})
                    }}
                  >
                    <div style={styles.buildTypeIcon}><GlobeIcon style={{ width: 48, height: 48 }} /></div>
                    <div style={styles.buildTypeName}>{t('webBuild.name')}</div>
                    <div style={styles.buildTypeDesc}>
                      {t('webBuild.desc')}
                    </div>
                  </button>
                  <button
                    onClick={() => setBuildType('desktop')}
                    style={{
                      ...styles.buildTypeButton,
                      ...(buildType === 'desktop' ? styles.buildTypeButtonActive : {})
                    }}
                  >
                    <div style={styles.buildTypeIcon}><SaveIcon style={{ width: 48, height: 48 }} /></div>
                    <div style={styles.buildTypeName}>{t('desktopBuild.name')}</div>
                    <div style={styles.buildTypeDesc}>
                      {t('desktopBuild.desc')}
                    </div>
                  </button>
                </div>
              </div>

              <div style={styles.infoBox}>
                <h3 style={styles.infoTitle}>
                  {buildType === 'web' ? t('webBuild.infoTitle') : t('desktopBuild.infoTitle')}
                </h3>
                {buildType === 'web' ? (
                  <>
                    <p style={styles.infoText}>{t('webBuild.intro')}</p>
                    <ul style={styles.list}>
                      <li>{t('webBuild.item1')}</li>
                      <li>{t('webBuild.item2')}</li>
                      <li>{t('webBuild.item3')}</li>
                      <li>{t('webBuild.item4')}</li>
                      <li>{t('webBuild.item5')}</li>
                    </ul>
                  </>
                ) : (
                  <>
                    <p style={styles.infoText}>{t('desktopBuild.intro')}</p>
                    <ul style={styles.list}>
                      <li>{t('desktopBuild.item1')}</li>
                      <li>{t('desktopBuild.item2')}</li>
                      <li>{t('desktopBuild.item3')}</li>
                      <li>{t('desktopBuild.item4')}</li>
                      <li>{t('desktopBuild.item5')}</li>
                    </ul>
                    {desktopFormat === 'installer' && (
                      <p style={styles.warningText}>{t('desktopBuild.installerWarning')}</p>
                    )}
                    {desktopFormat === 'standalone' && (
                      <p style={styles.warningText}>{t('desktopBuild.standaloneWarning')}</p>
                    )}
                  </>
                )}
                <p style={styles.infoText}>
                  <strong>{t('noCodingRequired')}</strong>
                </p>
              </div>

              {buildType === 'desktop' && (
                <div style={styles.iconPickerSection}>
                  <input
                    type="file"
                    ref={iconInputRef}
                    accept="image/png,image/jpeg,image/ico"
                    onChange={handleIconSelect}
                    style={{ display: 'none' }}
                  />
                  <div style={styles.iconPickerLabel}>{t('iconPicker.label')}</div>
                  <div style={styles.iconPickerRow}>
                    <div
                      style={styles.iconPreviewBox}
                      onClick={() => iconInputRef.current?.click()}
                      title={t('iconPicker.clickToChoose')}
                    >
                      {iconDataUrl ? (
                        <img src={iconDataUrl} alt={t('iconPicker.altText')} style={styles.iconPreviewImg} />
                      ) : (
                        <span style={styles.iconPlaceholder}><SaveIcon style={{ width: 28, height: 28, opacity: 0.5 }} /></span>
                      )}
                    </div>
                    <div style={styles.iconPickerInfo}>
                      <button
                        style={styles.iconChooseBtn}
                        onClick={() => iconInputRef.current?.click()}
                      >
                        {iconDataUrl ? t('iconPicker.changeIcon') : t('iconPicker.chooseIcon')}
                      </button>
                      {iconDataUrl && (
                        <button
                          style={styles.iconClearBtn}
                          onClick={() => setIconDataUrl('')}
                        >
                          {t('iconPicker.remove')}
                        </button>
                      )}
                      <p style={styles.iconHint}>{t('iconPicker.hint')}</p>
                    </div>
                  </div>
                </div>
              )}

              {buildType === 'desktop' && (
                <div style={{ margin: '12px 0', padding: '12px 16px', borderRadius: '8px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(100,116,139,0.3)' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '8px', color: '#e2e8f0' }}>{t('formatPicker.title')}</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setDesktopFormat('standalone')}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: desktopFormat === 'standalone' ? '2px solid #8b5cf6' : '1px solid rgba(100,116,139,0.4)',
                        background: desktopFormat === 'standalone' ? 'rgba(139,92,246,0.15)' : 'rgba(30,41,59,0.4)',
                        color: '#e2e8f0',
                        cursor: 'pointer',
                        textAlign: 'left' as const,
                        fontSize: '13px',
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{t('formatPicker.standaloneName')}</div>
                      <div style={{ fontSize: '11px', opacity: 0.7 }}>
                        {t('formatPicker.standaloneDesc')}
                      </div>
                      <div style={{ fontSize: '10px', opacity: 0.5, marginTop: '4px' }}>
                        {t('formatPicker.standaloneNote')}
                      </div>
                    </button>
                    <button
                      onClick={() => setDesktopFormat('installer')}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: desktopFormat === 'installer' ? '2px solid #8b5cf6' : '1px solid rgba(100,116,139,0.4)',
                        background: desktopFormat === 'installer' ? 'rgba(139,92,246,0.15)' : 'rgba(30,41,59,0.4)',
                        color: '#e2e8f0',
                        cursor: 'pointer',
                        textAlign: 'left' as const,
                        fontSize: '13px',
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{t('formatPicker.installerName')}</div>
                      <div style={{ fontSize: '11px', opacity: 0.7 }}>
                        {t('formatPicker.installerDesc')}
                      </div>
                      <div style={{ fontSize: '10px', opacity: 0.5, marginTop: '4px' }}>
                        {t('formatPicker.installerNote')}
                      </div>
                    </button>
                  </div>
                </div>
              )}

              <div style={styles.statsBox}>
                <div style={styles.stat}>
                  <div style={styles.statLabel}>{t('stats.estimatedSize')}</div>
                  <div style={styles.statValue}>{estimatedSize.toFixed(1)} MB</div>
                </div>
                <div style={styles.stat}>
                  <div style={styles.statLabel}>{t('stats.scenes')}</div>
                  <div style={styles.statValue}>{Object.keys(project.scenes || {}).length}</div>
                </div>
                <div style={styles.stat}>
                  <div style={styles.statLabel}>{t('stats.characters')}</div>
                  <div style={styles.statValue}>{Object.keys(project.characters || {}).length}</div>
                </div>
              </div>

              {(validation.errors.length > 0 || validation.warnings.length > 0) && (
                <div style={{
                  margin: '16px 0',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: validation.errors.length > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(251, 191, 36, 0.15)',
                  border: `1px solid ${validation.errors.length > 0 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(251, 191, 36, 0.4)'}`,
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '8px', color: validation.errors.length > 0 ? '#f87171' : '#fbbf24', fontSize: '14px' }}>
                    {validation.errors.length > 0 ? t('validation.errors', { count: validation.errors.length }) : ''}
                    {validation.errors.length > 0 && validation.warnings.length > 0 ? t('validation.separator') : ''}
                    {validation.warnings.length > 0 ? t('validation.warnings', { count: validation.warnings.length }) : ''}
                  </div>
                  <div style={{ maxHeight: '120px', overflowY: 'auto', fontSize: '12px' }}>
                    {validation.errors.map((e, i) => (
                      <div key={`err-${i}`} style={{ color: '#f87171', marginBottom: '4px' }}>
                        ⛔ {e.message} {e.location && <span style={{ opacity: 0.7 }}>({e.location})</span>}
                      </div>
                    ))}
                    {validation.warnings.map((w, i) => (
                      <div key={`warn-${i}`} style={{ color: '#fbbf24', marginBottom: '4px' }}>
                        ⚠️ {w.message} {w.location && <span style={{ opacity: 0.7 }}>({w.location})</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button 
                onClick={handleBuild} 
                style={{
                  ...styles.buildButton,
                  ...(validation.errors.length > 0 ? { opacity: 0.5, cursor: 'not-allowed' } : {})
                }}
                disabled={validation.errors.length > 0}
              >
                {validation.errors.length > 0
                  ? t('buildBtn.fixErrors')
                  : buildType === 'web' ? t('buildBtn.buildWeb') : desktopFormat === 'installer' ? t('buildBtn.buildInstaller') : t('buildBtn.buildStandalone')}
              </button>

              <div style={styles.helpBox}>
                <p style={styles.helpText}>
                  <strong>{t('helpBox.firstTime')}</strong>{' '}{t('helpBox.before')}{' '}
                  <a href="https://itch.io" target="_blank" rel="noopener noreferrer" style={styles.link}>itch.io</a>{' '}
                  {t('helpBox.after')}
                </p>
              </div>
            </>
          )}

          {buildStep === 'building' && (
            <div style={styles.progressContainer}>
              <div style={styles.progressBar}>
                <div style={{ ...styles.progressFill, width: `${progress.progress}%` }} />
              </div>
              <div style={styles.progressText}>{Math.round(progress.progress)}%</div>
              <div style={styles.progressMessage}>{progress.message}</div>
              
              {buildType === 'web' ? (
                <div style={styles.progressSteps}>
                  <div style={getStepStyle(progress.step, 'prepare', buildType)}>{t('progress.web.prepare')}</div>
                  <div style={getStepStyle(progress.step, 'generate', buildType)}>{t('progress.web.generate')}</div>
                  <div style={getStepStyle(progress.step, 'assets', buildType)}>{t('progress.web.assets')}</div>
                  <div style={getStepStyle(progress.step, 'finalize', buildType)}>{t('progress.web.finalize')}</div>
                </div>
              ) : (
                <div style={{ ...styles.progressSteps, gridTemplateColumns: '1fr 1fr 1fr' }}>
                  <div style={getStepStyle(progress.step, 'prepare', buildType)}>{t('progress.desktop.prepare')}</div>
                  <div style={getStepStyle(progress.step, 'generate', buildType)}>{t('progress.desktop.generate')}</div>
                  <div style={getStepStyle(progress.step, 'assets', buildType)}>{t('progress.desktop.assets')}</div>
                  <div style={getStepStyle(progress.step, 'install', buildType)}>{t('progress.desktop.install')}</div>
                  <div style={getStepStyle(progress.step, 'build', buildType)}>{t('progress.desktop.build')}</div>
                  <div style={getStepStyle(progress.step, 'save', buildType)}>{t('progress.desktop.save')}</div>
                </div>
              )}

              {buildType === 'desktop' && (
                <p style={{ color: '#94a3b8', fontSize: '12px', textAlign: 'center', marginTop: '16px' }}>
                  {t('progress.desktop.working')}
                </p>
              )}
            </div>
          )}

          {buildStep === 'success' && (
            <div style={styles.successContainer}>
              <div style={styles.successIcon}><CheckIcon style={{ width: 64, height: 64, color: '#4CAF50' }} /></div>
              <h3 style={styles.successTitle}>
                {buildType === 'web' ? t('success.webTitle') : desktopFormat === 'installer' ? t('success.installerTitle') : t('success.desktopTitle')}
              </h3>
              <p style={styles.successText}>
                {buildType === 'web'
                  ? t('success.webText')
                  : desktopFormat === 'installer'
                  ? t('success.installerText')
                  : t('success.desktopText')}
              </p>

              {buildType === 'web' && (
                <>
                  <div style={styles.buildInfo}>
                    <div style={styles.buildStat}>
                      <strong>{t('success.fileSize')}</strong> {buildSize.toFixed(1)} MB
                    </div>
                    <div style={styles.buildStat}>
                      <strong>{t('success.format')}</strong> {t('success.formatValue')}
                    </div>
                  </div>

                  <button onClick={handleDownload} style={styles.downloadButton}>
                    <ArrowDownTrayIcon style={{ display: 'inline-block', verticalAlign: 'middle', width: 20, height: 20, marginRight: 8 }} /> {t('success.downloadBtn')}
                  </button>
                </>
              )}
              
              {buildType === 'desktop' && (
                <div style={styles.successMessage}>
                  <p style={{ fontSize: '16px', color: '#10b981', margin: '16px 0' }}>
                    {t('success.execSaved')}
                  </p>
                  <p style={{ fontSize: '14px', color: '#94a3b8' }}>
                    {t('success.execLocation')}
                  </p>
                </div>
              )}

              <div style={styles.nextSteps}>
                <h4 style={styles.nextStepsTitle}>{t('nextSteps.title')}</h4>
                {buildType === 'web' ? (
                  <ol style={styles.nextStepsList}>
                    <li>
                      <strong>{t('nextSteps.web.step1Title')}</strong>
                      <br />
                      {t('nextSteps.web.step1GoTo')}{' '}<a href="https://itch.io/game/new" target="_blank" rel="noopener noreferrer" style={styles.link}>itch.io/game/new</a>
                      <br />
                      {t('nextSteps.web.step1ChooseHtml')}
                      <br />
                      {t('nextSteps.web.step1Upload')}
                      <br />
                      {t('nextSteps.web.step1Check')}
                      <br />
                      {t('nextSteps.web.step1Publish')}
                    </li>
                    <li>
                      <strong>{t('nextSteps.web.step2Title')}</strong> {t('nextSteps.web.step2Desc')}
                    </li>
                    <li>
                      <strong>{t('nextSteps.web.step3Title')}</strong> {t('nextSteps.web.step3Desc')}
                    </li>
                  </ol>
                ) : (
                  <ol style={styles.nextStepsList}>
                    <li>
                      <strong>{t('nextSteps.desktop.step1Title')}</strong> {desktopFormat === 'installer' ? t('nextSteps.desktop.step1Installer') : t('nextSteps.desktop.step1Standalone')}
                      <br />
                      {t('nextSteps.desktop.step1Windows')}
                      <br />
                      {t('nextSteps.desktop.step1Mac')}
                      <br />
                      {t('nextSteps.desktop.step1Linux')}
                    </li>
                    <li>
                      <strong>{t('nextSteps.desktop.step2Title')}</strong> {desktopFormat === 'installer' ? t('nextSteps.desktop.step2ShareInstaller') : t('nextSteps.desktop.step2ShareStandalone')}
                      <br />
                      {desktopFormat === 'installer'
                        ? t('nextSteps.desktop.step2InstallerDesc')
                        : t('nextSteps.desktop.step2StandaloneDesc')}
                    </li>
                    <li>
                      <strong>{t('nextSteps.desktop.step3Title')}</strong> {t('nextSteps.desktop.step3Desc')}
                      <br />
                      {t('nextSteps.desktop.step3Item1')}
                      <br />
                      {t('nextSteps.desktop.step3Item2')}
                      <br />
                      {t('nextSteps.desktop.step3Item3')}
                    </li>
                    {desktopFormat === 'installer' && (
                      <li>
                        <strong>{t('nextSteps.desktop.step4InstallerTitle')}</strong>
                        <br />
                        {t('nextSteps.desktop.step4Item1')}
                        <br />
                        {t('nextSteps.desktop.step4Item2')}
                        <br />
                        {t('nextSteps.desktop.step4Item3')}
                        <br />
                        {t('nextSteps.desktop.step4Item4')}
                      </li>
                    )}
                    <li>
                      <strong>{t('nextSteps.desktop.step5NoteTitle')}</strong> {desktopFormat === 'installer' ? t('nextSteps.desktop.step5NoteInstaller') : t('nextSteps.desktop.step5NoteStandalone')}
                      <br />
                      {t('nextSteps.desktop.step5Platform')}
                    </li>
                  </ol>
                )}
              </div>

              <button onClick={handleReset} style={styles.resetButton}>
                {t('success.buildAnotherVersion')}
              </button>
            </div>
          )}

          {buildStep === 'error' && (
            <div style={styles.errorContainer}>
              <div style={styles.errorIcon}><XMarkIcon style={{ width: 64, height: 64, color: '#f44336' }} /></div>
              <h3 style={styles.errorTitle}>{t('error.title')}</h3>
              <p style={styles.errorMessage}>{error}</p>

              <div style={styles.errorHelp}>
                <p><strong>{t('error.commonFixes')}</strong></p>
                <ul style={styles.list}>
                  <li>{t('error.fix1')}</li>
                  <li>{t('error.fix2')}</li>
                  <li>{t('error.fix3')}</li>
                </ul>
              </div>

              <button onClick={handleReset} style={styles.retryButton}>
                {t('error.tryAgain')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function getStepStyle(currentStep: string, targetStep: string, bType: BuildType = 'web') {
  const webSteps = ['prepare', 'generate', 'assets', 'finalize'];
  const desktopSteps = ['prepare', 'generate', 'assets', 'install', 'build', 'save'];
  const steps = bType === 'desktop' ? desktopSteps : webSteps;

  const isActive = currentStep === targetStep;
  const isPast = steps.indexOf(currentStep) > steps.indexOf(targetStep);
  
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
  },
  buildTypeSelector: {
    marginBottom: '20px'
  },
  selectorTitle: {
    margin: '0 0 15px 0',
    color: '#fff',
    fontSize: '18px',
    textAlign: 'center' as const
  },
  buildTypes: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '15px'
  },
  buildTypeButton: {
    padding: '20px',
    background: '#2a2a2a',
    border: '2px solid #444',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    textAlign: 'center' as const
  },
  buildTypeButtonActive: {
    background: '#667eea',
    borderColor: '#764ba2',
    transform: 'scale(1.05)'
  },
  buildTypeIcon: {
    fontSize: '48px',
    marginBottom: '10px'
  },
  buildTypeName: {
    color: '#fff',
    fontSize: '18px',
    fontWeight: 'bold' as const,
    marginBottom: '8px'
  },
  buildTypeDesc: {
    color: '#999',
    fontSize: '12px',
    lineHeight: '1.4'
  },
  warningText: {
    color: '#ff9800',
    fontSize: '14px',
    marginTop: '10px',
    padding: '10px',
    background: '#2a2a2a',
    borderRadius: '6px'
  },
  iconPickerSection: {
    margin: '16px 0',
    padding: '14px 16px',
    background: '#1e1e2e',
    borderRadius: '10px',
    border: '1px solid #333'
  },
  iconPickerLabel: {
    color: '#ccc',
    fontSize: '13px',
    fontWeight: 'bold' as const,
    marginBottom: '10px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px'
  },
  iconPickerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px'
  },
  iconPreviewBox: {
    width: '64px',
    height: '64px',
    borderRadius: '12px',
    background: '#2a2a3a',
    border: '2px dashed #555',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    overflow: 'hidden',
    flexShrink: 0,
    transition: 'border-color 0.2s'
  },
  iconPreviewImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    borderRadius: '10px'
  },
  iconPlaceholder: {
    fontSize: '28px',
    opacity: 0.5
  },
  iconPickerInfo: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: '8px'
  },
  iconChooseBtn: {
    padding: '6px 14px',
    background: '#667eea',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    cursor: 'pointer',
    fontWeight: 'bold' as const
  },
  iconClearBtn: {
    padding: '6px 12px',
    background: 'transparent',
    color: '#f87171',
    border: '1px solid #f87171',
    borderRadius: '6px',
    fontSize: '12px',
    cursor: 'pointer'
  },
  iconHint: {
    color: '#666',
    fontSize: '11px',
    margin: 0,
    width: '100%'
  },
  successMessage: {
    textAlign: 'center' as const,
    margin: '16px 0'
  }
};
