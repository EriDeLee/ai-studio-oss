import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  ChatMessage,
  ChatUserMessage,
  ChatAssistantMessage,
  ImageChatSettings,
} from '../types';
import { chatImageGeneration } from '../lib/gemini';
import { stripDataUrlPrefix } from '../lib/utils';

const DEFAULT_SETTINGS: ImageChatSettings = {
  model: 'gemini-3.1-flash-image-preview',
  aspectRatio: '1:1',
  numberOfImages: 1,
  enhancePrompt: true,
  language: 'auto',
};

interface UseImageChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  settings: ImageChatSettings;
  setSettings: React.Dispatch<React.SetStateAction<ImageChatSettings>>;
  send: (content: string, attachments?: string[]) => Promise<void>;
  cancel: () => void;
  newChat: () => void;
}

export function useImageChat(): UseImageChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ImageChatSettings>(DEFAULT_SETTINGS);
  const [lastInteractionId, setLastInteractionId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const send = useCallback(
    async (content: string, attachments?: string[]) => {
      if (!content.trim() && (!attachments || attachments.length === 0)) return;

      // Cancel any in-flight request
      abortControllerRef.current?.abort();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Add user message
      const userMessage: ChatUserMessage = {
        role: 'user',
        content: content.trim(),
        attachments: attachments?.filter((a) => a.trim()),
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setError(null);

      try {
        // Build input: if attachments exist, create multimodal input
        let input: string | Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mime_type?: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/heic' | 'image/heif' | 'image/gif' | 'image/bmp' | 'image/tiff' }>;

        if (attachments && attachments.length > 0) {
          // Multimodal input: text + images
          input = [
            ...(content.trim() ? [{ type: 'text' as const, text: content.trim() }] : []),
            ...attachments.map((img) => ({
              type: 'image' as const,
              data: stripDataUrlPrefix(img),
              mime_type: 'image/png' as const,
            })),
          ];
        } else {
          // Text-only input
          input = content.trim();
        }

        // Build config from settings
        const config: Record<string, unknown> = {
          responseModalities: ['image', 'text'],
        };
        if (settings.aspectRatio) config.aspectRatio = settings.aspectRatio;
        if (settings.numberOfImages) config.numberOfImages = settings.numberOfImages;
        if (settings.seed) config.seed = settings.seed;
        if (settings.guidanceScale) config.guidanceScale = settings.guidanceScale;
        if (settings.imageSize) config.imageSize = settings.imageSize;
        if (settings.addWatermark !== undefined) config.addWatermark = settings.addWatermark;
        if (settings.safetyFilterLevel) config.safetyFilterLevel = settings.safetyFilterLevel;
        if (settings.personGeneration) config.personGeneration = settings.personGeneration;
        if (settings.language && settings.language !== 'auto') config.language = settings.language;
        if (settings.enhancePrompt !== undefined) config.enhancePrompt = settings.enhancePrompt;
        if (settings.negativePrompt) config.negativePrompt = settings.negativePrompt;
        if (settings.thinkingLevel) config.thinkingLevel = settings.thinkingLevel;
        if (settings.includeThoughts !== undefined) config.includeThoughts = settings.includeThoughts;
        if (settings.responseModality) config.responseModality = settings.responseModality;
        if (settings.enableGoogleSearch !== undefined) config.enableGoogleSearch = settings.enableGoogleSearch;
        if (settings.enableImageSearch !== undefined) config.enableImageSearch = settings.enableImageSearch;

        const response = await chatImageGeneration(
          settings.model,
          input,
          config,
          lastInteractionId,
          controller.signal
        );

        // Update interaction ID for next turn
        setLastInteractionId(response.interactionId || null);

        // Add assistant message
        const assistantMessage: ChatAssistantMessage = {
          role: 'assistant',
          images: response.images,
          interactionId: response.interactionId,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        // Ignore abort errors
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }

        const errorMessage = err instanceof Error ? err.message : '生成失败，请重试';
        setError(errorMessage);

        // Add error message as assistant response
        const errorMessageContent: ChatAssistantMessage = {
          role: 'assistant',
          images: [],
          timestamp: Date.now(),
        };
        // We store error separately, but add a placeholder message
        setMessages((prev) => [
          ...prev,
          {
            ...errorMessageContent,
            content: `⚠️ ${errorMessage}`,
          },
        ]);
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [lastInteractionId, settings]
  );

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
  }, []);

  const newChat = useCallback(() => {
    cancel();
    setMessages([]);
    setLastInteractionId(null);
    setError(null);
  }, [cancel]);

  return {
    messages,
    isLoading,
    error,
    settings,
    setSettings,
    send,
    cancel,
    newChat,
  };
}
