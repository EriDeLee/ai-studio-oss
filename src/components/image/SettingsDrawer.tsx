import { useEffect, useMemo, useState } from 'react';
import { X, Settings2, RotateCcw, Bug } from 'lucide-react';
import type { ImageChatSettings, ImageModel, ThinkingLevel, ResponseModality } from '../../types';
import { cn } from '../../lib/utils';
import { DEV_LOG_EVENT_NAME, clearDevLogs, getDevLogs, type DevLogEntry } from '../../lib/devConsole';

interface SettingsDrawerProps {
  settings: ImageChatSettings;
  onChange: (settings: ImageChatSettings) => void;
  open: boolean;
  onClose: () => void;
  onReset?: () => void;
}

const DEFAULT_CHAT_SETTINGS: ImageChatSettings = {
  model: 'gemini-3.1-flash-image-preview',
  aspectRatio: '1:1',
  numberOfImages: 1,
  thinkingLevel: 'minimal',
  includeThoughts: true,
  responseModality: 'text_image',
  enableGoogleSearch: false,
  enableImageSearch: false,
};

const MODEL_OPTIONS: { value: ImageModel; label: string; tag: string; description: string }[] = [
  {
    value: 'gemini-3.1-flash-image-preview',
    label: 'Gemini 3.1 Flash Image',
    tag: '速度优先',
    description: '更快响应，适合高频迭代。',
  },
  {
    value: 'gemini-3-pro-image-preview',
    label: 'Gemini 3 Pro Image',
    tag: '质量优先',
    description: '更强细节和构图能力，适合最终稿。',
  },
];

const FLASH_ASPECT_RATIO_OPTIONS = [
  { value: '1:1', label: '1:1' },
  { value: '1:4', label: '1:4' },
  { value: '1:8', label: '1:8' },
  { value: '2:3', label: '2:3' },
  { value: '3:2', label: '3:2' },
  { value: '3:4', label: '3:4' },
  { value: '4:1', label: '4:1' },
  { value: '4:3', label: '4:3' },
  { value: '4:5', label: '4:5' },
  { value: '5:4', label: '5:4' },
  { value: '8:1', label: '8:1' },
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: '21:9', label: '21:9' },
];

const PRO_ASPECT_RATIO_OPTIONS = [
  { value: '1:1', label: '1:1' },
  { value: '2:3', label: '2:3' },
  { value: '3:2', label: '3:2' },
  { value: '3:4', label: '3:4' },
  { value: '4:3', label: '4:3' },
  { value: '4:5', label: '4:5' },
  { value: '5:4', label: '5:4' },
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: '21:9', label: '21:9' },
];

const COUNT_OPTIONS = [1, 2, 4];

const THINKING_LEVEL_OPTIONS: { value: ThinkingLevel; label: string }[] = [
  { value: 'minimal', label: 'LOW (默认)' },
  { value: 'high', label: 'HIGH' },
];

const RESPONSE_MODALITY_OPTIONS: { value: ResponseModality; label: string }[] = [
  { value: 'text_image', label: 'TEXT + IMAGE' },
  { value: 'image', label: 'IMAGE ONLY' },
];

const FLASH_IMAGE_SIZE_OPTIONS = [
  { value: '', label: '默认' },
  { value: '512', label: '512' },
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];

const PRO_IMAGE_SIZE_OPTIONS = [
  { value: '', label: '默认' },
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];

function Switch({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left',
        disabled ? 'opacity-50' : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.03]'
      )}
    >
      <span className="text-sm text-[var(--text-2)]">{label}</span>
      <span
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
          checked ? 'bg-primary-500' : 'bg-neutral-300 dark:bg-neutral-700'
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 rounded-full bg-white transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </span>
    </button>
  );
}

