import React, { Component, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';

interface Props {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        this.setState({ errorInfo });
        void error;
        void errorInfo;
    }

    handleReload = () => window.location.reload();
    handleGoHome = () => { window.location.href = '/'; };
    handleRetry = () => this.setState({ hasError: false, error: null, errorInfo: null });

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            return (
                <div className="min-h-screen bg-app flex items-center justify-center p-6">
                    <div className="max-w-md w-full text-center">
                        <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-rose-500/10 flex items-center justify-center">
                            <AlertTriangle size={40} className="text-rose-500" />
                        </div>
                        <h1 className="text-2xl font-black text-main mb-2">Something went wrong</h1>
                        <p className="text-sm text-muted mb-6 leading-relaxed">
                            An unexpected error occurred. You can try again or go back to the dashboard.
                        </p>

                        {this.state.error && (
                            <details className="mb-6 text-left bg-rose-500/5 border border-rose-500/10 rounded-2xl p-4">
                                <summary className="text-[10px] font-black uppercase tracking-widest text-rose-500 cursor-pointer flex items-center gap-2">
                                    <Bug size={12} /> Error Details
                                </summary>
                                <pre className="mt-3 text-[10px] text-muted overflow-auto max-h-32 font-mono bg-app rounded-lg p-3">
                                    {this.state.error.message}
                                    {this.state.errorInfo?.componentStack?.slice(0, 500)}
                                </pre>
                            </details>
                        )}

                        <div className="flex gap-3">
                            <button onClick={this.handleRetry}
                                className="flex-1 py-3 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-primary-hover transition-colors">
                                <RefreshCw size={14} /> Try Again
                            </button>
                            <button onClick={this.handleGoHome}
                                className="flex-1 py-3 bg-elevated border border-border text-main rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-card transition-colors">
                                <Home size={14} /> Dashboard
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
