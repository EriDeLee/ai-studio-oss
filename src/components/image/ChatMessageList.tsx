import { useRef, useEffect } from 'react';
import { Download, Copy, Sparkles, User, AlertCircle, Image as ImageIcon } from 'lucide-react';
import type { ChatMessage, ChatUserMessage, ChatAssistantMessage } from '../../types';
import { downloadBase64Image } from '../../lib/utils';

interface ChatMessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onImageSelect?: (
    image: { base64: string; mimeType: string },
    index: number
  ) => void;
}

interface MessageBubbleProps {
  message: ChatMessage;
  imageStartIndex?: number;
  onImageClick?: (image: { base64: string; mimeType: string }, index: number) => void;
}

function UserMessage({ message }: MessageBubbleProps) {
  const msg = message as ChatUserMessage;

  return (
    <div className="flex justify-end">
      <div className="max-w-[92%] space-y-2">
        <div className="flex items-end gap-2 justify-end">
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
              <div
                key={index}
                className="h-16 w-16 overflow-hidden rounded-xl border border-primary-300/60 sm:h-20 sm:w-20"
              >
                <img src={img} alt={`参考图 ${index + 1}`} className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AssistantMessage({ message, imageStartIndex = 0, onImageClick }: MessageBubbleProps) {
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
      // ignore
    }
  };

  const isError = msg.content?.startsWith('⚠️');
  const hasOrderedParts = Array.isArray(msg.orderedParts) && msg.orderedParts.length > 0;

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
                <p className="text-sm">{msg.content?.slice(4)}</p>
              </div>
            ) : (
              <>
                {hasOrderedParts ? (
                  (() => {
                    const thinkingParts = msg.orderedParts?.filter((part) => part.bucket === 'thinking') ?? [];
                    const mainParts = msg.orderedParts?.filter((part) => part.bucket === 'main') ?? [];
                    const otherParts = msg.orderedParts?.filter((part) => part.bucket === 'other') ?? [];
                    let finalImageLocalIndex = 0;
                    return (
                      <div className="space-y-2">
                        {thinkingParts.length > 0 && (
                          <details className="rounded-xl border border-violet-300/40 bg-violet-50/60 px-3 py-2 text-xs dark:border-violet-700/40 dark:bg-violet-900/20">
                            <summary className="cursor-pointer select-none font-medium text-violet-700 dark:text-violet-300">
                              Thinking
                            </summary>
                            <div className="mt-2 space-y-2">
                              {thinkingParts.map((part, index) => {
                                if (part.type === 'text') {
                                  return (
                                    <p
                                      key={`thinking-text-${part.candidateIndex}-${part.partIndex}-${index}`}
                                      className="whitespace-pre-wrap break-words text-[var(--text-2)]"
                                    >
                                      {part.text ?? ''}
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
                        )}
                        {mainParts.map((part, index) => {
                          if (part.type === 'text') {
                            return (
                              <div
                                key={`part-text-${part.candidateIndex}-${part.partIndex}-${index}`}
                                className="rounded-xl bg-black/[0.03] px-3 py-2 text-sm whitespace-pre-wrap break-words text-[var(--text-2)] dark:bg-white/[0.03]"
                              >
                                {part.text ?? ''}
                              </div>
                            );
                          }

                          if (part.type !== 'image' || !part.image) return null;

                          const selectableIndex = imageStartIndex + finalImageLocalIndex;
                          finalImageLocalIndex += 1;

                          return (
                            <div
                              key={`part-image-${part.candidateIndex}-${part.partIndex}-${index}`}
                              className="group relative overflow-hidden rounded-xl border border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5"
                            >
                              <img
                                src={`data:${part.image.mimeType};base64,${part.image.base64}`}
                                alt={`AI 生成图像 ${index + 1}`}
                                className="h-auto w-full cursor-pointer object-cover transition-transform duration-200 group-hover:scale-105"
                                onClick={() => onImageClick?.(part.image!, selectableIndex)}
                                loading="lazy"
                              />
                              <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition-all group-hover:pointer-events-auto group-hover:bg-black/35 group-hover:opacity-100">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload(part.image!);
                                  }}
                                  className="rounded-lg bg-white/90 p-1.5 text-zinc-800 hover:bg-white"
                                  aria-label="下载图片"
                                >
                                  <Download className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopy(part.image!);
                                  }}
                                  className="rounded-lg bg-white/90 p-1.5 text-zinc-800 hover:bg-white"
                                  aria-label="复制图片"
                                >
                                  <Copy className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
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
                  })()
                ) : (
                  <>
                    {msg.thinking && (
                      <details className="mb-2 rounded-xl border border-violet-300/40 bg-violet-50/60 px-3 py-2 text-xs dark:border-violet-700/40 dark:bg-violet-900/20">
                        <summary className="cursor-pointer select-none font-medium text-violet-700 dark:text-violet-300">
                          Thinking
                        </summary>
                        <p className="mt-2 whitespace-pre-wrap break-words text-[var(--text-2)]">
                          {msg.thinking}
                        </p>
                      </details>
                    )}
                    {msg.content && (
                      <p className="mb-2 text-sm whitespace-pre-wrap break-words text-[var(--text-2)]">{msg.content}</p>
                    )}
                    {msg.images.length > 0 && (
                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(msg.images.length, 2)}, minmax(0, 1fr))` }}>
                    {msg.images.map((image, index) => (
                      <div
                        key={index}
                        className="group relative overflow-hidden rounded-xl border border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5"
                      >
                        <img
                          src={`data:${image.mimeType};base64,${image.base64}`}
                          alt={`AI 生成图像 ${index + 1}`}
                          className="h-auto w-full cursor-pointer object-cover transition-transform duration-200 group-hover:scale-105"
                          onClick={() => onImageClick?.(image, imageStartIndex + index)}
                          loading="lazy"
                        />
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition-all group-hover:pointer-events-auto group-hover:bg-black/35 group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(image);
                            }}
                            className="rounded-lg bg-white/90 p-1.5 text-zinc-800 hover:bg-white"
                            aria-label="下载图片"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(image);
                            }}
                            className="rounded-lg bg-white/90 p-1.5 text-zinc-800 hover:bg-white"
                            aria-label="复制图片"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                    )}
                  </>
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
        <div className="avatar-dot bg-black/5 text-[var(--text-2)] dark:bg-white/10">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="chat-bubble assistant-bubble">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--text-3)]" style={{ animationDelay: '0ms' }} />
              <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--text-3)]" style={{ animationDelay: '140ms' }} />
              <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--text-3)]" style={{ animationDelay: '280ms' }} />
            </div>
            <span className="text-xs text-[var(--text-3)]">正在生成...</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChatMessageList({ messages, isLoading, onImageSelect }: ChatMessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  let assistantImageCount = 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="chat-empty-state">
        <div className="mx-auto max-w-xl space-y-4 text-center">
          <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-500/15 text-primary-600 dark:text-primary-300">
            <ImageIcon className="h-7 w-7" />
          </div>
          <h3 className="text-xl font-semibold tracking-tight">对话式图像工作台</h3>
          <p className="text-sm text-[var(--text-3)]">
            发一句提示词即可生成，继续追问即可在同一上下文里迭代图片。
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs text-[var(--text-2)]">
            <div className="rounded-xl border border-black/10 bg-black/[0.03] p-3 dark:border-white/10 dark:bg-white/[0.03]">“生成一张电影感夜景街道”</div>
            <div className="rounded-xl border border-black/10 bg-black/[0.03] p-3 dark:border-white/10 dark:bg-white/[0.03]">“主体改成复古机车，保持光线”</div>
            <div className="rounded-xl border border-black/10 bg-black/[0.03] p-3 dark:border-white/10 dark:bg-white/[0.03]">“上传参考图，做同风格角色”</div>
            <div className="rounded-xl border border-black/10 bg-black/[0.03] p-3 dark:border-white/10 dark:bg-white/[0.03]">“给这张图再做一个更暖色版本”</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-scroll-area">
      {messages.map((message, index) =>
        message.role === 'user' ? (
          <UserMessage key={index} message={message} />
        ) : (
          (() => {
            const currentStartIndex = assistantImageCount;
            assistantImageCount += message.images.length;
            return (
              <AssistantMessage
                key={index}
                message={message}
                imageStartIndex={currentStartIndex}
                onImageClick={onImageSelect}
              />
            );
          })()
        )
      )}

      {isLoading && <LoadingBubble />}
      <div ref={messagesEndRef} />
    </div>
  );
}
