import { cn } from '../../lib/utils';

interface SliderProps {
  label: string;
  value?: number;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  showValue?: boolean;
  valueLabel?: string;
}

export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  showValue = true,
  valueLabel,
}: SliderProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
        {showValue && value !== undefined && (
          <span className="text-sm text-primary-600 dark:text-primary-400 font-mono font-semibold">
            {valueLabel || value}
          </span>
        )}
      </div>
      <div className="relative py-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value ?? min}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-2 rounded-lg cursor-pointer accent-primary-600"
        />
      </div>
      <div className="flex justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
