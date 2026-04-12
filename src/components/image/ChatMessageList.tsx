import { useRef, useEffect, useMemo, type ReactElement } from 'react';
import { Sparkles, User, AlertCircle, Image as ImageIcon, RotateCcw, Pencil } from 'lucide-react';
import type {
  ChatMessage,
  ChatUserMessage,
  ChatAssistantMessage,
  GeneratedImage,
  AssistantResponsePart,
} from '../../types';

interface ChatMessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onImageSelect?: (
    image: { base64: string; mimeType: string },
    index: number
  ) => void;
  onUserAttachmentSelect?: (attachments: string[], index: number) => void;
  onRetry?: (messageIndex: number) => void;
  onEdit?: (messageIndex: number) => void;
}

interface UserMessageProps {
  message: ChatUserMessage;
  messageIndex: number;
  onUserAttachmentSelect?: (attachments: string[], index: number) => void;
  onRetry?: (messageIndex: number) => void;
  onEdit?: (messageIndex: number) => void;
}

interface ImageCardProps {
  image: GeneratedImage;
  alt: string;
  selectableIndex: number;
  onImageClick?: (image: GeneratedImage, index: number) => void;
}

interface ThinkingDetailsProps {
  parts: AssistantResponsePart[];
}

interface OrderedAssistantContentProps {
  message: ChatAssistantMessage;
  imageStartIndex: number;
  showThinking: boolean;
  onImageClick?: (image: GeneratedImage, index: number) => void;
}

