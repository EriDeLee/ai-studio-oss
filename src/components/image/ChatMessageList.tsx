import { useRef, useEffect } from 'react';
import { Download, Copy, Sparkles, User, AlertCircle } from 'lucide-react';
import type { ChatMessage, ChatUserMessage, ChatAssistantMessage } from '../../types';
import { downloadBase64Image } from '../../lib/utils';

interface ChatMessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onImageSelect?: (image: { base64: string; mimeType: string }) => void;
}

interface MessageBubbleProps {
  message: ChatMessage;
  onImageClick?: (image: { base64: string; mimeType: string }) => void;
}

function UserMessage({ message }: MessageBubbleProps) {
  const msg = message as ChatUserMessage;

  return (
    <div className="flex justify-end">
      <div className="max-w-[90%] space-y-2">
        <div className="flex items-end gap-2 justify-end">
          <div className="bg-primary-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 shadow-sm">
            <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
          </div>
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <User className="w-4 h-4 text-primary-600 dark:text-primary-400" />
          </div>
        </div>

        {/* Attachment thumbnails */}
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="flex gap-2 justify-end">
            {msg.attachments.map((img, index) => (
              <div
                key={index}
                className="flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden border-2 border-primary-200 dark:border-primary-800"
              >
                <img src={img} alt={`参考图 ${index + 1}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AssistantMessage({ message, onImageClick }: MessageBubbleProps) {
  const msg = message as ChatAssistantMessage;

  const handleDownload = (image: { base64: string; mimeType: string }) => {
    downloadBase64Image(image.base64, image.mimeType, `ai-image-${Date.now()}.png`);
  };

  const handleCopy = async (image: { base64: string; mimeType: string }) => {
    try {
      const response = await fetch(`data:${image.mimeType};base64,${image.base64}`);
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    } catch {
      console.error('Failed to copy image');
    }
  };

  const isError = msg.content?.startsWith('⚠️');

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-bl-md px-4 py-2.5 shadow-sm border border-gray-100 dark:border-gray-700">
            {isError ? (
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p className="text-sm">{msg.content?.slice(4)}</p>
              </div>
            ) : (
              <>
                {msg.content && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words mb-2">
                    {msg.content}
                  </p>
                )}
                {msg.images.length > 0 && (
                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(msg.images.length, 2)}, minmax(0, 1fr))` }}>
                    {msg.images.map((image, index) => (
                      <div
                        key={index}
                        className="relative group rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-900"
                      >
                        <img
                          src={`data:${image.mimeType};base64,${image.base64}`}
                          alt={`AI 生成图像 ${index + 1}`}
                          className="w-full h-auto object-cover cursor-pointer transition-transform group-hover:scale-105"
                          onClick={() => onImageClick?.(image)}
                          loading="lazy"
                        />
                        {/* Hover actions */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDownload(image); }}
                            className="p-1.5 bg-white/90 rounded-lg hover:bg-white transition-colors"
                            aria-label="下载图片"
                          >
                            <Download className="w-4 h-4 text-gray-700" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleCopy(image); }}
                            className="p-1.5 bg-white/90 rounded-lg hover:bg-white transition-colors"
                            aria-label="复制图片"
                          >
                            <Copy className="w-4 h-4 text-gray-700" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingBubble() {
  return (
    <div className="flex justify-start">
      <div className="flex items-end gap-2">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500">正在生成...</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChatMessageList({ messages, isLoading, onImageSelect }: ChatMessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/30 dark:to-primary-800/30 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              AI 图片工作室
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              描述你的想法，AI 会自动选择合适的模式生成或编辑图片
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-gray-600 dark:text-gray-400">
              ✨ "生成一只戴墨镜的猫"
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-gray-600 dark:text-gray-400">
              🎨 "把背景改成海边日落"
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-gray-600 dark:text-gray-400">
              🖼️ "参考这张图生成卡通版"
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-gray-600 dark:text-gray-400">
              🔄 "再加个太阳帽"
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
      {messages.map((message, index) =>
        message.role === 'user' ? (
          <UserMessage key={index} message={message} />
        ) : (
          <AssistantMessage key={index} message={message} onImageClick={onImageSelect} />
        )
      )}

      {isLoading && <LoadingBubble />}

      <div ref={messagesEndRef} />
    </div>
  );
}
