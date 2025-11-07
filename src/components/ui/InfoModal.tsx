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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70" 
            onClick={handleBackdropClick}
        >
            <div className="bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-lg shadow-xl w-full max-w-md p-6 m-4 max-h-[80vh] overflow-y-auto">
                <h2 className="text-xl font-bold mb-4">{title}</h2>
                <div className="text-[var(--text-secondary)] mb-6 whitespace-pre-wrap">
                    {children}
                </div>
                <div className="flex justify-end">
                    <button 
                        onClick={onClose} 
                        className="px-4 py-2 rounded-lg bg-[var(--accent-purple)] hover:opacity-80 transition-colors text-white font-semibold"
                    >
                        {closeLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InfoModal;
