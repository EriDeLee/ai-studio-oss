import { X, Settings2 } from 'lucide-react';
import type { ImageChatSettings, ImageModel, SafetyFilterLevel, PersonGeneration, ImagePromptLanguage, ThinkingLevel, ResponseModality } from '../../types';
import { cn } from '../../lib/utils';

interface SettingsDrawerProps {
  settings: ImageChatSettings;
  onChange: (settings: ImageChatSettings) => void;
  open: boolean;
  onClose: () => void;
}

const MODEL_OPTIONS: { value: ImageModel; label: string; description: string }[] = [
  {
    value: 'gemini-3.1-flash-image-preview',
    label: 'Gemini 3.1 Flash Image',
    description: '快速生成，适合日常使用',
  },
  {
    value: 'gemini-3-pro-image-preview',
    label: 'Gemini 3 Pro Image',
    description: '高质量生成，适合复杂场景',
  },
];

const ASPECT_RATIO_OPTIONS = [
  { value: '1:1', label: '1:1 正方形' },
  { value: '1:4', label: '1:4 极竖' },
  { value: '1:8', label: '1:8 超竖' },
  { value: '2:3', label: '2:3 竖向' },
  { value: '3:2', label: '3:2 横向' },
  { value: '3:4', label: '3:4 竖向' },
  { value: '4:1', label: '4:1 极宽' },
  { value: '4:3', label: '4:3 标准' },
  { value: '4:5', label: '4:5 社交' },
  { value: '5:4', label: '5:4 横社交' },
  { value: '8:1', label: '8:1 超宽' },
  { value: '9:16', label: '9:16 竖屏' },
  { value: '16:9', label: '16:9 宽屏' },
  { value: '21:9', label: '21:9 超宽屏' },
];

const COUNT_OPTIONS = [
  { value: 1, label: '1 张' },
  { value: 2, label: '2 张' },
  { value: 4, label: '4 张' },
];

const SAFETY_FILTER_OPTIONS: { value: SafetyFilterLevel; label: string }[] = [
  { value: 'BLOCK_LOW_AND_ABOVE', label: '严格' },
  { value: 'BLOCK_MEDIUM_AND_ABOVE', label: '中等' },
  { value: 'BLOCK_ONLY_HIGH', label: '宽松' },
  { value: 'BLOCK_NONE', label: '关闭' },
];

const PERSON_GENERATION_OPTIONS: { value: PersonGeneration; label: string }[] = [
  { value: 'DONT_ALLOW', label: '不允许' },
  { value: 'ALLOW_ADULT', label: '仅成人' },
  { value: 'ALLOW_ALL', label: '允许所有' },
];

const LANGUAGE_OPTIONS: { value: ImagePromptLanguage; label: string }[] = [
  { value: 'auto', label: '自动' },
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'pt', label: 'Português' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'it', label: 'Italiano' },
  { value: 'ru', label: 'Русский' },
  { value: 'uk', label: 'Українська' },
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'ar', label: 'العربية' },
];

const THINKING_LEVEL_OPTIONS: { value: ThinkingLevel; label: string; description: string }[] = [
  { value: 'minimal', label: '最低', description: '延迟最短，默认选项' },
  { value: 'high', label: '高', description: '更多推理，适合复杂场景' },
];

const RESPONSE_MODALITY_OPTIONS: { value: ResponseModality; label: string; description: string }[] = [
  { value: 'text_image', label: '文本 + 图片', description: '同时返回文字说明和生成的图片' },
  { value: 'image', label: '仅图片', description: '只返回生成的图片，不返回文字说明' },
];

const IMAGE_SIZE_OPTIONS = [
  { value: '', label: '默认' },
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];

const FLASH_ONLY_SIZE_OPTIONS = [
  { value: '512', label: '512' },
];

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  options: { value: string | number; label: string }[];
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
          checked ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
}: {
  label: string;
  value?: number;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        {label}
      </label>
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </div>
  );
}

