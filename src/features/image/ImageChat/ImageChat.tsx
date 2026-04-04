import { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { useImageChat } from '../../../hooks/useImageChat';
import { ChatMessageList } from '../../../components/image/ChatMessageList';
import { ChatInput } from '../../../components/image/ChatInput';
import { ImagePreviewModal } from '../../../components/image/ImagePreviewModal';

interface SelectedImage {
  base64: string;
  mimeType: string;
}

export function ImageChat() {
  const { messages, isLoading, send, settings } = useImageChat();
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [previewImage, setPreviewImage] = useState<SelectedImage | null>(null);

  const handleSend = useCallback(
    (content: string, attachments?: string[]) => {
      send(content, attachments);
    },
    [send]
  );

  const handleImageSelect = useCallback((image: SelectedImage) => {
    setSelectedImage(image);
    setPreviewImage(image);
  }, []);

  const maxAttachments = settings.professionalMode ? 14 : 4;

  return (
    <div className="flex flex-col h-full">
      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          <ChatMessageList
            messages={messages}
            isLoading={isLoading}
            onImageSelect={handleImageSelect}
          />
          <ChatInput
            onSend={handleSend}
            isLoading={isLoading}
            maxAttachments={maxAttachments}
          />
        </div>

        {/* Image preview panel (right side, hidden on mobile) */}
        {selectedImage && (
          <div className="hidden lg:flex w-80 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-col">
            <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">图片预览</h3>
              <button
                type="button"
                onClick={() => setSelectedImage(null)}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="关闭预览"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <div className="rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-900">
                <img
                  src={`data:${selectedImage.mimeType};base64,${selectedImage.base64}`}
                  alt="预览图片"
                  className="w-full h-auto object-contain"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Full-screen image preview modal (for mobile) */}
      {previewImage && (
        <ImagePreviewModal
          image={previewImage}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
}
