import { useState, useRef, useCallback } from 'react';
import { Send, Paperclip, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { readFileAsBase64 } from '../../lib/utils';

interface ChatInputProps {
  onSend: (content: string, attachments?: string[]) => void;
  isLoading: boolean;
  disabled?: boolean;
  placeholder?: string;
}

const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE_MB = 10;

export function ChatInput({
  onSend,
  isLoading,
  disabled,
  placeholder = '描述你想要生成的图像，或上传图片作为参考...',
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const remainingSlots = MAX_ATTACHMENTS - attachments.length;
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
    [attachments.length]
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
        'bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800',
        'p-4 sm:p-6 transition-colors duration-200',
        isDragging && 'bg-primary-50/50 dark:bg-primary-950/20'
      )}
      style={{ paddingBottom: 'calc(1rem + var(--safe-area-inset-bottom))' }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div className="max-w-4xl mx-auto">
        {/* Main card */}
        <div
          className={cn(
            'rounded-3xl border transition-all duration-200',
            'bg-gray-50 dark:bg-gray-800/50',
            'border-gray-200 dark:border-gray-700',
            'shadow-sm',
            'focus-within:border-primary-300 dark:focus-within:border-primary-600',
            'focus-within:shadow-md focus-within:shadow-primary-500/5'
          )}
        >
          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="flex gap-3 p-4 pb-0 overflow-x-auto">
              {attachments.map((img, index) => (
                <div
                  key={index}
                  className="relative flex-shrink-0 w-20 h-20 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-600 group"
                >
                  <img
                    src={img}
                    alt={`附件 ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeAttachment(index)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center bg-black/60 hover:bg-red-500 text-white rounded-full transition-colors"
                    aria-label={`删除附件 ${index + 1}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Text input area */}
          <div className="p-4">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={1}
              className={cn(
                'w-full resize-none bg-transparent',
                'text-gray-900 dark:text-gray-100 text-base leading-relaxed',
                'placeholder:text-gray-400 dark:placeholder:text-gray-500',
                'focus:outline-none',
                'max-h-40 overflow-y-auto'
              )}
              style={{ minHeight: '24px' }}
            />
          </div>

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-3 pb-3">
            {/* Left: Attachment button with badge */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={attachments.length >= MAX_ATTACHMENTS || isLoading}
              className={cn(
                'relative flex items-center justify-center',
                'w-10 h-10 rounded-xl transition-all duration-200',
                'text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400',
                'hover:bg-gray-100 dark:hover:bg-gray-700',
                'disabled:opacity-40 disabled:cursor-not-allowed'
              )}
              aria-label="上传图片"
            >
              <Paperclip className="w-5 h-5" />
              {attachments.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center text-[10px] font-medium bg-primary-500 text-white rounded-full">
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

            {/* Right: Send button */}
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className={cn(
                'flex items-center justify-center',
                'w-10 h-10 rounded-xl transition-all duration-200',
                canSend
                  ? 'bg-primary-600 hover:bg-primary-700 text-white shadow-md'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              )}
              aria-label="发送"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
