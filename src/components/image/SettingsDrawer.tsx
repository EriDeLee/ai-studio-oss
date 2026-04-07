import { useEffect, useMemo, useState } from 'react';
import { X, Settings2, RotateCcw, Bug } from 'lucide-react';
import type { ImageChatSettings, ThinkingLevel, ResponseModality } from '../../types';
import { cn } from '../../lib/utils';
import { DEV_LOG_EVENT_NAME, clearDevLogs, getDevLogs, type DevLogEntry } from '../../lib/devConsole';
import {
  DEFAULT_IMAGE_CHAT_SETTINGS,
  IMAGE_MODEL_OPTIONS,
  getAllowedAspectRatios,
  getAllowedImageSizes,
  getDefaultAspectRatio,
  getFixedThinkingLevel,
  getImageModelLabel,
  normalizeAspectRatioForModel,
  normalizeImageSizeForModel,
  normalizeSearchToolsForModel,
  supportsImageSearch,
  supportsThinkingConfig,
  supportsThinkingLevelParam,
} from '../../config/imageModelCapabilities';

interface SettingsDrawerProps {
  settings: ImageChatSettings;
  onChange: (settings: ImageChatSettings) => void;
  open: boolean;
  onClose: () => void;
}

const THINKING_LEVEL_OPTIONS: { value: ThinkingLevel; label: string }[] = [
  { value: 'minimal', label: 'MINIMAL' },
  { value: 'high', label: 'HIGH' },
];

const RESPONSE_MODALITY_OPTIONS: { value: ResponseModality; label: string }[] = [
  { value: 'text_image', label: 'TEXT + IMAGE' },
  { value: 'image', label: 'IMAGE ONLY' },
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
  const modelSupportsImageSearch = supportsImageSearch(settings.model);
  const modelSupportsThinkingConfig = supportsThinkingConfig(settings.model);
  const modelSupportsThinkingLevelParam = supportsThinkingLevelParam(settings.model);
  const modelFixedThinkingLevel = getFixedThinkingLevel(settings.model);
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

  const aspectRatioOptions = getAllowedAspectRatios(settings.model).map((value) => ({ value, label: value }));
  const aspectRatioValue = settings.aspectRatio || getDefaultAspectRatio(settings.model);
  const imageSizeOptions = getAllowedImageSizes(settings.model).map((value) => ({
    value,
    label: value || '默认',
  }));

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
                  onClick={() => onChange({ ...DEFAULT_IMAGE_CHAT_SETTINGS })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 px-2 py-1 text-xs text-[var(--text-2)] hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  恢复默认
                </button>
              </div>
              {IMAGE_MODEL_OPTIONS.map((model) => (
                <button
                  key={model.value}
                  type="button"
                  onClick={() => {
                    if (model.value === settings.model) return;
                    const normalizedTools = normalizeSearchToolsForModel(
                      model.value,
                      settings.enableGoogleSearch,
                      settings.enableImageSearch
                    );
                    updatePartial({
                      model: model.value,
                      aspectRatio:
                        normalizeAspectRatioForModel(model.value, settings.aspectRatio)
                        || getDefaultAspectRatio(model.value),
                      imageSize: normalizeImageSizeForModel(model.value, settings.imageSize),
                      enableGoogleSearch: normalizedTools.enableGoogleSearch,
                      enableImageSearch: normalizedTools.enableImageSearch,
                    });
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

            <section className="space-y-3 rounded-2xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-3)]">画幅与尺寸</p>
                <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] text-[var(--text-3)] dark:bg-white/10">
                  image
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5">
                  <span className="text-xs text-[var(--text-3)]">宽高比</span>
                  <select
                    value={aspectRatioValue}
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
                  <span className="text-xs text-[var(--text-3)]">图片尺寸</span>
                  <select
                    value={settings.imageSize}
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
              </div>
            </section>

            <section className="space-y-3 rounded-2xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-3)]">推理与输出</p>
                <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] text-[var(--text-3)] dark:bg-white/10">
                  runtime
                </span>
              </div>
              {modelSupportsThinkingConfig && !modelFixedThinkingLevel && modelSupportsThinkingLevelParam && (
                <label className="space-y-1.5">
                  <span className="text-xs text-[var(--text-3)]">思考级别</span>
                  <select
                    value={settings.thinkingLevel}
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
              )}
              {modelSupportsThinkingConfig && modelFixedThinkingLevel && (
                <p className="rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  当前模型 {getImageModelLabel(settings.model)} 的思考级别固定为
                  {' '}
                  {modelFixedThinkingLevel.toUpperCase()}，不支持调整。
                </p>
              )}
              <label className="space-y-1.5">
                <span className="text-xs text-[var(--text-3)]">响应模态</span>
                <select
                  value={settings.responseModality}
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
                checked={settings.enableGoogleSearch}
                onChange={(value) => {
                  const normalizedTools = normalizeSearchToolsForModel(
                    settings.model,
                    value,
                    settings.enableImageSearch
                  );
                  updatePartial({
                    enableGoogleSearch: normalizedTools.enableGoogleSearch,
                    enableImageSearch: normalizedTools.enableImageSearch,
                  });
                }}
              />
              <Switch
                label="Google Image Search"
                checked={settings.enableImageSearch}
                disabled={!settings.enableGoogleSearch || !modelSupportsImageSearch}
                onChange={(value) => {
                  const normalizedTools = normalizeSearchToolsForModel(
                    settings.model,
                    settings.enableGoogleSearch,
                    value
                  );
                  update('enableImageSearch', normalizedTools.enableImageSearch);
                }}
              />
              {!modelSupportsImageSearch && (
                <p className="rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  当前模型 {getImageModelLabel(settings.model)} 不支持 Google Image Search，已禁用该开关。
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
