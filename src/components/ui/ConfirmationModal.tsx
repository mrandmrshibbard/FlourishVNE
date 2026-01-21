import React from 'react';

const ConfirmationModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    children: React.ReactNode;
    confirmLabel?: string;
}> = ({ isOpen, onClose, onConfirm, title, children, confirmLabel }) => {
    if (!isOpen) return null;

    // Use onClick for the backdrop. The check e.target === e.currentTarget ensures that only
    // clicks on the backdrop itself (not its children) will trigger onClose.
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fadeIn" 
            onClick={handleBackdropClick}
            style={{ animation: 'fade-in 0.2s ease-out' }}
        >
            <div 
                className="bg-gradient-to-b from-[var(--bg-tertiary)] to-[var(--bg-secondary)] text-[var(--text-primary)] rounded-xl shadow-2xl w-full max-w-md p-6 m-4 border border-[var(--border-default)]"
                style={{ 
                    animation: 'modal-enter 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.4), 0 0 60px rgba(168, 85, 247, 0.1)'
                }}
            >
                <h2 className="text-lg font-semibold mb-4 text-[var(--text-primary)]">{title}</h2>
                <div className="text-[var(--text-secondary)] mb-6 text-sm">
                    {children}
                </div>
                <div className="flex justify-end gap-3">
                    <button 
                        onClick={onClose} 
                        className="px-4 py-2 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-all font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={onConfirm} 
                        className="px-4 py-2 rounded-lg bg-gradient-to-r from-[var(--accent-pink)] to-[var(--accent-purple)] hover:shadow-lg hover:shadow-[var(--accent-pink)]/20 transition-all text-white font-medium"
                    >
                        {confirmLabel || 'Confirm Delete'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
