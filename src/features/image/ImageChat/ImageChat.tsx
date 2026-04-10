import { useState, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X, Images } from 'lucide-react';
import { ChatMessageList } from '../../../components/image/ChatMessageList';
import { ChatInput } from '../../../components/image/ChatInput';
import { ImagePreviewModal } from '../../../components/image/ImagePreviewModal';
import type { ChatAssistantMessage } from '../../../types';
import type { LayoutOutletContext } from '../../../pages/Layout';

interface EditState {
  sessionId: string;
  messageIndex: number;
  content: string;
  attachments: string[];
}

interface SelectedImage {
  base64: string;
  mimeType: string;
}

interface AttachmentPreviewState {
  sessionId: string;
  images: SelectedImage[];
}

const toValidIndex = (index: number | null, length: number): number | null => {
  if (index === null || index < 0 || index >= length) {
    return null;
  }
  return index;
};

const parseDataUrlImage = (value: string): SelectedImage | null => {
  const matched = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(value);
  if (!matched) return null;
  const mimeType = matched[1]?.trim().toLowerCase();
  const base64 = matched[2]?.trim();
  if (!mimeType?.startsWith('image/') || !base64) return null;
  return { mimeType, base64 };
};

const normalizeAttachmentsToImages = (attachments: string[]): SelectedImage[] => {
  return attachments
    .map((attachment) => parseDataUrlImage(attachment))
    .filter((image): image is SelectedImage => Boolean(image));
};

export function ImageChat() {
  const { messages, isLoading, send, retryFromMessage, getMessageForEdit, activeSessionId } = useOutletContext<LayoutOutletContext>();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [attachmentPreviewState, setAttachmentPreviewState] = useState<AttachmentPreviewState | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const activeEditState = editState?.sessionId === activeSessionId ? editState : null;

  const conversationImages = useMemo(
    () =>
      messages
        .filter((message): message is ChatAssistantMessage => message.role === 'assistant')
        .flatMap((message) => message.images),
    [messages]
  );

  const activePreviewImages = attachmentPreviewState?.sessionId === activeSessionId
    ? attachmentPreviewState.images
    : conversationImages;
  const safeSelectedIndex = toValidIndex(selectedIndex, activePreviewImages.length);
  const safePreviewIndex = toValidIndex(previewIndex, activePreviewImages.length);

  const handleSend = useCallback(
    (content: string, attachments?: string[]) => {
      if (activeEditState) {
        const isValidEditIndex = Number.isInteger(activeEditState.messageIndex)
          && activeEditState.messageIndex >= 0
          && activeEditState.messageIndex < messages.length;

        if (isValidEditIndex) {
          // Use explicit base history to avoid stale state race while editing.
          const baseMessages = messages.slice(0, activeEditState.messageIndex);
          setEditState(null);
          send(content, attachments, baseMessages);
          return;
        }
      }

      if (editState) {
        setEditState(null);
      }
      send(content, attachments);
    },
    [activeEditState, editState, messages, send]
  );

  const handleRetry = useCallback(
    (messageIndex: number) => {
      setEditState(null);
      retryFromMessage(messageIndex);
    },
    [retryFromMessage]
  );

  const handleEdit = useCallback(
    (messageIndex: number) => {
      const messageData = getMessageForEdit(messageIndex);
      if (messageData) {
        setEditState({
          sessionId: activeSessionId,
          messageIndex,
          content: messageData.content,
          attachments: messageData.attachments,
        });
      } else {
        setEditState(null);
      }
    },
    [activeSessionId, getMessageForEdit]
  );

  const handleImageSelect = useCallback((_image: SelectedImage, index: number) => {
    setAttachmentPreviewState(null);
    setSelectedIndex(index);
    setPreviewIndex(index);
  }, []);

  const handleUserAttachmentSelect = useCallback((attachments: string[], index: number) => {
    const images = normalizeAttachmentsToImages(attachments);
    if (images.length === 0) return;
    const safeIndex = Math.min(Math.max(index, 0), images.length - 1);
    setAttachmentPreviewState({
      sessionId: activeSessionId,
      images,
    });
    setSelectedIndex(safeIndex);
    setPreviewIndex(safeIndex);
  }, [activeSessionId]);

  const selectedImage = safeSelectedIndex !== null ? activePreviewImages[safeSelectedIndex] : null;
  const previewImage = safePreviewIndex !== null ? activePreviewImages[safePreviewIndex] : null;

  const hasPrevious = safeSelectedIndex !== null && safeSelectedIndex > 0;
  const hasNext = safeSelectedIndex !== null && safeSelectedIndex < activePreviewImages.length - 1;
  const hasPreviewPrevious = safePreviewIndex !== null && safePreviewIndex > 0;
  const hasPreviewNext = safePreviewIndex !== null && safePreviewIndex < activePreviewImages.length - 1;

  const openPrevious = useCallback(() => {
    setSelectedIndex((prev) => {
      if (prev === null) return prev;
      return Math.max(prev - 1, 0);
    });
  }, []);

  const openNext = useCallback(() => {
    setSelectedIndex((prev) => {
      if (prev === null) return prev;
      return Math.min(prev + 1, Math.max(activePreviewImages.length - 1, 0));
    });
  }, [activePreviewImages.length]);

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
      if (prev === null || prev >= activePreviewImages.length - 1) return prev;
      const next = prev + 1;
      setSelectedIndex(next);
      return next;
    });
  }, [activePreviewImages.length]);

  return (
    <div className="image-chat-grid">
      <section className="chat-main-panel">
        <ChatMessageList
          messages={messages}
          isLoading={isLoading}
          onImageSelect={handleImageSelect}
          onUserAttachmentSelect={handleUserAttachmentSelect}
          onRetry={handleRetry}
          onEdit={handleEdit}
        />
        <ChatInput
          key={activeEditState ? `edit-${activeEditState.sessionId}-${activeEditState.messageIndex}` : 'new'}
          onSend={handleSend}
          isLoading={isLoading}
          disabled={!activeSessionId}
          maxAttachments={4}
          initialContent={activeEditState?.content}
          initialAttachments={activeEditState?.attachments}
        />
      </section>

      <aside className="hidden lg:flex chat-gallery-panel">
        <div className="flex items-center justify-between border-b border-black/10 px-3 py-2.5 dark:border-white/10">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-3)]">
            <Images className="h-3.5 w-3.5" />
            本次对话图库
          </div>
          <span className="text-xs text-[var(--text-3)]">{activePreviewImages.length} 张</span>
        </div>

        {selectedImage ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto p-3">
              <div className="overflow-hidden rounded-2xl border border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5">
                <img
                  src={`data:${selectedImage.mimeType};base64,${selectedImage.base64}`}
                  alt="预览图片"
                  className="h-auto w-full cursor-zoom-in object-contain"
                  onClick={() => setPreviewIndex(safeSelectedIndex)}
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
              {activePreviewImages.map((image, index) => (
                <button
                  key={`${index}-${image.base64.slice(0, 16)}`}
                  type="button"
                  onClick={() => {
                    setSelectedIndex(index);
                    setPreviewIndex(index);
                  }}
                  className={`overflow-hidden rounded-lg border ${
                    safeSelectedIndex === index
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
              disabled={activePreviewImages.length === 0}
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
          key={`${safePreviewIndex ?? 0}-${previewImage.base64.slice(0, 24)}`}
          image={previewImage}
          currentIndex={safePreviewIndex ?? 0}
          total={activePreviewImages.length}
          onPrevious={hasPreviewPrevious ? openPreviewPrevious : undefined}
          onNext={hasPreviewNext ? openPreviewNext : undefined}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </div>
  );
}
