import { LoadingSpinner } from './LoadingSpinner';

export function LoadingFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[var(--bg-1)]/80 backdrop-blur-sm">
      <LoadingSpinner size="lg" />
    </div>
  );
}
