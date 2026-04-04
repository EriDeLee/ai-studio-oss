import type { ComponentType } from 'react';

/**
 * Props for the advanced settings panel
 */
export interface AdvancedSettingsProps {
  /** Random seed for reproducible generation */
  seed?: number;
  onSeedChange?: (seed: number | undefined) => void;
}

/**
 * Advanced Settings Panel - collapsed by default
 */
export function AdvancedSettings({ seed, onSeedChange }: AdvancedSettingsProps) {
  if (!onSeedChange) return null;

  return (
    <details className="group rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 select-none list-none flex items-center justify-between">
        <span>高级设置</span>
        <span className="transition-transform group-open:rotate-180">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </summary>
      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            随机种子
          </label>
          <input
            type="number"
            value={seed ?? ''}
            onChange={(e) => onSeedChange(e.target.value ? parseInt(e.target.value) : undefined)}
            placeholder="留空表示随机"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>
    </details>
  );
}

/**
 * Error display component
 */
export function ErrorMessage({ error }: { error: string }) {
  return (
    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
      <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
    </div>
  );
}

/**
 * Output panel placeholder
 */
export function OutputPlaceholder({ title }: { title?: string }) {
  return (
    <div className="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500">
      <p>{title || '生成的图像将显示在这里'}</p>
    </div>
  );
}

/**
 * Loading display component
 */
export function GenerationLoading({ LoadingSpinner }: { LoadingSpinner: ComponentType<{ size?: string }> }) {
  return (
    <div className="flex items-center justify-center h-64">
      <LoadingSpinner size="lg" />
    </div>
  );
}