export function SettingsDrawer({ settings, onChange, open, onClose }: SettingsDrawerProps) {
  const update = <K extends keyof ImageChatSettings>(key: K, value: ImageChatSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  const updatePartial = (partial: Partial<ImageChatSettings>) => {
    onChange({ ...settings, ...partial });
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          'fixed top-0 right-0 h-full w-80 bg-white dark:bg-gray-800 shadow-xl z-50',
          'transform transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">生成设置</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="关闭设置"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Model Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                模型
              </label>
              <div className="space-y-2">
                {MODEL_OPTIONS.map((model) => (
                  <button
                    key={model.value}
                    type="button"
                    onClick={() => {
                      updatePartial({
                        model: model.value,
                        // 切换到非 Flash 模型时关闭图片搜索
                        ...(model.value !== 'gemini-3.1-flash-image-preview'
                          ? { enableImageSearch: false }
                          : {}),
                      });
                    }}
                    className={cn(
                      'w-full text-left p-3 rounded-lg border-2 transition-colors',
                      settings.model === model.value
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    )}
                  >
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {model.label}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {model.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700" />

            {/* Basic Settings */}
            <SelectField
              label="宽高比"
              value={settings.aspectRatio || '1:1'}
              onChange={(v) => update('aspectRatio', v)}
              options={ASPECT_RATIO_OPTIONS}
            />

            <SelectField
              label="生成数量"
              value={settings.numberOfImages || 1}
              onChange={(v) => update('numberOfImages', Number(v))}
              options={COUNT_OPTIONS}
            />

            <SelectField
              label="图像尺寸"
              value={settings.imageSize || ''}
              onChange={(v) => update('imageSize', v)}
              options={
                settings.model === 'gemini-3.1-flash-image-preview'
                  ? [IMAGE_SIZE_OPTIONS[0], ...FLASH_ONLY_SIZE_OPTIONS, ...IMAGE_SIZE_OPTIONS.slice(1)]
                  : IMAGE_SIZE_OPTIONS
              }
            />

            <div className="border-t border-gray-200 dark:border-gray-700" />

            {/* Advanced Settings */}
            <NumberField
              label="随机种子"
              value={settings.seed}
              onChange={(v) => update('seed', v)}
              placeholder="留空表示随机"
            />

            <NumberField
              label="提示词遵循度"
              value={settings.guidanceScale}
              onChange={(v) => update('guidanceScale', v)}
              min={1}
              max={10}
              step={0.5}
              placeholder="默认"
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                负面提示词
              </label>
              <textarea
                value={settings.negativePrompt || ''}
                onChange={(e) => update('negativePrompt', e.target.value)}
                placeholder="描述你不想看到的内容..."
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700" />

            <SelectField
              label="安全过滤"
              value={settings.safetyFilterLevel || ''}
              onChange={(v) => update('safetyFilterLevel', v as SafetyFilterLevel)}
              options={[{ value: '', label: '默认' }, ...SAFETY_FILTER_OPTIONS]}
            />

            <SelectField
              label="人物生成"
              value={settings.personGeneration || ''}
              onChange={(v) => update('personGeneration', v as PersonGeneration)}
              options={[{ value: '', label: '默认' }, ...PERSON_GENERATION_OPTIONS]}
            />

            <SelectField
              label="提示语言"
              value={settings.language || 'auto'}
              onChange={(v) => update('language', v as ImagePromptLanguage)}
              options={LANGUAGE_OPTIONS}
            />

            <div className="space-y-3">
              <ToggleField
                label="添加水印"
                checked={settings.addWatermark || false}
                onChange={(v) => update('addWatermark', v)}
              />
              <ToggleField
                label="提示词增强"
                checked={settings.enhancePrompt ?? true}
                onChange={(v) => update('enhancePrompt', v)}
              />
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700" />

            {/* Thinking / Reasoning Settings */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                思考级别
              </label>
              <div className="space-y-2">
                {THINKING_LEVEL_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => update('thinkingLevel', option.value)}
                    className={cn(
                      'w-full text-left p-3 rounded-lg border-2 transition-colors',
                      settings.thinkingLevel === option.value
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    )}
                  >
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {option.label}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {option.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <ToggleField
              label="显示思考过程"
              checked={settings.includeThoughts || false}
              onChange={(v) => update('includeThoughts', v)}
            />

            <div className="border-t border-gray-200 dark:border-gray-700" />

            {/* Response Modality */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                响应类型
              </label>
              <div className="space-y-2">
                {RESPONSE_MODALITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => update('responseModality', option.value)}
                    className={cn(
                      'w-full text-left p-3 rounded-lg border-2 transition-colors',
                      settings.responseModality === option.value
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    )}
                  >
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {option.label}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {option.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Google Search & Image Search */}
            <div className="space-y-3">
              <ToggleField
                label="Google 搜索（实时数据）"
                checked={settings.enableGoogleSearch ?? false}
                onChange={(v) => {
                  updatePartial({
                    enableGoogleSearch: v,
                    ...(!v ? { enableImageSearch: false } : {}),
                  });
                }}
              />
              {settings.enableGoogleSearch && settings.model === 'gemini-3.1-flash-image-preview' && (
                <ToggleField
                  label="Google 图片搜索"
                  checked={settings.enableImageSearch || false}
                  onChange={(v) => update('enableImageSearch', v)}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
