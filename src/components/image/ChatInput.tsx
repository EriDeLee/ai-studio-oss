import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Paperclip, X, Sparkles, Image as ImageIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { readFileAsBase64 } from '../../lib/utils';

interface ChatInputProps {
  onSend: (content: string, attachments?: string[]) => void;
  isLoading: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxAttachments?: number;
}

const DEFAULT_MAX_ATTACHMENTS = 4;
const MAX_FILE_SIZE_MB = 10;

export function ChatInput({
  onSend,
  isLoading,
  disabled,
  placeholder = '描述你想要生成的图像，或上传图片作为参考...',
  maxAttachments = DEFAULT_MAX_ATTACHMENTS,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAttachments((prev) => (
      prev.length > maxAttachments ? prev.slice(0, maxAttachments) : prev
    ));
  }, [maxAttachments]);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const remainingSlots = maxAttachments - attachments.length;
      if (remainingSlots <= 0) return;

      const filesToProcess = Array.from(files).slice(0, remainingSlots);

      for (const file of filesToProcess) {
        if (!file.type.startsWith('image/')) continue;
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) continue;

        try {
          const base64 = await readFileAsBase64(file);
          setAttachments((prev) => [...prev, base64]);
        } catch {
          console.error('Failed to read file');
        }
      }
    },
    [attachments.length, maxAttachments]
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
  }, []);

  const handleSend = useCallback(() => {
    if (
      (!text.trim() && attachments.length === 0) ||
      isLoading ||
      disabled
    )
      return;
    onSend(text, attachments.length > 0 ? attachments : undefined);
    setText('');
    setAttachments([]);
  }, [text, attachments, isLoading, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const canSend =
    (text.trim().length > 0 || attachments.length > 0) &&
    !isLoading &&
    !disabled;

  return (
    <div
      className={cn(
        'border-t border-gray-100 bg-white/85 px-2 py-3 transition-colors duration-200 sm:p-6',
        'backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/85',
        isDragging && 'bg-primary-50/70 dark:bg-primary-950/25'
      )}
      style={{ paddingBottom: 'calc(1rem + var(--safe-area-inset-bottom))' }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div className="w-full max-w-4xl mx-auto">
        <div
          className={cn(
            'relative overflow-hidden rounded-3xl border p-2.5 sm:p-3 transition-all duration-200',
            'bg-gradient-to-br from-white via-gray-50 to-white',
            'dark:from-gray-900 dark:via-gray-900 dark:to-gray-800',
            'border-gray-200/80 dark:border-gray-700/80',
            'shadow-[0_8px_30px_rgba(0,0,0,0.06)]',
            'focus-within:border-primary-300 dark:focus-within:border-primary-600',
            'focus-within:shadow-[0_10px_35px_rgba(168,85,247,0.2)]'
          )}
        >
          <div className="pointer-events-none absolute -top-16 -right-16 h-36 w-36 rounded-full bg-primary-400/15 blur-2xl" />
          <div className="pointer-events-none absolute -left-20 bottom-0 h-32 w-32 rounded-full bg-blue-400/10 blur-2xl" />

          <div className="mb-3 px-0.5 sm:px-1 flex items-center justify-between">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700 dark:bg-primary-950/50 dark:text-primary-300">
              <Sparkles className="w-3.5 h-3.5" />
              AI 图像创作
            </div>
            <div className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">
              参考图 {attachments.length}/{maxAttachments}
            </div>
          </div>

          {attachments.length > 0 && (
            <div className="mb-3 flex gap-2.5 sm:gap-3 px-0.5 sm:px-1 pb-1 overflow-x-auto">
              {attachments.map((img, index) => (
                <div
                  key={index}
                  className="relative flex-shrink-0 w-20 h-20 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-sm group"
                >
                  <img
                    src={img}
                    alt={`附件 ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeAttachment(index)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center bg-black/55 hover:bg-red-500 text-white rounded-full transition-opacity opacity-0 group-hover:opacity-100"
                    aria-label={`删除附件 ${index + 1}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mb-3 rounded-2xl border border-gray-200/80 bg-white/80 px-3.5 sm:px-4 py-3 transition-colors focus-within:border-primary-300 dark:border-gray-700 dark:bg-gray-900/70 dark:focus-within:border-primary-700">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={2}
              className={cn(
                'w-full max-h-40 overflow-y-auto resize-none bg-transparent',
                'text-gray-900 dark:text-gray-100 text-base leading-relaxed',
                'placeholder:text-gray-400 dark:placeholder:text-gray-500',
                'focus:outline-none'
              )}
              style={{ minHeight: '48px' }}
            />
          </div>

          <div className="flex items-center justify-between gap-2.5 sm:gap-3 px-0.5 sm:px-1 pb-0.5 sm:pb-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={attachments.length >= maxAttachments || isLoading}
              className={cn(
                'relative inline-flex h-10 w-10 sm:w-auto items-center justify-center sm:justify-start gap-2 rounded-xl border px-0 sm:px-3 text-sm font-medium',
                'border-gray-200 bg-white text-gray-600 transition-all',
                'hover:border-primary-300 hover:text-primary-700',
                'dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300',
                'dark:hover:border-primary-700 dark:hover:text-primary-300',
                'disabled:opacity-40 disabled:cursor-not-allowed'
              )}
              aria-label="上传图片"
            >
              <Paperclip className="w-4.5 h-4.5" />
              <span className="hidden sm:inline">添加图片</span>
              {attachments.length > 0 && (
                <span className="absolute -top-1 -right-1 sm:static inline-flex h-5 min-w-5 px-1 items-center justify-center text-[10px] font-semibold bg-primary-500 text-white rounded-full">
                  {attachments.length}
                </span>
              )}
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

            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-xs text-gray-500 dark:text-gray-400">
                Enter 发送，Shift+Enter 换行
              </span>
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                className={cn(
                  'inline-flex h-11 min-w-11 px-3 sm:px-4 items-center justify-center rounded-xl transition-all duration-200',
                  canSend
                    ? 'bg-primary-600 hover:bg-primary-700 hover:-translate-y-0.5 text-white shadow-md shadow-primary-500/30'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                )}
                aria-label="发送"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <span className="inline-flex items-center gap-1 sm:gap-1.5 text-sm font-semibold">
                    <ImageIcon className="hidden sm:inline w-4.5 h-4.5" />
                    <span className="hidden sm:inline">生成</span>
                    <Send className="w-4.5 h-4.5" />
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
