import React from 'react';
import { ShieldAlert, RefreshCw, Home } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an exception:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-luxury-ivory-50 dark:bg-luxury-charcoal-900 px-4 py-12 transition-colors duration-500 relative overflow-hidden">
          {/* Decorative glows */}
          <div className="absolute top-0 right-0 w-[40%] h-[40%] rounded-full bg-luxury-gold-200/10 dark:bg-luxury-gold-950/15 blur-[120px] pointer-events-none" />
          <div className="absolute bottom-10 left-10 w-[30%] h-[30%] rounded-full bg-luxury-gold-250/10 dark:bg-luxury-gold-900/10 blur-[100px] pointer-events-none" />

          <div className="max-w-2xl w-full p-8 md:p-10 rounded-3xl border border-red-500/30 dark:border-red-500/20 bg-white/70 dark:bg-luxury-charcoal-850/50 backdrop-blur-md shadow-premium-light dark:shadow-premium-dark space-y-6 z-10 animate-fade-in">
            <div className="flex gap-5 items-start">
              <div className="p-4 rounded-2xl flex-shrink-0 flex items-center justify-center bg-red-500/10 dark:bg-red-500/20 text-red-500">
                <ShieldAlert className="h-8 w-8 animate-pulse" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400 border border-red-200 dark:border-red-900/50">
                    Application Crash Exception
                  </span>
                  <span className="text-[10px] text-luxury-charcoal-450 dark:text-luxury-charcoal-400 font-mono uppercase tracking-wider">
                    STATUS: HALTED
                  </span>
                </div>
                <h3 className="font-serif text-2xl text-luxury-charcoal-900 dark:text-white font-medium">
                  AURA Interface Stopped Unexpectedly
                </h3>
                <p className="text-xs text-luxury-charcoal-550 dark:text-luxury-charcoal-350 leading-relaxed font-light">
                  The client-side interface encountered an unrecoverable runtime exception. Telemetry logging has captured the event. You can try refreshing the page or navigating back to the home page.
                </p>
              </div>
            </div>

            {/* Error Message Details */}
            {this.state.error && (
              <div className="p-5 rounded-xl bg-red-50/50 dark:bg-red-950/10 border border-red-200/50 dark:border-red-900/30 text-xs font-mono text-red-700 dark:text-red-400 space-y-2">
                <p className="font-bold">Error: {this.state.error.message || String(this.state.error)}</p>
                {this.state.errorInfo && (
                  <details className="mt-2 cursor-pointer outline-none">
                    <summary className="text-[10px] uppercase font-bold tracking-wider text-red-650 dark:text-red-500 select-none">
                      Inspect Stack Trace
                    </summary>
                    <pre className="mt-2 overflow-x-auto text-[10px] leading-relaxed max-h-48 p-3 rounded-lg bg-black/5 dark:bg-black/40 text-left whitespace-pre-wrap select-text border border-red-200/20 dark:border-red-900/10">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {/* Control Actions */}
            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <button
                onClick={this.handleReset}
                className="flex-1 py-3.5 px-6 rounded-xl text-xs font-semibold uppercase tracking-wider bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-500 text-white transition-all duration-300 shadow-md flex items-center justify-center gap-2"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Reload Application</span>
              </button>
              <button
                onClick={this.handleGoHome}
                className="flex-1 py-3.5 px-6 rounded-xl text-xs font-semibold uppercase tracking-wider bg-white dark:bg-luxury-charcoal-900 hover:bg-luxury-ivory-100 dark:hover:bg-luxury-charcoal-800 text-luxury-charcoal-800 dark:text-luxury-ivory-300 border border-luxury-ivory-200 dark:border-luxury-charcoal-700 transition-all duration-300 flex items-center justify-center gap-2"
              >
                <Home className="h-3.5 w-3.5" />
                <span>Return to Landing Page</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
