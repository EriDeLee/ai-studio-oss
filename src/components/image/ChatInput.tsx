import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Send, Paperclip, X } from 'lucide-react';
import { cn, readFileAsBase64 } from '../../lib/utils';

interface ChatInputProps {
  onSend: (content: string, attachments?: string[]) => void;
  isLoading: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxAttachments?: number;
  initialContent?: string;
  initialAttachments?: string[];
}

const DEFAULT_MAX_ATTACHMENTS = 4;
const MAX_FILE_SIZE_MB = 10;
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
};

const extractDataUrlMimeType = (value: string): string | null => {
  const match = value.match(/^data:([^;]+);base64,/i);
  return match?.[1]?.toLowerCase() ?? null;
};

const inferImageMimeTypeFromName = (fileName: string): string | null => {
  const ext = fileName.trim().toLowerCase().split('.').pop();
  if (!ext) return null;
  return IMAGE_MIME_BY_EXTENSION[ext] ?? null;
};

const normalizeImageDataUrl = (dataUrl: string, file: File): string | null => {
  const rawMimeType = extractDataUrlMimeType(dataUrl);
  const fileMimeType = file.type.trim().toLowerCase();
  const inferredMimeType = inferImageMimeTypeFromName(file.name);

  const normalizedMimeType = rawMimeType?.startsWith('image/')
    ? rawMimeType
    : fileMimeType.startsWith('image/')
      ? fileMimeType
      : inferredMimeType;

  if (!normalizedMimeType) return null;
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) return null;
  return `data:${normalizedMimeType};base64,${dataUrl.slice(commaIndex + 1)}`;
};

const isLikelyImageFile = (file: File): boolean => {
  if (file.type.trim().toLowerCase().startsWith('image/')) return true;
  return Boolean(inferImageMimeTypeFromName(file.name));
};