export function SettingsDrawer({ settings, onChange, open, onClose }: SettingsDrawerProps) {
  const isFlashModel = settings.model === 'gemini-3.1-flash-image-preview';
  const isProModel = settings.model === 'gemini-3-pro-image-preview';
  const [devLogs, setDevLogs] = useState<DevLogEntry[]>(() => getDevLogs());

  useEffect(() => {
    const handler = () => setDevLogs(getDevLogs());
    window.addEventListener(DEV_LOG_EVENT_NAME, handler as EventListener);
    return () => window.removeEventListener(DEV_LOG_EVENT_NAME, handler as EventListener);
  }, []);

  const terminalText = useMemo(
    () =>
      devLogs
        .slice(-120)
        .map((log) => {
          const timestamp = new Date(log.ts).toLocaleTimeString('zh-CN', { hour12: false });
          const payload = log.data === undefined ? '' : ` ${JSON.stringify(log.data)}`;
          return `[${timestamp}] [${log.level}] [${log.scope}] ${log.message}${payload}`;
        })
        .join('\n'),
    [devLogs]
  );

  const update = <K extends keyof ImageChatSettings>(key: K, value: ImageChatSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };
  const updatePartial = (partial: Partial<ImageChatSettings>) => {
    onChange({ ...settings, ...partial });
  };

  const aspectRatioOptions = isFlashModel ? FLASH_ASPECT_RATIO_OPTIONS : PRO_ASPECT_RATIO_OPTIONS;
  const imageSizeOptions = isFlashModel ? FLASH_IMAGE_SIZE_OPTIONS : PRO_IMAGE_SIZE_OPTIONS;

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm" onClick={onClose} />}

      <aside
        className={cn(
          'fixed right-0 top-0 z-50 h-full w-[min(100vw,420px)] border-l border-black/10 bg-[var(--panel)] shadow-2xl transition-transform duration-300 dark:border-white/10',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between border-b border-black/10 px-5 py-4 dark:border-white/10">
            <div className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary-500" />
              <h2 className="text-base font-semibold">生成设置</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-[var(--text-2)] transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              aria-label="关闭设置"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-3)]">模型</p>
                <button
                  type="button"
                  onClick={() => onChange(DEFAULT_CHAT_SETTINGS)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 px-2 py-1 text-xs text-[var(--text-2)] hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  恢复默认
                </button>
              </div>
              {MODEL_OPTIONS.map((model) => (
                <button
                  key={model.value}
                  type="button"
                  onClick={() => {
                    if (model.value === settings.model) return;
                    const next: Partial<ImageChatSettings> = { model: model.value };
                    if (model.value === 'gemini-3-pro-image-preview') {
                      if (settings.imageSize === '512') next.imageSize = '';
                      next.enableImageSearch = false;
                    }
                    updatePartial(next);
                  }}
                  className={cn(
                    'w-full rounded-2xl border p-3 text-left transition-all',
                    settings.model === model.value
                      ? 'border-primary-500 bg-primary-50/70 shadow-sm dark:bg-primary-900/20'
                      : 'border-black/10 bg-black/[0.02] hover:border-black/20 dark:border-white/10 dark:bg-white/[0.03]'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">{model.label}</div>
                    <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] text-[var(--text-3)] dark:bg-white/10">
                      {model.tag}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-3)]">{model.description}</div>
                </button>
              ))}
            </section>

            <section className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="text-xs text-[var(--text-3)]">宽高比</span>
                <select
                  value={settings.aspectRatio ?? '1:1'}
                  onChange={(e) => update('aspectRatio', e.target.value)}
                  className="input-base"
                >
                  {aspectRatioOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-xs text-[var(--text-3)]">数量</span>
                <select
                  value={settings.numberOfImages ?? 1}
                  onChange={(e) => update('numberOfImages', Number(e.target.value))}
                  className="input-base"
                >
                  {COUNT_OPTIONS.map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-xs text-[var(--text-3)]">图片尺寸</span>
                <select
                  value={settings.imageSize ?? ''}
                  onChange={(e) => update('imageSize', e.target.value)}
                  className="input-base"
                >
                  {imageSizeOptions.map((opt) => (
                    <option key={opt.value || 'default'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-xs text-[var(--text-3)]">种子</span>
                <input
                  type="number"
                  value={settings.seed ?? ''}
                  onChange={(e) => update('seed', e.target.value ? Number(e.target.value) : undefined)}
                  className="input-base"
                  placeholder="留空随机"
                />
              </label>
            </section>

            <section className="space-y-4 rounded-2xl border border-primary-300/35 bg-gradient-to-br from-primary-50/70 to-transparent p-3 dark:border-primary-700/40 dark:from-primary-900/20">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-3)]">推理与输出</p>
                <span className="rounded-full bg-primary-500/12 px-2 py-0.5 text-[10px] text-primary-700 dark:text-primary-300">
                  runtime
                </span>
              </div>
              <div className="space-y-3 rounded-xl border border-black/10 bg-white/70 p-3 dark:border-white/10 dark:bg-black/10">
                <label className="space-y-1.5">
                  <span className="text-xs text-[var(--text-3)]">思考级别</span>
                  <select
                    value={settings.thinkingLevel ?? 'minimal'}
                    onChange={(e) => update('thinkingLevel', e.target.value as ThinkingLevel)}
                    className="input-base"
                  >
                    {THINKING_LEVEL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="space-y-2 rounded-xl border border-black/10 bg-white/70 p-3 dark:border-white/10 dark:bg-black/10">
                <p className="text-xs text-[var(--text-3)]">思考输出</p>
                <Switch
                  label="显示思考内容"
                  checked={settings.includeThoughts ?? true}
                  onChange={(value) => update('includeThoughts', value)}
                />
              </div>
              <label className="space-y-1.5">
                <span className="text-xs text-[var(--text-3)]">响应模态</span>
                <select
                  value={settings.responseModality ?? 'text_image'}
                  onChange={(e) => update('responseModality', e.target.value as ResponseModality)}
                  className="input-base"
                >
                  {RESPONSE_MODALITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="space-y-3 rounded-2xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-3)]">工具</p>
                <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] text-[var(--text-3)] dark:bg-white/10">
                  tools
                </span>
              </div>
              <Switch
                label="Google Search"
                checked={settings.enableGoogleSearch ?? false}
                onChange={(value) => {
                  updatePartial({
                    enableGoogleSearch: value,
                    enableImageSearch: value ? (settings.enableImageSearch ?? false) : false,
                  });
                }}
              />
              <Switch
                label="Google Image Search"
                checked={settings.enableImageSearch ?? false}
                disabled={!settings.enableGoogleSearch || isProModel}
                onChange={(value) => update('enableImageSearch', value)}
              />
              {isProModel && (
                <p className="text-[11px] text-[var(--text-3)]">
                  Gemini 3 Pro Image 不支持 Google Image Search。
                </p>
              )}
            </section>

            <section className="space-y-2 rounded-2xl border border-black/10 bg-zinc-950 p-3 text-zinc-100 dark:border-white/20">
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-300">
                  <Bug className="h-3.5 w-3.5" />
                  开发终端
                </div>
                <button
                  type="button"
                  onClick={() => {
                    clearDevLogs();
                    setDevLogs([]);
                  }}
                  className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
                >
                  清空
                </button>
              </div>
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-4 text-emerald-300">
                {terminalText || '等待日志...'}
              </pre>
            </section>
          </div>
        </div>
      </aside>
    </>
  );
}
