import { useState, useCallback, useMemo, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X, Images } from 'lucide-react';
import { ChatMessageList } from '../../../components/image/ChatMessageList';
import { ChatInput } from '../../../components/image/ChatInput';
import { ImagePreviewModal } from '../../../components/image/ImagePreviewModal';
import type { ChatAssistantMessage } from '../../../types';
import type { LayoutOutletContext } from '../../../pages/Layout';

interface SelectedImage {
  base64: string;
  mimeType: string;
}

export function ImageChat() {
  const { messages, isLoading, send } = useOutletContext<LayoutOutletContext>();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const conversationImages = useMemo(
    () =>
      messages
        .filter((message): message is ChatAssistantMessage => message.role === 'assistant')
        .flatMap((message) => message.images),
    [messages]
  );

  useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= conversationImages.length) {
      setSelectedIndex(null);
    }
    if (previewIndex !== null && previewIndex >= conversationImages.length) {
      setPreviewIndex(null);
    }
  }, [conversationImages.length, previewIndex, selectedIndex]);

  const handleSend = useCallback((content: string, attachments?: string[]) => {
    send(content, attachments);
  }, [send]);

  const handleImageSelect = useCallback((_image: SelectedImage, index: number) => {
    setSelectedIndex(index);
    setPreviewIndex(index);
  }, []);

  const selectedImage = selectedIndex !== null ? conversationImages[selectedIndex] : null;
  const previewImage = previewIndex !== null ? conversationImages[previewIndex] : null;

  const hasPrevious = selectedIndex !== null && selectedIndex > 0;
  const hasNext = selectedIndex !== null && selectedIndex < conversationImages.length - 1;
  const hasPreviewPrevious = previewIndex !== null && previewIndex > 0;
  const hasPreviewNext = previewIndex !== null && previewIndex < conversationImages.length - 1;

  const openPrevious = useCallback(() => {
    setSelectedIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
  }, []);

  const openNext = useCallback(() => {
    setSelectedIndex((prev) =>
      prev !== null && prev < conversationImages.length - 1 ? prev + 1 : prev
    );
  }, [conversationImages.length]);

  const openPreviewPrevious = useCallback(() => {
    setPreviewIndex((prev) => {
      if (prev === null || prev <= 0) return prev;
      const next = prev - 1;
      setSelectedIndex(next);
      return next;
    });
  }, []);

  const openPreviewNext = useCallback(() => {
    setPreviewIndex((prev) => {
      if (prev === null || prev >= conversationImages.length - 1) return prev;
      const next = prev + 1;
      setSelectedIndex(next);
      return next;
    });
  }, [conversationImages.length]);

  return (
    <div className="image-chat-grid">
      <section className="chat-main-panel">
        <ChatMessageList
          messages={messages}
          isLoading={isLoading}
          onImageSelect={handleImageSelect}
        />
        <ChatInput onSend={handleSend} isLoading={isLoading} maxAttachments={4} />
      </section>

      <aside className="hidden lg:flex chat-gallery-panel">
        <div className="flex items-center justify-between border-b border-black/10 px-3 py-2.5 dark:border-white/10">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-3)]">
            <Images className="h-3.5 w-3.5" />
            本次对话图库
          </div>
          <span className="text-xs text-[var(--text-3)]">{conversationImages.length} 张</span>
        </div>

        {selectedImage ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto p-3">
              <div className="overflow-hidden rounded-2xl border border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5">
                <img
                  src={`data:${selectedImage.mimeType};base64,${selectedImage.base64}`}
                  alt="预览图片"
                  className="h-auto w-full cursor-zoom-in object-contain"
                  onClick={() => setPreviewIndex(selectedIndex)}
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={openPrevious}
                  disabled={!hasPrevious}
                  className="inline-flex items-center justify-center gap-1 rounded-xl border border-black/10 px-3 py-2 text-xs text-[var(--text-2)] disabled:opacity-40 dark:border-white/10"
                >
                  <ChevronLeft className="h-4 w-4" /> 上一张
                </button>
                <button
                  type="button"
                  onClick={openNext}
                  disabled={!hasNext}
                  className="inline-flex items-center justify-center gap-1 rounded-xl border border-black/10 px-3 py-2 text-xs text-[var(--text-2)] disabled:opacity-40 dark:border-white/10"
                >
                  下一张 <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid max-h-44 grid-cols-4 gap-2 overflow-y-auto border-t border-black/10 p-3 dark:border-white/10">
              {conversationImages.map((image, index) => (
                <button
                  key={`${index}-${image.base64.slice(0, 16)}`}
                  type="button"
                  onClick={() => {
                    setSelectedIndex(index);
                    setPreviewIndex(index);
                  }}
                  className={`overflow-hidden rounded-lg border ${
                    selectedIndex === index
                      ? 'border-primary-500 ring-2 ring-primary-400/40'
                      : 'border-black/10 dark:border-white/10'
                  }`}
                >
                  <img
                    src={`data:${image.mimeType};base64,${image.base64}`}
                    alt={`历史图 ${index + 1}`}
                    className="h-16 w-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
            <button
              type="button"
              onClick={() => setSelectedIndex(0)}
              disabled={conversationImages.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-xs text-[var(--text-2)] disabled:opacity-40 dark:border-white/10"
            >
              <Images className="h-4 w-4" />
              打开第一张
            </button>
            <p className="text-xs text-[var(--text-3)]">点击聊天中的图片，或从图库打开。</p>
          </div>
        )}

        {selectedImage && (
          <button
            type="button"
            onClick={() => setSelectedIndex(null)}
            className="absolute right-3 top-10 rounded-lg bg-black/40 p-1.5 text-white hover:bg-black/60"
            aria-label="关闭预览"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </aside>

      {previewImage && (
        <ImagePreviewModal
          image={previewImage}
          currentIndex={previewIndex ?? 0}
          total={conversationImages.length}
          onPrevious={hasPreviewPrevious ? openPreviewPrevious : undefined}
          onNext={hasPreviewNext ? openPreviewNext : undefined}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </div>
  );
}
