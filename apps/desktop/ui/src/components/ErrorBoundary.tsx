import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Catches render crashes so staff see a recovery screen instead of a blank window.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error || 'Unknown error');
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Hello Darzi UI crash:', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-xl font-bold font-display">Something went wrong</h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            The screen hit an unexpected error. Your shop data is still on this computer.
            Reload the app to continue. If it keeps happening, WhatsApp support at{' '}
            <a
              className="text-sky-300 underline"
              href="https://wa.me/923163455358"
              target="_blank"
              rel="noreferrer"
            >
              +92 316 3455358
            </a>
            .
          </p>
          {this.state.message ? (
            <p className="text-[11px] font-mono text-slate-500 break-words">{this.state.message}</p>
          ) : null}
          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-white text-[#0a0a0a] text-sm font-semibold cursor-pointer"
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
