import React from 'react';

interface InfoModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    closeLabel?: string;
}

const InfoModal: React.FC<InfoModalProps> = ({ 
    isOpen, 
    onClose, 
    title, 
    children, 
    closeLabel = 'Close' 
}) => {
    if (!isOpen) return null;

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm" 
            onClick={handleBackdropClick}
            style={{ animation: 'fade-in 0.2s ease-out' }}
        >
            <div 
                className="bg-gradient-to-b from-[var(--bg-tertiary)] to-[var(--bg-secondary)] text-[var(--text-primary)] rounded-xl shadow-2xl w-full max-w-md p-6 m-4 max-h-[80vh] overflow-y-auto border border-[var(--border-default)]"
                style={{ 
                    animation: 'modal-enter 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.4), 0 0 60px rgba(168, 85, 247, 0.1)'
                }}
            >
                <h2 className="text-lg font-semibold mb-4 text-[var(--text-primary)]">{title}</h2>
                <div className="text-[var(--text-secondary)] mb-6 whitespace-pre-wrap text-sm">
                    {children}
                </div>
                <div className="flex justify-end">
                    <button 
                        onClick={onClose} 
                        className="px-4 py-2 rounded-lg bg-gradient-to-r from-[var(--accent-purple)] to-[var(--accent-blue)] hover:shadow-lg hover:shadow-[var(--accent-purple)]/20 transition-all text-white font-medium"
                    >
                        {closeLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InfoModal;
