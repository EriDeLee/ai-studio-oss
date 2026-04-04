import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.hash = '#/';
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            出现了一些问题
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md">
            {this.state.error?.message || '应用遇到了一个意外错误'}
          </p>
          <Button onClick={this.handleReset} variant="primary">
            <RefreshCw className="w-4 h-4 mr-2" />
            重新加载
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
