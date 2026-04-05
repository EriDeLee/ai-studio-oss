import { useState, useRef, useCallback } from 'react';
import { Send, Paperclip, X, Image as ImageIcon } from 'lucide-react';
import { cn, readFileAsBase64 } from '../../lib/utils';

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
  placeholder = '输入提示词，按 Enter 发送，Shift+Enter 换行…',
  maxAttachments = DEFAULT_MAX_ATTACHMENTS,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const visibleAttachments = attachments.slice(0, maxAttachments);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const filesToProcess = Array.from(files);

      for (const file of filesToProcess) {
        if (!file.type.startsWith('image/')) continue;
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) continue;

        try {
          const base64 = await readFileAsBase64(file);
          setAttachments((prev) => {
            if (prev.length >= maxAttachments) return prev;
            return [...prev, base64];
          });
        } catch {
          // ignore single file failure
        }
      }
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
  }, []);

  const handleSend = useCallback(() => {
    if ((!text.trim() && visibleAttachments.length === 0) || isLoading || disabled) {
      return;
    }
    onSend(text, visibleAttachments.length > 0 ? visibleAttachments : undefined);
    setText('');
    setAttachments([]);
  }, [visibleAttachments, disabled, isLoading, onSend, text]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
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
        <div className="rounded-2xl border border-black/10 bg-black/[0.02] p-2.5 dark:border-white/10 dark:bg-white/[0.03]">
          {visibleAttachments.length > 0 && (
            <div className="mb-2.5 flex gap-2 overflow-x-auto pb-1">
              {visibleAttachments.map((img, index) => (
                <div
                  key={index}
                  className="group relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-black/10 dark:border-white/10"
                >
                  <img src={img} alt={`附件 ${index + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeAttachment(index)}
                    className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label={`删除附件 ${index + 1}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
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
                'inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-medium transition-all',
                canSend
                  ? 'bg-primary-600 text-white hover:bg-primary-700'
                  : 'bg-black/10 text-[var(--text-3)] dark:bg-white/10'
              )}
              aria-label="发送"
            >
              {isLoading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>
                  <ImageIcon className="h-4 w-4" />
                  生成
                  <Send className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
