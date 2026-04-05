import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  ChatMessage,
  ChatUserMessage,
  ChatAssistantMessage,
  ImageChatSettings,
} from '../types';
import { chatImageGeneration } from '../lib/gemini';
import { stripDataUrlPrefix } from '../lib/utils';
import { pushDevLog } from '../lib/devConsole';

const SETTINGS_STORAGE_KEY = 'ai-studio:image-chat-settings:v2';
const SETTINGS_EVENT_NAME = 'ai-studio:image-chat-settings-updated';

const DEFAULT_SETTINGS: ImageChatSettings = {
  model: 'gemini-3.1-flash-image-preview',
  aspectRatio: '1:1',
  numberOfImages: 1,
  thinkingLevel: 'minimal',
  includeThoughts: false,
  responseModality: 'text_image',
  enableGoogleSearch: false,
  enableImageSearch: false,
};

const ALLOWED_NUMBER_OF_IMAGES = new Set([1, 2, 4]);
const ALLOWED_THINKING_LEVELS = new Set(['minimal', 'high']);
const ALLOWED_RESPONSE_MODALITY = new Set(['text_image', 'image']);
const ALLOWED_MODELS = new Set(['gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview']);
const FLASH_IMAGE_SIZES = new Set(['', '512', '1K', '2K', '4K']);
const PRO_IMAGE_SIZES = new Set(['', '1K', '2K', '4K']);

type ImageMimeType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/heic'
  | 'image/heif'
  | 'image/gif'
  | 'image/bmp'
  | 'image/tiff';

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; inlineData: { data: string; mimeType: ImageMimeType } };

type ChatContent = {
  role: 'user' | 'model';
  parts: ContentPart[];
};

const ALLOWED_IMAGE_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'image/bmp',
  'image/tiff',
]);

const getMimeTypeFromDataUrl = (value: string): ImageMimeType => {
  const match = value.match(/^data:([^;]+);base64,/i);
  const mimeType = (match?.[1] ?? '').toLowerCase();
  if (ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    return mimeType as ImageMimeType;
  }
  return 'image/png';
};

const dataUrlToImagePart = (dataUrl: string): ContentPart => ({
  type: 'image',
  inlineData: {
    data: stripDataUrlPrefix(dataUrl),
    mimeType: getMimeTypeFromDataUrl(dataUrl),
  },
});

const buildHistoryContents = (messages: ChatMessage[]): ChatContent[] => {
  const history: ChatContent[] = [];

  for (const message of messages) {
    if (message.role === 'user') {
      const parts: ContentPart[] = [];
      if (message.content?.trim()) {
        parts.push({ type: 'text', text: message.content.trim() });
      }
      for (const attachment of message.attachments ?? []) {
        parts.push(dataUrlToImagePart(attachment));
      }
      if (parts.length > 0) {
        history.push({ role: 'user', parts });
      }
      continue;
    }

    const parts: ContentPart[] = [];
    if (message.content?.trim() && !message.content.startsWith('⚠️')) {
      parts.push({ type: 'text', text: message.content.trim() });
    }
    for (const image of message.images) {
      parts.push({
        type: 'image',
        inlineData: {
          data: image.base64,
          mimeType: image.mimeType as ImageMimeType,
        },
      });
    }
    if (parts.length > 0) {
      history.push({ role: 'model', parts });
    }
  }

  return history;
};

function normalizeSettings(input: Partial<ImageChatSettings>): ImageChatSettings {
  const next: ImageChatSettings = { ...DEFAULT_SETTINGS };

  if (typeof input.model === 'string' && ALLOWED_MODELS.has(input.model)) {
    next.model = input.model as ImageChatSettings['model'];
  }

  if (typeof input.aspectRatio === 'string' && input.aspectRatio.trim()) {
    next.aspectRatio = input.aspectRatio;
  }

  if (typeof input.imageSize === 'string') {
    next.imageSize = input.imageSize;
  }

  if (typeof input.seed === 'number' && Number.isFinite(input.seed)) {
    next.seed = input.seed;
  }

  if (typeof input.numberOfImages === 'number' && ALLOWED_NUMBER_OF_IMAGES.has(input.numberOfImages)) {
    next.numberOfImages = input.numberOfImages;
  }

  if (typeof input.thinkingLevel === 'string' && ALLOWED_THINKING_LEVELS.has(input.thinkingLevel)) {
    next.thinkingLevel = input.thinkingLevel as ImageChatSettings['thinkingLevel'];
  }
  if (typeof input.includeThoughts === 'boolean') {
    next.includeThoughts = input.includeThoughts;
  }

  if (
    typeof input.responseModality === 'string' &&
    ALLOWED_RESPONSE_MODALITY.has(input.responseModality)
  ) {
    next.responseModality = input.responseModality as ImageChatSettings['responseModality'];
  }

  if (typeof input.enableGoogleSearch === 'boolean') {
    next.enableGoogleSearch = input.enableGoogleSearch;
  }

  if (typeof input.enableImageSearch === 'boolean') {
    next.enableImageSearch = input.enableImageSearch;
  }

  if (!next.enableGoogleSearch) {
    next.enableImageSearch = false;
  }

  // Model capability constraints.
  const allowedImageSizes = next.model === 'gemini-3-pro-image-preview' ? PRO_IMAGE_SIZES : FLASH_IMAGE_SIZES;
  if (!allowedImageSizes.has(next.imageSize ?? '')) {
    next.imageSize = '';
  }
  if (next.model === 'gemini-3-pro-image-preview') {
    next.enableImageSearch = false;
  }

  return next;
}

