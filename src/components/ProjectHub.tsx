import React, { useRef, useState } from 'react';
import { VNProject } from '../types/project';
import { createInitialProject } from '../constants';
import { PlusIcon, UploadIcon } from './icons';
import { importProject } from '../utils/projectPackager';
import LoadingSpinner from './ui/LoadingSpinner';

export const ProjectHub: React.FC<{
    onProjectSelect: (project: VNProject) => void;
}> = ({ onProjectSelect }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleCreateNew = () => {
        const newProject = createInitialProject();
        // The new project is not saved to localStorage; it's passed directly to the editor state.
        onProjectSelect(newProject);
    };

    const handleFileOpen = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsLoading(true);
        try {
            // importProject no longer saves to localStorage.
            // It just parses the file and returns the project object.
            const { project } = await importProject(file);
            onProjectSelect(project);
        } catch (error) {
            console.error("Error loading project file:", error);
            alert(`Failed to load project file. Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsLoading(false);
            // Reset file input
            if (event.target) {
                event.target.value = '';
            }
        }
    };

    return (
        <div className="h-screen w-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex items-center justify-center p-4">
            <div className="w-full max-w-4xl p-8">
                <header className="text-center mb-12">
                    <h1 className="font-heading text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-pink)] to-[var(--accent-cyan)]">Flourish Visual Novel Engine</h1>
                    <p className="text-[var(--text-secondary)] mt-2">🌈🌸 Create Without Limits 🌸🌈</p>
                </header>

                <main className="flex flex-col md:flex-row items-center justify-center gap-8">
                    <button 
                        onClick={handleCreateNew}
                        className="w-full md:w-1/2 h-64 text-center p-6 bg-[var(--accent-purple)]/20 hover:bg-[var(--accent-purple)]/30 border-2 border-[var(--accent-purple)]/50 rounded-lg shadow-lg transition-all transform hover:scale-105 flex flex-col items-center justify-center"
                    >
                        <div className="bg-[var(--accent-purple)]/20 p-4 rounded-full mb-4"><PlusIcon className="w-8 h-8" /></div>
                        <h2 className="text-2xl font-semibold">Create New Project</h2>
                        <p className="text-[var(--text-secondary)]">Start from a blank canvas.</p>
                    </button>
                    <button 
                        onClick={handleFileOpen}
                        disabled={isLoading}
                        className="w-full md:w-1/2 h-64 text-center p-6 bg-[var(--accent-cyan)]/20 hover:bg-[var(--accent-cyan)]/30 border-2 border-[var(--accent-cyan)]/50 rounded-lg shadow-lg transition-all transform hover:scale-105 flex flex-col items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                         <div className="bg-[var(--accent-cyan)]/20 p-4 rounded-full mb-4">
                            {isLoading ? (
                                <LoadingSpinner size="lg" />
                            ) : (
                                <UploadIcon className="w-8 h-8" />
                            )}
                         </div>
                        <h2 className="text-2xl font-semibold">{isLoading ? 'Loading...' : 'Load Project'}</h2>
                        <p className="text-[var(--text-secondary)]">Load a .zip project file.</p>
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".zip,application/zip" onChange={handleFileChange} />
                </main>
                 <footer className="text-center mt-12 text-[var(--text-secondary)]">
                    <p>Your work is now managed in memory. Please use the 'Save' button in the editor to save your project.</p>
                </footer>
            </div>
        </div>
    );
};
