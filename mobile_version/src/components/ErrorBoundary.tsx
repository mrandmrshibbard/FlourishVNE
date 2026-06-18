import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    panelName?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
    // This project has no React type declarations installed (no @types/react; React 19 ships none),
    // so `react` is implicitly `any` and TS can't see Component's inherited members on this class.
    // Declare the ones we use (type-only — no runtime effect). The real fix is installing
    // @types/react@19, but that would surface many new errors across the loosely-typed codebase.
    declare props: Props;
    declare setState: (state: Partial<State> | null) => void;

    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        this.setState({ errorInfo });
    }

    private getErrorReport(): string {
        const { error, errorInfo } = this.state;
        const panelName = this.props.panelName || 'Unknown Panel';
        return [
            `Flourish Visual Novel Engine Error Report`,
            `Panel: ${panelName}`,
            `Time: ${new Date().toISOString()}`,
            `Error: ${error?.message || 'Unknown error'}`,
            `Stack: ${error?.stack || 'No stack trace'}`,
            `Component Stack: ${errorInfo?.componentStack || 'No component stack'}`
        ].join('\n');
    }

    private handleCopyReport = () => {
        const report = this.getErrorReport();
        navigator.clipboard.writeText(report).catch(() => {});
    };

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            const panelName = this.props.panelName || 'This panel';

            return (
                <div className="p-4 bg-red-900/50 border border-red-500 rounded-lg m-4">
                    <h2 className="text-red-300 font-bold mb-2">{panelName} encountered an error</h2>
                    <pre className="text-red-200 text-sm overflow-auto max-h-40 whitespace-pre-wrap mb-3">
                        {this.state.error?.message}
                    </pre>
                    <div className="flex gap-2">
                        <button
                            onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                            className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-sm"
                        >
                            Try Again
                        </button>
                        <button
                            onClick={this.handleCopyReport}
                            className="px-3 py-1 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm"
                        >
                            Copy Error Report
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