function readSettingsFromStorage(): ImageChatSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ImageChatSettings>;
    return normalizeSettings(parsed);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persistSettings(settings: ImageChatSettings): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage write errors
  }
}

export interface UseImageChatReturn {
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
  const [settings, setSettingsState] = useState<ImageChatSettings>(() => readSettingsFromStorage());

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const handleSettingsEvent = (event: Event) => {
      const customEvent = event as CustomEvent<ImageChatSettings>;
      if (customEvent.detail) {
        setSettingsState(normalizeSettings(customEvent.detail));
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === SETTINGS_STORAGE_KEY) {
        setSettingsState(readSettingsFromStorage());
      }
    };

    window.addEventListener(SETTINGS_EVENT_NAME, handleSettingsEvent as EventListener);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(SETTINGS_EVENT_NAME, handleSettingsEvent as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const setSettings: React.Dispatch<React.SetStateAction<ImageChatSettings>> = useCallback((value) => {
    setSettingsState((prev) => {
      const nextRaw = typeof value === 'function'
        ? (value as (prevState: ImageChatSettings) => ImageChatSettings)(prev)
        : value;
      const next = normalizeSettings(nextRaw);

      persistSettings(next);
      window.dispatchEvent(new CustomEvent<ImageChatSettings>(SETTINGS_EVENT_NAME, { detail: next }));

      return next;
    });
  }, []);

  const send = useCallback(
    async (content: string, attachments?: string[]) => {
      if (!content.trim() && (!attachments || attachments.length === 0)) return;

      abortControllerRef.current?.abort();

      const controller = new AbortController();
      abortControllerRef.current = controller;

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
        const currentParts: ContentPart[] = [];
        if (content.trim()) {
          currentParts.push({ type: 'text', text: content.trim() });
        }
        for (const attachment of attachments ?? []) {
          currentParts.push(dataUrlToImagePart(attachment));
        }

        const input: string | ChatContent[] =
          messages.length === 0 && currentParts.length === 1 && currentParts[0].type === 'text'
            ? currentParts[0].text
            : [...buildHistoryContents(messages), { role: 'user', parts: currentParts }];

        const config: Record<string, unknown> = {};
        if (settings.aspectRatio) config.aspectRatio = settings.aspectRatio;
        if (typeof settings.numberOfImages === 'number' && Number.isFinite(settings.numberOfImages)) {
          config.numberOfImages = settings.numberOfImages;
        }
        if (settings.seed !== undefined) config.seed = settings.seed;
        if (settings.imageSize) config.imageSize = settings.imageSize;
        if (settings.thinkingLevel) config.thinkingLevel = settings.thinkingLevel;
        if (typeof settings.includeThoughts === 'boolean') config.includeThoughts = settings.includeThoughts;
        if (settings.responseModality) config.responseModality = settings.responseModality;
        if (settings.enableGoogleSearch !== undefined) config.enableGoogleSearch = settings.enableGoogleSearch;
        if (settings.enableImageSearch !== undefined) {
          config.enableImageSearch = settings.model === 'gemini-3-pro-image-preview'
            ? false
            : settings.enableImageSearch;
        }

        pushDevLog('chat.send', 'request-config', 'info', {
          model: settings.model,
          numberOfImages: config.numberOfImages,
          thinkingLevel: config.thinkingLevel,
          includeThoughts: config.includeThoughts,
          responseModality: config.responseModality,
          historyLength: messages.length,
          hasAttachments: Boolean(attachments && attachments.length > 0),
        });

        const response = await chatImageGeneration(settings.model, input, config, controller.signal);

        const assistantMessage: ChatAssistantMessage = {
          role: 'assistant',
          content: response.text?.trim() ? response.text.trim() : undefined,
          thinking: response.thinking?.trim() ? response.thinking.trim() : undefined,
          thinkingImages: response.thinkingImages,
          orderedParts: response.orderedParts,
          images: response.images,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }

        const errorMessage = err instanceof Error ? err.message : '生成失败，请重试';
        setError(errorMessage);

        const errorMessageContent: ChatAssistantMessage = {
          role: 'assistant',
          images: [],
          timestamp: Date.now(),
        };

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
    [messages, settings]
  );

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
  }, []);

  const newChat = useCallback(() => {
    cancel();
    setMessages([]);
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
