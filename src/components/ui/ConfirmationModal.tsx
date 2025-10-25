import React from 'react';

const ConfirmationModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    children: React.ReactNode;
}> = ({ isOpen, onClose, onConfirm, title, children }) => {
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70" 
            onClick={handleBackdropClick}
        >
            <div className="bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-lg shadow-xl w-full max-w-md p-6 m-4">
                <h2 className="text-xl font-bold mb-4">{title}</h2>
                <div className="text-[var(--text-secondary)] mb-6">
                    {children}
                </div>
                <div className="flex justify-end gap-4">
                    <button 
                        onClick={onClose} 
                        className="px-4 py-2 rounded-lg bg-[var(--bg-tertiary)] hover:opacity-80 transition-colors font-semibold"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={onConfirm} 
                        className="px-4 py-2 rounded-lg bg-[var(--accent-pink)] hover:opacity-80 transition-colors text-white font-semibold"
                    >
                        Confirm Delete
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
