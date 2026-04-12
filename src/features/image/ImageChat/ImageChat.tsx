import { useState, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
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
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [selectionSessionId, setSelectionSessionId] = useState(activeSessionId);
  const [attachmentPreviewState, setAttachmentPreviewState] = useState<AttachmentPreviewState | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const activeEditState = editState?.sessionId === activeSessionId ? editState : null;
  const activeAttachmentPreviewState = attachmentPreviewState?.sessionId === activeSessionId ? attachmentPreviewState : null;

  const conversationImages = useMemo(
    () =>
      messages
        .filter((message): message is ChatAssistantMessage => message.role === 'assistant')
        .flatMap((message) => message.images),
    [messages]
  );

  const activePreviewImages = activeAttachmentPreviewState
    ? activeAttachmentPreviewState.images
    : conversationImages;
  const isSelectionInActiveSession = selectionSessionId === activeSessionId;
  const safePreviewIndex = isSelectionInActiveSession ? toValidIndex(previewIndex, activePreviewImages.length) : null;

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
      if (activeAttachmentPreviewState) {
        setAttachmentPreviewState(null);
      }
      send(content, attachments);
    },
    [activeAttachmentPreviewState, activeEditState, editState, messages, send]
  );

  const handleRetry = useCallback(
    (messageIndex: number) => {
      setEditState(null);
      setAttachmentPreviewState(null);
      setSelectionSessionId(activeSessionId);
      setPreviewIndex(null);
      retryFromMessage(messageIndex);
    },
    [activeSessionId, retryFromMessage]
  );

  const handleEdit = useCallback(
    (messageIndex: number) => {
      const messageData = getMessageForEdit(messageIndex);
      if (messageData) {
        setAttachmentPreviewState(null);
        setSelectionSessionId(activeSessionId);
        setPreviewIndex(null);
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
    setSelectionSessionId(activeSessionId);
    setPreviewIndex(index);
  }, [activeSessionId]);

  const handleUserAttachmentSelect = useCallback((attachments: string[], index: number) => {
    const images = normalizeAttachmentsToImages(attachments);
    if (images.length === 0) return;
    const safeIndex = Math.min(Math.max(index, 0), images.length - 1);
    setAttachmentPreviewState({
      sessionId: activeSessionId,
      images,
    });
    setSelectionSessionId(activeSessionId);
    setPreviewIndex(safeIndex);
  }, [activeSessionId]);

  const previewImage = safePreviewIndex !== null ? activePreviewImages[safePreviewIndex] : null;
  const hasPreviewPrevious = safePreviewIndex !== null && safePreviewIndex > 0;
  const hasPreviewNext = safePreviewIndex !== null && safePreviewIndex < activePreviewImages.length - 1;

  const openPreviewPrevious = useCallback(() => {
    setPreviewIndex((prev) => {
      if (prev === null || prev <= 0) return prev;
      return prev - 1;
    });
  }, []);

  const openPreviewNext = useCallback(() => {
    setPreviewIndex((prev) => {
      if (prev === null || prev >= activePreviewImages.length - 1) return prev;
      return prev + 1;
    });
  }, [activePreviewImages.length]);

  return (
    <section className="chat-main-panel h-full">
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
    </section>
  );
}