export function ChatInput({
  onSend,
  isLoading,
  disabled,
  placeholder = '输入提示词，按 Enter 发送，Shift+Enter 换行…',
  maxAttachments = DEFAULT_MAX_ATTACHMENTS,
  initialContent,
  initialAttachments,
}: ChatInputProps) {
  const [text, setText] = useState(initialContent ?? '');
  const [attachments, setAttachments] = useState<string[]>(initialAttachments ?? []);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [previewAttachmentIndex, setPreviewAttachmentIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsCountRef = useRef(attachments.length);
  const previewDialogRef = useRef<HTMLDivElement>(null);
  const previewCloseButtonRef = useRef<HTMLButtonElement>(null);

  const visibleAttachments = attachments.slice(0, maxAttachments);
  const visibleAttachmentItems = useMemo(() => {
    const attachmentCountByValue = new Map<string, number>();

    return visibleAttachments.map((img, index) => {
      const nextCount = (attachmentCountByValue.get(img) ?? 0) + 1;
      attachmentCountByValue.set(img, nextCount);

      return {
        img,
        index,
        key: `${img.slice(0, 24)}-${img.length}-${nextCount}`,
      };
    });
  }, [visibleAttachments]);
  const uploadErrorItems = useMemo(() => {
    const errorCountByText = new Map<string, number>();

    return uploadErrors.map((error) => {
      const nextCount = (errorCountByText.get(error) ?? 0) + 1;
      errorCountByText.set(error, nextCount);

      return {
        error,
        key: `${error}-${nextCount}`,
      };
    });
  }, [uploadErrors]);
  const previewAttachment = previewAttachmentIndex !== null &&
    previewAttachmentIndex >= 0 &&
    previewAttachmentIndex < visibleAttachments.length
    ? visibleAttachments[previewAttachmentIndex]
    : null;

  useEffect(() => {
    attachmentsCountRef.current = attachments.length;
  }, [attachments.length]);

  useEffect(() => {
    if (!previewAttachment) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => {
      previewCloseButtonRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = originalOverflow;
    };
  }, [previewAttachment]);

  useEffect(() => {
    if (!previewAttachment) return;

    const handlePreviewKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPreviewAttachmentIndex(null);
        return;
      }

      if (event.key !== 'Tab') return;

      const dialog = previewDialogRef.current;
      if (!dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      );

      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inDialog = active ? dialog.contains(active) : false;

      if (event.shiftKey) {
        if (!inDialog || active === first) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (!inDialog || active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handlePreviewKeyDown);
    return () => window.removeEventListener('keydown', handlePreviewKeyDown);
  }, [previewAttachment]);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const filesToProcess = Array.from(files);
      const nextAttachments: string[] = [];
      const maxFileSizeBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
      let remainingSlots = Math.max(maxAttachments - attachmentsCountRef.current, 0);
      let invalidTypeCount = 0;
      let oversizeCount = 0;
      let readFailedCount = 0;
      let unsupportedDataCount = 0;
      let overLimitCount = 0;

      if (filesToProcess.length === 0) {
        setUploadErrors(['未选择任何图片文件。']);
        return;
      }

      for (const file of filesToProcess) {
        if (!isLikelyImageFile(file)) {
          invalidTypeCount += 1;
          continue;
        }
        if (file.size > maxFileSizeBytes) {
          oversizeCount += 1;
          continue;
        }
        if (remainingSlots <= 0) {
          overLimitCount += 1;
          continue;
        }

        try {
          const base64 = await readFileAsBase64(file);
          const normalizedDataUrl = normalizeImageDataUrl(base64, file);
          if (!normalizedDataUrl) {
            unsupportedDataCount += 1;
            continue;
          }
          nextAttachments.push(normalizedDataUrl);
          remainingSlots -= 1;
        } catch {
          readFailedCount += 1;
        }
      }

      if (nextAttachments.length > 0) {
        setAttachments((prev) => [...prev, ...nextAttachments].slice(0, maxAttachments));
      }

      const nextErrors: string[] = [];
      if (invalidTypeCount > 0) {
        nextErrors.push(`${invalidTypeCount} 个文件不是支持的图片格式（仅支持常见图片类型）。`);
      }
      if (oversizeCount > 0) {
        nextErrors.push(`${oversizeCount} 个文件超过 ${MAX_FILE_SIZE_MB}MB 限制。`);
      }
      if (overLimitCount > 0) {
        nextErrors.push(`最多可上传 ${maxAttachments} 张图片，${overLimitCount} 个文件未添加。`);
      }
      if (unsupportedDataCount > 0) {
        nextErrors.push(`${unsupportedDataCount} 个文件解析失败（无法识别图片数据）。`);
      }
      if (readFailedCount > 0) {
        nextErrors.push(`${readFailedCount} 个文件读取失败，请重试。`);
      }

      setUploadErrors(nextErrors);
    },
    [maxAttachments]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        handleFiles(e.target.files);
        e.target.value = '';
      }
    },
    [handleFiles]
  );

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
    setUploadErrors([]);
  }, []);

  const handleSend = useCallback(() => {
    if ((!text.trim() && visibleAttachments.length === 0) || isLoading || disabled) {
      return;
    }
    onSend(text, visibleAttachments.length > 0 ? visibleAttachments : undefined);
    setText('');
    setAttachments([]);
    setUploadErrors([]);
    setPreviewAttachmentIndex(null);
  }, [visibleAttachments, disabled, isLoading, onSend, text]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        const isComposing = e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229;
        if (isComposing) {
          return;
        }
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const canSend = (text.trim().length > 0 || visibleAttachments.length > 0) && !isLoading && !disabled;

  return (
    <div
      className={cn(
        'border-t border-black/10 bg-[var(--panel)] p-2.5 sm:p-4 dark:border-white/10',
        isDragging && 'bg-primary-500/10'
      )}
      style={{ paddingBottom: 'calc(0.875rem + var(--safe-area-inset-bottom))' }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div className="mx-auto w-full max-w-5xl">
        <div className="rounded-2xl border border-black/10 bg-gradient-to-b from-black/[0.02] to-black/[0.04] p-2.5 dark:border-white/10 dark:from-white/[0.03] dark:to-white/[0.05] transition-all duration-300 focus-within:border-primary-400/50 focus-within:shadow-lg focus-within:shadow-primary-500/10 focus-within:ring-1 focus-within:ring-primary-400/20">
          {visibleAttachments.length > 0 && (
            <div className="mb-2.5 flex gap-2 overflow-x-auto pb-1">
              {visibleAttachmentItems.map(({ img, index, key }) => (
                <div
                  key={key}
                  className="group relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-black/10 dark:border-white/10 ring-2 ring-transparent transition-all duration-300 ease-out hover:ring-primary-400/50 hover:scale-105 hover:shadow-lg hover:shadow-primary-500/20"
                >
                  <button
                    type="button"
                    onClick={() => setPreviewAttachmentIndex(index)}
                    className="block h-full w-full"
                    aria-label={`预览附件 ${index + 1}`}
                  >
                    <img src={img} alt={`附件 ${index + 1}`} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeAttachment(index);
                    }}
                    className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-lg ring-2 ring-white/80 opacity-100 scale-100 transition-all duration-200 ease-out [@media(any-hover:hover)]:opacity-0 [@media(any-hover:hover)]:scale-75 [@media(any-hover:hover)]:group-hover:opacity-100 [@media(any-hover:hover)]:group-hover:scale-100 group-focus-within:opacity-100 group-focus-within:scale-100 hover:bg-red-600 hover:scale-110 active:scale-90 focus-visible:opacity-100 focus-visible:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 dark:ring-black/40"
                    aria-label={`删除附件 ${index + 1}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {visibleAttachments.length > 0 && (
            <p className="mb-2 text-xs text-[var(--text-3)]">点击缩略图可预览原图。</p>
          )}

          {uploadErrorItems.length > 0 && (
            <div className="mb-2.5 rounded-xl border border-red-400/50 bg-red-500/10 px-3 py-2">
              {uploadErrorItems.map(({ error, key }) => (
                <p key={key} className="text-xs text-red-700 dark:text-red-300">
                  {error}
                </p>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-black/10 bg-[var(--panel)] px-3 py-2.5 dark:border-white/10">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={2}
              className="max-h-44 min-h-[3rem] w-full resize-none overflow-y-auto bg-transparent text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none"
            />
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={visibleAttachments.length >= maxAttachments || isLoading}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/10 bg-[var(--panel)] px-3 text-sm text-[var(--text-2)] transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/10 dark:hover:bg-white/10"
              aria-label="上传图片"
            >
              <Paperclip className="h-4 w-4" />
              <span className="hidden sm:inline">添加图片</span>
              <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[11px] dark:bg-white/10">
                {visibleAttachments.length}/{maxAttachments}
              </span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              aria-label="上传图片"
            />

            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className={cn(
                'flex items-center justify-center',
                'w-12 h-12 rounded-xl transition-all duration-200',
                canSend
                  ? 'bg-primary-600 hover:bg-primary-700 text-white shadow-lg hover:shadow-xl'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              )}
              aria-label="发送"
            >
              {isLoading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {previewAttachment && (
        <div
          ref={previewDialogRef}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="附件预览"
          tabIndex={-1}
        >
          <div
            className="absolute inset-0 bg-black/80"
            onClick={() => setPreviewAttachmentIndex(null)}
            aria-hidden="true"
          />
          <div className="relative z-10 max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-white/25 bg-black/30 p-2 backdrop-blur">
            <button
              ref={previewCloseButtonRef}
              type="button"
              onClick={() => setPreviewAttachmentIndex(null)}
              className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white ring-1 ring-white/50 transition-colors hover:bg-black/85"
              aria-label="关闭附件预览"
            >
              <X className="h-4 w-4" />
            </button>
            <img src={previewAttachment} alt="附件预览" className="max-h-[80vh] w-full object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
