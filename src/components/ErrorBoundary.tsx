import React from 'react';

type Props = {
  children: React.ReactNode;
  fallbackTitle?: string;
};

type State = {
  hasError: boolean;
  error?: Error | null;
  errorInfo?: React.ErrorInfo | null;
};

export default class ErrorBoundary extends React.Component<Props, State> {
  static defaultProps = {
    fallbackTitle: 'Something went wrong',
  };

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Minimal diagnostic logging
    console.error('[SMOKE] ErrorBoundary caught error', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  handleReload = () => {
    try {
      window.location.reload();
    } catch {
      // no-op
    }
  };

  handleCopy = async () => {
    const { error, errorInfo } = this.state;
    const text = [
      'Error:',
      error?.message ?? 'Unknown error',
      '',
      'Stack:',
      error?.stack ?? '(no stack)',
      '',
      'Component stack:',
      errorInfo?.componentStack ?? '(no component stack)',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      console.info('[SMOKE] Copied error to clipboard');
    } catch (err) {
      console.warn('[SMOKE] Failed to copy error', err);
    }
  };

  render() {
    if (this.state.hasError) {
      const title = this.props.fallbackTitle || 'Something went wrong';
      const { error, errorInfo } = this.state;
      return (
        <div className="m-3 rounded border border-red-200 bg-red-50 p-4 text-red-800">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{title}</h2>
            <div className="flex gap-2">
              <button
                onClick={this.handleReload}
                className="rounded border border-red-300 bg-white/70 px-3 py-1 text-sm hover:bg-white"
              >
                Reload
              </button>
              <button
                onClick={this.handleCopy}
                className="rounded border border-red-300 bg-white/70 px-3 py-1 text-sm hover:bg-white"
              >
                Copy error
              </button>
            </div>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm">Show error details</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words text-xs">
              {error?.message}
              {'\n\n'}
              {error?.stack}
              {'\n\n'}
              {errorInfo?.componentStack}
            </pre>
          </details>
        </div>
      );
    }

    return this.props.children as React.ReactElement;
  }
}