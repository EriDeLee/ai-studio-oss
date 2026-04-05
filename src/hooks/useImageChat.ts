import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  ChatMessage,
  ChatUserMessage,
  ChatAssistantMessage,
  ChatSession,
  ChatSessionSummary,
  ImageChatSettings,
  GeneratedImage,
  AssistantResponsePart,
} from '../types';
import { chatImageGeneration } from '../lib/gemini';
import { stripDataUrlPrefix } from '../lib/utils';
import { pushDevLog } from '../lib/devConsole';

const SETTINGS_STORAGE_KEY = 'ai-studio:image-chat-settings:v2';
const SETTINGS_EVENT_NAME = 'ai-studio:image-chat-settings-updated';
// Forward-only policy: chat sessions are persisted in IndexedDB only.
// We intentionally do not migrate or fallback to legacy localStorage chat session keys.
const CHAT_IDB_NAME = 'ai-studio:image-chat-db:v1';
const CHAT_IDB_STORE = 'chat-kv';
const CHAT_IDB_SESSIONS_KEY = 'sessions';
const CHAT_IDB_ACTIVE_SESSION_KEY = 'activeSessionId';

const DEFAULT_SETTINGS: ImageChatSettings = {
  model: 'gemini-3.1-flash-image-preview',
  aspectRatio: '1:1',
  numberOfImages: 1,
  thinkingLevel: 'minimal',
  includeThoughts: true,
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

let chatDbPromise: Promise<IDBDatabase> | null = null;

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    chatDbPromise = null;
  });
}

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
    for (const image of message.images ?? []) {
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

function createSession(title = '新对话'): ChatSession {
  const now = Date.now();
  return {
    id: `chat_${now}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

const normalizeGeneratedImage = (raw: unknown): GeneratedImage | null => {
  if (!raw || typeof raw !== 'object') return null;
  const image = raw as Partial<GeneratedImage>;
  if (typeof image.base64 !== 'string' || !image.base64) return null;
  const mimeType = typeof image.mimeType === 'string' && image.mimeType.startsWith('image/')
    ? image.mimeType
    : 'image/png';
  return {
    base64: image.base64,
    mimeType,
  };
};

const normalizeAssistantOrderedParts = (
  raw: unknown,
  images: GeneratedImage[],
  thinkingImages: GeneratedImage[]
): AssistantResponsePart[] | undefined => {
  if (!Array.isArray(raw)) return undefined;

  let mainImageCursor = 0;
  let thinkingImageCursor = 0;
  const normalized: AssistantResponsePart[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const part = item as Partial<AssistantResponsePart>;

    const type = part.type === 'text' || part.type === 'image' || part.type === 'other'
      ? part.type
      : 'other';
    const thought = typeof part.thought === 'boolean'
      ? part.thought
      : part.bucket === 'thinking';
    const bucket = part.bucket === 'thinking' || part.bucket === 'main' || part.bucket === 'other'
      ? part.bucket
      : (thought ? 'thinking' : 'main');
    const candidateIndex = typeof part.candidateIndex === 'number' && Number.isFinite(part.candidateIndex)
      ? part.candidateIndex
      : 0;
    const partIndex = typeof part.partIndex === 'number' && Number.isFinite(part.partIndex)
      ? part.partIndex
      : 0;

    const normalizedPart: AssistantResponsePart = {
      type,
      bucket,
      thought,
      raw: null,
      candidateIndex,
      partIndex,
    };

    if (type === 'text' && typeof part.text === 'string') {
      normalizedPart.text = part.text;
    }

    if (type === 'image') {
      const directImage = normalizeGeneratedImage((part as { image?: unknown }).image);
      if (directImage) {
        normalizedPart.image = directImage;
      } else {
        const useThinking = thought || bucket === 'thinking';
        const image = useThinking ? thinkingImages[thinkingImageCursor] : images[mainImageCursor];
        if (useThinking) {
          thinkingImageCursor += 1;
        } else {
          mainImageCursor += 1;
        }
        if (!image) continue;
        normalizedPart.image = image;
      }
    }

    normalized.push(normalizedPart);
  }

  return normalized.length > 0 ? normalized : undefined;
};

const getTextFromOrderedParts = (
  parts: AssistantResponsePart[] | undefined
): { content?: string; thinking?: string } => {
  if (!Array.isArray(parts) || parts.length === 0) return {};

  const content = parts
    .filter((part) => part.bucket === 'main' && part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text?.trim() ?? '')
    .filter((text) => Boolean(text))
    .join('\n\n');

  const thinking = parts
    .filter((part) => part.bucket === 'thinking' && part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text?.trim() ?? '')
    .filter((text) => Boolean(text))
    .join('\n\n');

  return {
    content: content || undefined,
    thinking: thinking || undefined,
  };
};

const normalizeMessage = (raw: unknown): ChatMessage | null => {
  if (!raw || typeof raw !== 'object') return null;
  const message = raw as Partial<ChatMessage> & { orderedParts?: unknown; thinkingImages?: unknown; images?: unknown };
  const timestamp = typeof message.timestamp === 'number' && Number.isFinite(message.timestamp)
    ? message.timestamp
    : Date.now();

  if (message.role === 'user') {
    if (typeof message.content !== 'string') return null;
    const attachments = Array.isArray(message.attachments)
      ? message.attachments.filter((attachment): attachment is string => typeof attachment === 'string')
      : [];
    return {
      role: 'user',
      content: message.content,
      attachments: attachments.length > 0 ? attachments : undefined,
      timestamp,
    };
  }

  if (message.role === 'assistant') {
    const images = Array.isArray(message.images)
      ? message.images
        .map((image) => normalizeGeneratedImage(image))
        .filter((image): image is GeneratedImage => Boolean(image))
      : [];
    const thinkingImages = Array.isArray(message.thinkingImages)
      ? message.thinkingImages
        .map((image) => normalizeGeneratedImage(image))
        .filter((image): image is GeneratedImage => Boolean(image))
      : [];
    const orderedParts = normalizeAssistantOrderedParts(message.orderedParts, images, thinkingImages);
    const orderedText = getTextFromOrderedParts(orderedParts);

    const normalizedAssistant: ChatAssistantMessage = {
      role: 'assistant',
      content: typeof message.content === 'string' && message.content.trim()
        ? message.content
        : orderedText.content,
      thinking: typeof message.thinking === 'string' && message.thinking.trim()
        ? message.thinking
        : orderedText.thinking,
      thinkingImages: thinkingImages.length > 0 ? thinkingImages : undefined,
      orderedParts,
      images,
      timestamp,
    };
    return normalizedAssistant;
  }

  return null;
};

function normalizeSession(raw: Partial<ChatSession>): ChatSession | null {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !raw.id.trim()) return null;
  const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt)
    ? raw.createdAt
    : Date.now();
  const updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt)
    ? raw.updatedAt
    : createdAt;
  const title = typeof raw.title === 'string' && raw.title.trim()
    ? raw.title.trim().slice(0, 80)
    : '新对话';
  const messages = Array.isArray(raw.messages)
    ? raw.messages
      .map((message) => normalizeMessage(message))
      .filter((message): message is ChatMessage => Boolean(message))
    : [];
  return {
    id: raw.id,
    title,
    createdAt,
    updatedAt,
    messages,
  };
}

function toPersistedSessions(sessions: ChatSession[]): ChatSession[] {
  return sessions.map((session) => ({
    ...session,
    messages: session.messages.map((message) => {
      if (message.role !== 'assistant') return message;

      const assistant = message as ChatAssistantMessage;
      // Do not persist heavy/unstable debug fields to reduce IndexedDB payload churn.
      return {
        role: 'assistant',
        content: assistant.content,
        thinking: assistant.thinking,
        thinkingImages: assistant.thinkingImages,
        orderedParts: assistant.orderedParts?.map((part) => ({
          type: part.type,
          bucket: part.bucket,
          thought: part.thought,
          text: part.type === 'text' ? part.text : undefined,
          image: part.type === 'image' ? part.image : undefined,
          candidateIndex: part.candidateIndex,
          partIndex: part.partIndex,
          raw: null,
        })),
        images: assistant.images,
        timestamp: assistant.timestamp,
      };
    }),
  }));
}

function persistSessions(sessions: ChatSession[]): void {
  void persistSessionsToIndexedDb(toPersistedSessions(sessions)).catch((err) => {
    pushDevLog('chat.storage', 'persist-failed', 'warn', {
      reason: err instanceof Error ? err.message : String(err),
      sessionCount: sessions.length,
      backend: 'indexedDB',
    });
  });
}

function persistActiveSessionId(sessionId: string): void {
  void idbSet(CHAT_IDB_ACTIVE_SESSION_KEY, sessionId).catch((err) => {
    pushDevLog('chat.storage', 'persist-failed', 'warn', {
      reason: err instanceof Error ? err.message : String(err),
      backend: 'indexedDB',
      key: 'activeSessionId',
    });
  });
}

const openChatDb = async (): Promise<IDBDatabase> => {
  if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
    throw new Error('indexedDB unavailable');
  }

  if (!chatDbPromise) {
    chatDbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(CHAT_IDB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CHAT_IDB_STORE)) {
          db.createObjectStore(CHAT_IDB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('failed to open indexedDB'));
      request.onblocked = () => reject(new Error('indexedDB blocked'));
    });
  }

  try {
    return await chatDbPromise;
  } catch (error) {
    chatDbPromise = null;
    throw error;
  }
};

const idbGet = async <T>(key: string): Promise<T | undefined> => {
  const db = await openChatDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(CHAT_IDB_STORE, 'readonly');
    const store = tx.objectStore(CHAT_IDB_STORE);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error ?? new Error(`indexedDB get failed: ${key}`));
  });
};

const idbSet = async (key: string, value: unknown): Promise<void> => {
  const db = await openChatDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CHAT_IDB_STORE, 'readwrite');
    const store = tx.objectStore(CHAT_IDB_STORE);
    try {
      store.put(value, key);
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`indexedDB set failed: ${key}`));
    tx.onabort = () => reject(tx.error ?? new Error(`indexedDB tx aborted: ${key}`));
  });
};

const persistSessionsToIndexedDb = async (sessions: ChatSession[]): Promise<void> => {
  await idbSet(CHAT_IDB_SESSIONS_KEY, sessions);
};

const readSessionsFromIndexedDb = async (): Promise<ChatSession[] | null> => {
  try {
    const raw = await idbGet<unknown>(CHAT_IDB_SESSIONS_KEY);
    if (!Array.isArray(raw)) return null;
    const sessions = raw
      .map((item) => normalizeSession(item as Partial<ChatSession>))
      .filter((item): item is ChatSession => Boolean(item))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return sessions.length > 0 ? sessions : null;
  } catch (err) {
    pushDevLog('chat.storage', 'read-failed', 'warn', {
      reason: err instanceof Error ? err.message : String(err),
      backend: 'indexedDB',
      key: CHAT_IDB_SESSIONS_KEY,
      policy: 'forward-only',
    });
    return null;
  }
};

const readActiveSessionIdFromIndexedDb = async (): Promise<string | null> => {
  try {
    const raw = await idbGet<unknown>(CHAT_IDB_ACTIVE_SESSION_KEY);
    return typeof raw === 'string' && raw.trim() ? raw : null;
  } catch (err) {
    pushDevLog('chat.storage', 'read-failed', 'warn', {
      reason: err instanceof Error ? err.message : String(err),
      backend: 'indexedDB',
      key: CHAT_IDB_ACTIVE_SESSION_KEY,
      policy: 'forward-only',
    });
    return null;
  }
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
  sessions: ChatSessionSummary[];
  activeSessionId: string;
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  settings: ImageChatSettings;
  setSettings: React.Dispatch<React.SetStateAction<ImageChatSettings>>;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  send: (content: string, attachments?: string[], baseMessagesOverride?: ChatMessage[]) => Promise<void>;
  cancel: () => void;
  newChat: () => void;
  retryFromMessage: (messageIndex: number) => Promise<void>;
  getMessageForEdit: (messageIndex: number) => { content: string; attachments: string[] } | null;
  deleteMessagesFrom: (messageIndex: number) => void;
}

export function useImageChat(): UseImageChatReturn {
  const [sessions, setSessions] = useState<ChatSession[]>(() => [createSession()]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettingsState] = useState<ImageChatSettings>(() => readSettingsFromStorage());
  const [storageHydrated, setStorageHydrated] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef<number | null>(null);
  const nextRequestIdRef = useRef(0);
  const sessionsRef = useRef<ChatSession[]>(sessions);
  const activeSessionIdRef = useRef(activeSessionId);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      activeRequestIdRef.current = null;
      abortControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    let cancelled = false;

    const hydrateFromIndexedDb = async () => {
      const indexedDbSessions = await readSessionsFromIndexedDb();
      // IndexedDB is the single source of persisted sessions in forward-only mode.
      const hydratedSessions = indexedDbSessions && indexedDbSessions.length > 0
        ? indexedDbSessions
        : [createSession()];

      const indexedDbActiveSessionId = await readActiveSessionIdFromIndexedDb();
      const hydratedActiveSessionId = indexedDbActiveSessionId && hydratedSessions.some((session) => session.id === indexedDbActiveSessionId)
        ? indexedDbActiveSessionId
        : hydratedSessions[0].id;

      if (cancelled) return;
      setSessions(hydratedSessions);
      setActiveSessionId(hydratedActiveSessionId);
      setStorageHydrated(true);
    };

    void hydrateFromIndexedDb().catch((err) => {
      pushDevLog('chat.storage', 'hydrate-failed', 'warn', {
        reason: err instanceof Error ? err.message : String(err),
      });
      if (cancelled) return;
      const fallbackSession = createSession();
      setSessions([fallbackSession]);
      setActiveSessionId(fallbackSession.id);
      setStorageHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!storageHydrated) return;
    persistSessions(sessions);
  }, [sessions, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) return;
    // 仅在校验失败时修复 activeSessionId
    if (sessions.length > 0 && !sessions.some((session) => session.id === activeSessionId)) {
      setActiveSessionId(sessions[0].id);
    }
  }, [activeSessionId, sessions, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) return;
    if (activeSessionId) {
      persistActiveSessionId(activeSessionId);
    }
  }, [activeSessionId, storageHydrated]);

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

  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? sessions[0];
  const messages = activeSession?.messages ?? [];

  const sessionsSummary: ChatSessionSummary[] = sessions
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((session) => ({
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: session.messages.length,
    }));

  const switchSession = useCallback((sessionId: string) => {
    if (!storageHydrated) return;
    if (!sessionId || sessionId === activeSessionId) return;
    if (!sessions.some((session) => session.id === sessionId)) return;
    abortControllerRef.current?.abort();
    activeRequestIdRef.current = null;
    abortControllerRef.current = null;
    setIsLoading(false);
    setError(null);
    setActiveSessionId(sessionId);
  }, [activeSessionId, sessions, storageHydrated]);

  const updateSessionMessages = useCallback((sessionId: string, nextMessages: ChatMessage[], titleOverride?: string) => {
    setSessions((prev) => {
      return prev.map((session) => {
        if (session.id !== sessionId) return session;
        const firstUserMessage = nextMessages.find((message) => message.role === 'user') as ChatUserMessage | undefined;
        const titleFromContent = firstUserMessage?.content?.trim()
          ? firstUserMessage.content.trim().slice(0, 30)
          : undefined;
        return {
          ...session,
          title: titleOverride ?? titleFromContent ?? session.title,
          updatedAt: Date.now(),
          messages: nextMessages,
        };
      });
    });
  }, []);

  const getCurrentSession = useCallback((): ChatSession | undefined => {
    const latestSessions = sessionsRef.current;
    return latestSessions.find((session) => session.id === activeSessionIdRef.current) ?? latestSessions[0];
  }, []);

  const sendToSession = useCallback(
    async (targetSessionId: string, content: string, attachments?: string[], baseMessagesOverride?: ChatMessage[]) => {
      if (!content.trim() && (!attachments || attachments.length === 0)) return;
      if (!storageHydrated) return;

      abortControllerRef.current?.abort();
      activeRequestIdRef.current = null;

      const latestSessions = sessionsRef.current;
      const targetSession = latestSessions.find((session) => session.id === targetSessionId);
      if (!targetSession) return;

      const controller = new AbortController();
      const requestId = nextRequestIdRef.current + 1;
      nextRequestIdRef.current = requestId;
      activeRequestIdRef.current = requestId;
      abortControllerRef.current = controller;
      const baseMessages = baseMessagesOverride ?? targetSession.messages;
      const trimmedContent = content.trim();
      const normalizedAttachments = attachments?.filter((a) => a.trim());
      const isCurrentRequest = () =>
        activeRequestIdRef.current === requestId && abortControllerRef.current === controller;

      const userMessage: ChatUserMessage = {
        role: 'user',
        content: trimmedContent,
        attachments: normalizedAttachments,
        timestamp: Date.now(),
      };

      updateSessionMessages(targetSessionId, [...baseMessages, userMessage]);
      setIsLoading(true);
      setError(null);

      try {
        const currentParts: ContentPart[] = [];
        if (trimmedContent) {
          currentParts.push({ type: 'text', text: trimmedContent });
        }
        for (const attachment of normalizedAttachments ?? []) {
          currentParts.push(dataUrlToImagePart(attachment));
        }

        const input: string | ChatContent[] =
          baseMessages.length === 0 && currentParts.length === 1 && currentParts[0].type === 'text'
            ? currentParts[0].text
            : [...buildHistoryContents(baseMessages), { role: 'user', parts: currentParts }];

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
          historyLength: baseMessages.length,
          hasAttachments: Boolean(normalizedAttachments && normalizedAttachments.length > 0),
        });

        const response = await chatImageGeneration(settings.model, input, config, controller.signal);
        if (!isCurrentRequest()) return;

        const assistantMessage: ChatAssistantMessage = {
          role: 'assistant',
          content: response.text?.trim() ? response.text.trim() : undefined,
          thinking: response.thinking?.trim() ? response.thinking.trim() : undefined,
          thinkingImages: response.thinkingImages,
          orderedParts: response.orderedParts,
          images: response.images,
          timestamp: Date.now(),
        };

        updateSessionMessages(targetSessionId, [...baseMessages, userMessage, assistantMessage]);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        if (!isCurrentRequest()) return;

        const errorMessage = err instanceof Error ? err.message : '生成失败，请重试';
        setError(errorMessage);

        const errorMessageContent: ChatAssistantMessage = {
          role: 'assistant',
          images: [],
          timestamp: Date.now(),
        };

        updateSessionMessages(targetSessionId, [
          ...baseMessages,
          userMessage,
          {
            ...errorMessageContent,
            content: `⚠️ ${errorMessage}`,
          },
        ]);
      } finally {
        if (isCurrentRequest()) {
          activeRequestIdRef.current = null;
          abortControllerRef.current = null;
          setIsLoading(false);
        }
      }
    }, [settings, storageHydrated, updateSessionMessages]);

  const send = useCallback(
    async (content: string, attachments?: string[], baseMessagesOverride?: ChatMessage[]) => {
      const currentSession = getCurrentSession();
      if (!currentSession) return;

      await sendToSession(currentSession.id, content, attachments, baseMessagesOverride);
    },
    [getCurrentSession, sendToSession]
  );

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    activeRequestIdRef.current = null;
    abortControllerRef.current = null;
    setIsLoading(false);
  }, []);

  const newChat = useCallback(() => {
    if (!storageHydrated) return;
    cancel();
    const session = createSession();
    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(session.id);
    setError(null);
  }, [cancel, storageHydrated]);

  const deleteSession = useCallback((sessionId: string) => {
    if (!storageHydrated) return;
    if (!sessionId) return;
    if (activeSessionId === sessionId) {
      abortControllerRef.current?.abort();
      activeRequestIdRef.current = null;
      abortControllerRef.current = null;
      setIsLoading(false);
    }

    setSessions((prev) => {
      const remaining = prev.filter((session) => session.id !== sessionId);
      if (remaining.length === 0) {
        const fallback = createSession();
        setActiveSessionId(fallback.id);
        return [fallback];
      }
      if (activeSessionId === sessionId) {
        setActiveSessionId(remaining[0].id);
      }
      return remaining;
    });
    setError(null);
  }, [activeSessionId, storageHydrated]);

  const retryFromMessage = useCallback(async (messageIndex: number) => {
    if (!storageHydrated) return;
    const currentSession = getCurrentSession();
    if (!currentSession) return;
    if (messageIndex < 0 || messageIndex >= currentSession.messages.length) return;

    const targetMessage = currentSession.messages[messageIndex];
    if (targetMessage.role !== 'user') return;

    // Cancel any ongoing request
    abortControllerRef.current?.abort();
    activeRequestIdRef.current = null;
    abortControllerRef.current = null;
    setIsLoading(false);

    // Keep only messages before the target message (delete target and after)
    const newMessages = currentSession.messages.slice(0, messageIndex);
    updateSessionMessages(currentSession.id, newMessages);

    // Re-send using the target message content (will create a new message)
    const userMsg = targetMessage as ChatUserMessage;
    await sendToSession(currentSession.id, userMsg.content, userMsg.attachments, newMessages);
  }, [getCurrentSession, sendToSession, storageHydrated, updateSessionMessages]);

  const getMessageForEdit = useCallback((messageIndex: number): { content: string; attachments: string[] } | null => {
    const currentSession = getCurrentSession();
    if (!currentSession) return null;
    if (messageIndex < 0 || messageIndex >= currentSession.messages.length) return null;

    const message = currentSession.messages[messageIndex];
    if (message.role !== 'user') return null;

    const userMsg = message as ChatUserMessage;
    return {
      content: userMsg.content,
      attachments: userMsg.attachments ?? [],
    };
  }, [getCurrentSession]);

  const deleteMessagesFrom = useCallback((messageIndex: number) => {
    if (!storageHydrated) return;
    const currentSession = getCurrentSession();
    if (!currentSession) return;
    if (messageIndex < 0 || messageIndex >= currentSession.messages.length) return;

    // Cancel any ongoing request
    abortControllerRef.current?.abort();
    activeRequestIdRef.current = null;
    abortControllerRef.current = null;
    setIsLoading(false);

    // Keep only messages before the target index
    const newMessages = currentSession.messages.slice(0, messageIndex);
    updateSessionMessages(currentSession.id, newMessages);
    setError(null);
  }, [getCurrentSession, storageHydrated, updateSessionMessages]);

  return {
    sessions: sessionsSummary,
    activeSessionId,
    messages,
    isLoading,
    error,
    settings,
    setSettings,
    switchSession,
    deleteSession,
    send,
    cancel,
    newChat,
    retryFromMessage,
    getMessageForEdit,
    deleteMessagesFrom,
  };
}
