import { LoadingSpinner } from './LoadingSpinner';

export function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <LoadingSpinner size="lg" />
    </div>
  );
}
