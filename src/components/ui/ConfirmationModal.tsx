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
            className="modal-overlay" 
            onClick={handleBackdropClick}
        >
            <div className="modal-content w-full max-w-md p-6 m-4">
                <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>{title}</h2>
                <div className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                    {children}
                </div>
                <div className="flex justify-end gap-4">
                    <button 
                        onClick={onClose} 
                        className="btn btn-secondary"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={onConfirm} 
                        className="btn btn-danger"
                    >
                        {confirmLabel || 'Confirm Delete'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