function UserMessage({ message: msg, messageIndex, onUserAttachmentSelect, onRetry, onEdit }: UserMessageProps) {
  return (
    <div className="flex justify-end group">
      <div className="max-w-[92%] space-y-2">
        <div className="flex items-end gap-2 justify-end">
          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200 mr-1">
            <button
              type="button"
              onClick={() => onRetry?.(messageIndex)}
              disabled={!onRetry}
              className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-primary-600 hover:bg-primary-100/50 dark:hover:bg-primary-900/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="重试"
              title="重试"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onEdit?.(messageIndex)}
              disabled={!onEdit}
              className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-primary-600 hover:bg-primary-100/50 dark:hover:bg-primary-900/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="编辑"
              title="编辑"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>
          <div className="chat-bubble user-bubble">
            <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
          </div>
          <div className="avatar-dot bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300">
            <User className="w-4 h-4" />
          </div>
        </div>

        {msg.attachments && msg.attachments.length > 0 && (
          <div className="flex gap-2 justify-end">
            {msg.attachments.map((img, index) => (
              <button
                key={index}
                type="button"
                onClick={() => onUserAttachmentSelect?.(msg.attachments ?? [], index)}
                className="h-16 w-16 overflow-hidden rounded-xl border border-primary-300/60 sm:h-20 sm:w-20"
                aria-label={`查看参考图 ${index + 1}`}
              >
                <img src={img} alt={`参考图 ${index + 1}`} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ImageCard({ image, alt, selectableIndex, onImageClick }: ImageCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-black/5 bg-gradient-to-b from-black/5 to-black/10 dark:border-white/10 dark:from-white/5 dark:to-white/10 transition-all duration-500 ease-out hover:shadow-xl hover:shadow-primary-500/10 hover:-translate-y-0.5">
      <img
        src={`data:${image.mimeType};base64,${image.base64}`}
        alt={alt}
        className="h-auto w-full cursor-pointer object-cover transition-all duration-500 ease-out group-hover:scale-105 group-hover:saturate-110"
        onClick={() => onImageClick?.(image, selectableIndex)}
        loading="lazy"
      />
    </div>
  );
}

function ImageGrid({
  images,
  imageStartIndex,
  onImageClick,
  altPrefix,
}: {
  images: GeneratedImage[];
  imageStartIndex: number;
  onImageClick?: (image: GeneratedImage, index: number) => void;
  altPrefix: string;
}) {
  if (images.length === 0) return null;

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(images.length, 2)}, minmax(0, 1fr))` }}>
      {images.map((image, index) => (
        <ImageCard
          key={`${image.base64.slice(0, 16)}-${index}`}
          image={image}
          alt={`${altPrefix} ${index + 1}`}
          selectableIndex={imageStartIndex + index}
          onImageClick={onImageClick}
        />
      ))}
    </div>
  );
}

function ThinkingDetails({ parts }: ThinkingDetailsProps) {
  if (parts.length === 0) return null;

  return (
    <details className="rounded-xl border border-violet-300/40 bg-violet-50/60 px-3 py-2 text-xs dark:border-violet-700/40 dark:bg-violet-900/20">
      <summary className="cursor-pointer select-none font-medium text-violet-700 dark:text-violet-300">
        Thinking
      </summary>
      <div className="mt-2 space-y-2">
        {parts.map((part, index) => {
          if (part.type === 'text' && part.text?.trim()) {
            return (
              <p
                key={`thinking-text-${part.candidateIndex}-${part.partIndex}-${index}`}
                className="whitespace-pre-wrap break-words text-[var(--text-2)]"
              >
                {part.text}
              </p>
            );
          }

          if (part.type === 'image' && part.image) {
            return (
              <div
                key={`thinking-image-${part.candidateIndex}-${part.partIndex}-${index}`}
                className="overflow-hidden rounded-lg border border-violet-300/40 bg-black/5 dark:border-violet-700/40 dark:bg-white/5"
              >
                <img
                  src={`data:${part.image.mimeType};base64,${part.image.base64}`}
                  alt={`Thinking 图像 ${index + 1}`}
                  className="h-auto w-full object-cover"
                  loading="lazy"
                />
              </div>
            );
          }

          return null;
        })}
      </div>
    </details>
  );
}

function OrderedAssistantContent({
  message,
  imageStartIndex,
  showThinking,
  onImageClick,
}: OrderedAssistantContentProps) {
  const orderedParts = message.orderedParts ?? [];
  const thinkingParts = orderedParts.filter((part) => part.bucket === 'thinking');
  const mainParts = orderedParts.filter((part) => part.bucket === 'main');
  const otherParts = orderedParts.filter((part) => part.bucket === 'other');

  const getImageOffsetForPart = (partIndex: number): number => {
    const imagesBeforeOrAtPart = mainParts
      .slice(0, partIndex + 1)
      .filter((part) => part.type === 'image' && Boolean(part.image)).length;
    return imagesBeforeOrAtPart - 1;
  };

  const hasRenderableMainPart = mainParts.some((part) => {
    if (part.type === 'image' && part.image) return true;
    if (part.type === 'text' && part.text?.trim()) return true;
    return false;
  });

  return (
    <div className="space-y-2">
      {showThinking && <ThinkingDetails parts={thinkingParts} />}

      {mainParts.map((part, index) => {
        if (part.type === 'text' && part.text?.trim()) {
          return (
            <div
              key={`part-text-${part.candidateIndex}-${part.partIndex}-${index}`}
              className="rounded-xl bg-black/[0.03] px-3 py-2 text-sm whitespace-pre-wrap break-words text-[var(--text-2)] dark:bg-white/[0.03]"
            >
              {part.text}
            </div>
          );
        }

        if (part.type !== 'image' || !part.image) {
          return null;
        }

        const selectableIndex = imageStartIndex + getImageOffsetForPart(index);

        return (
          <ImageCard
            key={`part-image-${part.candidateIndex}-${part.partIndex}-${index}`}
            image={part.image}
            alt={`AI 生成图像 ${index + 1}`}
            selectableIndex={selectableIndex}
            onImageClick={onImageClick}
          />
        );
      })}

      {!hasRenderableMainPart && message.content?.trim() && (
        <div className="rounded-xl bg-black/[0.03] px-3 py-2 text-sm whitespace-pre-wrap break-words text-[var(--text-2)] dark:bg-white/[0.03]">
          {message.content}
        </div>
      )}

      {otherParts.length > 0 && (
        <details className="rounded-xl border border-amber-300/40 bg-amber-50/60 px-3 py-2 text-xs dark:border-amber-700/40 dark:bg-amber-900/20">
          <summary className="cursor-pointer select-none font-medium text-amber-700 dark:text-amber-300">
            其他
          </summary>
          <div className="mt-2 space-y-2">
            {otherParts.map((part, index) => (
              <pre
                key={`other-${part.candidateIndex}-${part.partIndex}-${index}`}
                className="overflow-auto rounded-lg border border-amber-300/40 bg-black/[0.04] p-2 text-[11px] leading-4 text-[var(--text-2)] dark:border-amber-700/40 dark:bg-white/[0.04]"
              >
                {JSON.stringify(part.raw, null, 2)}
              </pre>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function AssistantMessage({
  message: msg,
  imageStartIndex = 0,
  onImageClick,
}: {
  message: ChatAssistantMessage;
  imageStartIndex?: number;
  onImageClick?: (image: { base64: string; mimeType: string }, index: number) => void;
}) {
  const isError = msg.kind === 'error';
  const hasOrderedParts = Array.isArray(msg.orderedParts) && msg.orderedParts.length > 0;
  const showThinking = true;

  return (
    <div className="flex justify-start">
      <div className="max-w-[94%] space-y-3">
        <div className="flex items-end gap-2">
          <div className="avatar-dot bg-black/5 text-[var(--text-2)] dark:bg-white/10">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="chat-bubble assistant-bubble">
            {isError ? (
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <p className="text-sm">{msg.errorMessage ?? '生成失败，请重试'}</p>
              </div>
            ) : hasOrderedParts ? (
              <OrderedAssistantContent
                message={msg}
                imageStartIndex={imageStartIndex}
                showThinking={showThinking}
                onImageClick={onImageClick}
              />
            ) : (
              <>
                {showThinking && msg.thinking?.trim() && (
                  <details className="mb-2 rounded-xl border border-violet-300/40 bg-violet-50/60 px-3 py-2 text-xs dark:border-violet-700/40 dark:bg-violet-900/20">
                    <summary className="cursor-pointer select-none font-medium text-violet-700 dark:text-violet-300">
                      Thinking
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap break-words text-[var(--text-2)]">
                      {msg.thinking}
                    </p>
                    {Array.isArray(msg.thinkingImages) && msg.thinkingImages.length > 0 && (
                      <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(msg.thinkingImages.length, 2)}, minmax(0, 1fr))` }}>
                        {msg.thinkingImages.map((image, index) => (
                          <div
                            key={`thinking-fallback-${index}`}
                            className="overflow-hidden rounded-lg border border-violet-300/40 bg-black/5 dark:border-violet-700/40 dark:bg-white/5"
                          >
                            <img
                              src={`data:${image.mimeType};base64,${image.base64}`}
                              alt={`Thinking 图像 ${index + 1}`}
                              className="h-auto w-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </details>
                )}
                {msg.content?.trim() && (
                  <p className="mb-2 text-sm whitespace-pre-wrap break-words text-[var(--text-2)]">{msg.content}</p>
                )}
                <ImageGrid
                  images={msg.images}
                  imageStartIndex={imageStartIndex}
                  onImageClick={onImageClick}
                  altPrefix="AI 生成图像"
                />
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
    <div className="flex justify-start animate-fade-in-up">
      <div className="flex items-end gap-2">
        <div className="avatar-dot bg-gradient-to-br from-primary-100 to-primary-200 text-primary-700 animate-pulse-soft dark:from-primary-900/50 dark:to-primary-800/30 dark:text-primary-300">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="chat-bubble assistant-bubble bg-gradient-to-r from-[var(--panel)] to-primary-50/30 dark:to-primary-900/20 min-w-[140px]">
          <div className="flex items-center gap-3">
            {/* 波浪动画 */}
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-2 w-2 rounded-full bg-primary-400 animate-bounce shadow-sm shadow-primary-500/30"
                  style={{
                    animationDelay: `${i * 150}ms`,
                    animationDuration: '1s'
                  }}
                />
              ))}
            </div>
            <span className="text-xs text-[var(--text-3)] font-medium animate-pulse-soft">
              正在构思画面...
            </span>
          </div>
          {/* 进度条 */}
          <div className="mt-3 h-1 w-full rounded-full bg-black/5 dark:bg-white/5 overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary-400 to-primary-500 animate-shimmer" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChatMessageList({ messages, isLoading, onImageSelect, onUserAttachmentSelect, onRetry, onEdit }: ChatMessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const renderedMessages = useMemo(() => {
    const nodes: ReactElement[] = [];
    let assistantImageCount = 0;

    messages.forEach((message, index) => {
      const messageKey = `${message.role}-${message.timestamp}-${index}`;
      if (message.role === 'user') {
        nodes.push(
          <UserMessage
            key={messageKey}
            message={message}
            messageIndex={index}
            onUserAttachmentSelect={onUserAttachmentSelect}
            onRetry={onRetry}
            onEdit={onEdit}
          />
        );
        return;
      }

      nodes.push(
        <AssistantMessage
          key={messageKey}
          message={message}
          imageStartIndex={assistantImageCount}
          onImageClick={onImageSelect}
        />
      );
      assistantImageCount += message.images.length;
    });

    return nodes;
  }, [messages, onEdit, onImageSelect, onRetry, onUserAttachmentSelect]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (messages.length === 0 && !isLoading) {
    const examples = [
      "生成一张电影感夜景街道",
      "主体改成复古机车，保持光线",
      "上传参考图，做同风格角色",
      "给这张图再做一个更暖色版本"
    ];

    return (
      <div className="chat-empty-state">
        <div className="mx-auto max-w-xl space-y-6 text-center animate-fade-in-up">
          {/* 动态 Logo */}
          <div className="relative mx-auto inline-flex h-20 w-20 items-center justify-center">
            {/* 外圈光晕 */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 opacity-20 blur-xl animate-pulse" />
            {/* 内圈 */}
            <div className="relative inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-xl shadow-primary-500/30 animate-spring-scale">
              <ImageIcon className="h-8 w-8" />
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-[var(--text-1)] to-[var(--text-2)] bg-clip-text text-transparent">
              对话式图像工作台
            </h3>
            <p className="text-sm text-[var(--text-3)] max-w-sm mx-auto">
              发一句提示词即可生成，继续追问即可在同一上下文里迭代图片
            </p>
          </div>

          {/* 示例提示卡片 */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {examples.map((ex, i) => (
              <div
                key={i}
                className="group rounded-xl border border-black/10 bg-black/[0.03] p-4 text-left cursor-default transition-all duration-300 hover:border-primary-400/50 hover:bg-primary-50/50 hover:shadow-lg hover:shadow-primary-500/10 hover:-translate-y-1 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-primary-900/20"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <Sparkles className="h-4 w-4 text-primary-500 mb-2 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" />
                <span className="text-[var(--text-2)]">{ex}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-scroll-area">
      {renderedMessages}

      {isLoading && <LoadingBubble />}
      <div ref={messagesEndRef} />
    </div>
  );
}
