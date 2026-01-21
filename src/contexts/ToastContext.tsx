import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
    action?: {
        label: string;
        onClick: () => void;
    };
}

interface ToastContextValue {
    toasts: Toast[];
    addToast: (message: string, type?: ToastType, options?: { duration?: number; action?: Toast['action'] }) => void;
    removeToast: (id: string) => void;
    success: (message: string, options?: { duration?: number; action?: Toast['action'] }) => void;
    error: (message: string, options?: { duration?: number; action?: Toast['action'] }) => void;
    warning: (message: string, options?: { duration?: number; action?: Toast['action'] }) => void;
    info: (message: string, options?: { duration?: number; action?: Toast['action'] }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

// Icon components for each toast type
const CheckIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
);

const ErrorIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const WarningIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
);

const InfoIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const CloseIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const TOAST_STYLES: Record<ToastType, { bg: string; border: string; icon: string; iconComponent: React.FC }> = {
    success: {
        bg: 'bg-emerald-900/95',
        border: 'border-emerald-500',
        icon: 'text-emerald-400',
        iconComponent: CheckIcon,
    },
    error: {
        bg: 'bg-red-900/95',
        border: 'border-red-500',
        icon: 'text-red-400',
        iconComponent: ErrorIcon,
    },
    warning: {
        bg: 'bg-amber-900/95',
        border: 'border-amber-500',
        icon: 'text-amber-400',
        iconComponent: WarningIcon,
    },
    info: {
        bg: 'bg-sky-900/95',
        border: 'border-sky-500',
        icon: 'text-sky-400',
        iconComponent: InfoIcon,
    },
};

const ToastItem: React.FC<{ toast: Toast; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
    const [isExiting, setIsExiting] = useState(false);
    const style = TOAST_STYLES[toast.type];
    const IconComponent = style.iconComponent;

    const handleRemove = useCallback(() => {
        setIsExiting(true);
        setTimeout(() => onRemove(toast.id), 200);
    }, [toast.id, onRemove]);

    useEffect(() => {
        if (toast.duration !== 0) {
            const timer = setTimeout(handleRemove, toast.duration || 3000);
            return () => clearTimeout(timer);
        }
    }, [toast.duration, handleRemove]);

    return (
        <div
            className={`
                flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg backdrop-blur-sm
                ${style.bg} ${style.border}
                transform transition-all duration-200 ease-out
                ${isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'}
            `}
            role="alert"
        >
            <span className={`flex-shrink-0 ${style.icon}`}>
                <IconComponent />
            </span>
            <div className="flex-1 min-w-0">
                <p className="text-sm text-white">{toast.message}</p>
                {toast.action && (
                    <button
                        onClick={() => {
                            toast.action?.onClick();
                            handleRemove();
                        }}
                        className="mt-1 text-xs font-medium text-sky-300 hover:text-sky-200 underline"
                    >
                        {toast.action.label}
                    </button>
                )}
            </div>
            <button
                onClick={handleRemove}
                className="flex-shrink-0 text-slate-400 hover:text-white transition-colors"
                aria-label="Dismiss"
            >
                <CloseIcon />
            </button>
        </div>
    );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const toastIdRef = useRef(0);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const addToast = useCallback(
        (message: string, type: ToastType = 'info', options?: { duration?: number; action?: Toast['action'] }) => {
            const id = `toast-${++toastIdRef.current}`;
            const newToast: Toast = {
                id,
                message,
                type,
                duration: options?.duration,
                action: options?.action,
            };
            setToasts((prev) => [...prev, newToast]);
        },
        []
    );

    const success = useCallback(
        (message: string, options?: { duration?: number; action?: Toast['action'] }) => addToast(message, 'success', options),
        [addToast]
    );

    const error = useCallback(
        (message: string, options?: { duration?: number; action?: Toast['action'] }) => addToast(message, 'error', { duration: 5000, ...options }),
        [addToast]
    );

    const warning = useCallback(
        (message: string, options?: { duration?: number; action?: Toast['action'] }) => addToast(message, 'warning', { duration: 4000, ...options }),
        [addToast]
    );

    const info = useCallback(
        (message: string, options?: { duration?: number; action?: Toast['action'] }) => addToast(message, 'info', options),
        [addToast]
    );

    return (
        <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, warning, info }}>
            {children}
            {/* Toast container - fixed position in bottom-right */}
            <div
                className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
                aria-live="polite"
                aria-label="Notifications"
            >
                {toasts.map((toast) => (
                    <div key={toast.id} className="pointer-events-auto">
                        <ToastItem toast={toast} onRemove={removeToast} />
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export default ToastContext;
