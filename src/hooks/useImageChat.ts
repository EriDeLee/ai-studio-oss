import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  ChatContextPart,
  ChatContextTurn,
  ChatMessage,
  ChatUserMessage,
  ChatAssistantMessage,
  ChatSession,
  ChatSessionSummary,
  ImageChatSettings,
  GeneratedImage,
  AssistantResponsePart,
  ModelContextTurn,
} from '../types';
import { chatImageGeneration } from '../lib/gemini';
import type { ChatGenerationConfig } from '../lib/gemini';
import { stripDataUrlPrefix } from '../lib/utils';
import { pushDevLog } from '../lib/devConsole';
import { normalizeChatContextTurn } from '../lib/chatContext';
import {
  DEFAULT_IMAGE_CHAT_SETTINGS,
  getDefaultAspectRatio,
  isImageModel,
  normalizeAspectRatioForModel,
  normalizeImageSizeForModel,
  normalizeSearchToolsForModel,
  normalizeThinkingLevelForModel,
  supportsThinkingConfig,
} from '../config/imageModelCapabilities';

const SETTINGS_STORAGE_KEY = 'ai-studio:image-chat-settings:v4';
const SETTINGS_EVENT_NAME = 'ai-studio:image-chat-settings-updated';
// Forward-only policy: chat sessions are persisted in IndexedDB only.
// We intentionally do not migrate or fallback to legacy localStorage chat session keys.
const CHAT_IDB_NAME = 'ai-studio:image-chat-db:v4';
const CHAT_IDB_STORE = 'chat-kv';
const CHAT_IDB_SESSIONS_KEY = 'sessions';
const CHAT_IDB_ACTIVE_SESSION_KEY = 'activeSessionId';

const isResponseModality = (value: unknown): value is NonNullable<ImageChatSettings['responseModality']> => {
  return value === 'text_image' || value === 'image';
};

type ImageMimeType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/heic'
  | 'image/heif'
  | 'image/gif'
  | 'image/bmp'
  | 'image/tiff';

type UserContextPart =
  | { text: string }
  | { inlineData: { data: string; mimeType: ImageMimeType } };

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

const dataUrlToImagePart = (dataUrl: string): UserContextPart => ({
  inlineData: {
    data: stripDataUrlPrefix(dataUrl),
    mimeType: getMimeTypeFromDataUrl(dataUrl),
  },
});

const normalizeContextTurn = (raw: unknown): ChatContextTurn | null => normalizeChatContextTurn(raw);

const buildUserContextTurn = (content: string, attachments?: string[]): ChatContextTurn | null => {
  const parts: UserContextPart[] = [];
  const trimmedContent = content.trim();
  if (trimmedContent) {
    parts.push({ text: trimmedContent });
  }
  for (const attachment of attachments ?? []) {
    parts.push(dataUrlToImagePart(attachment));
  }
  if (parts.length === 0) return null;
  return {
    role: 'user',
    parts: parts as ChatContextPart[],
  };
};

const buildHistoryContents = (messages: ChatMessage[]): ChatContextTurn[] => {
  const history: ChatContextTurn[] = [];

  for (const message of messages) {
    const normalizedContextTurn = normalizeContextTurn((message as { contextTurn?: unknown }).contextTurn);
    if (
      normalizedContextTurn
      && ((message.role === 'user' && normalizedContextTurn.role === 'user')
        || (message.role === 'assistant' && normalizedContextTurn.role === 'model'))
    ) {
      history.push(normalizedContextTurn);
      continue;
    }

    if (message.role === 'user') {
      const fallbackUserTurn = buildUserContextTurn(message.content, message.attachments);
      if (fallbackUserTurn) {
        history.push(fallbackUserTurn);
      }
      continue;
    }

    if (message.kind !== 'normal') {
      continue;
    }

    const parts: ChatContextPart[] = [];
    if (message.content?.trim()) {
      parts.push({ text: message.content.trim() });
    }
    for (const image of message.images ?? []) {
      parts.push({
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
  const candidate = raw as { base64?: unknown; mimeType?: unknown };
  if (typeof candidate.base64 !== 'string' || !candidate.base64) return null;
  const mimeType = typeof candidate.mimeType === 'string' && candidate.mimeType.startsWith('image/')
    ? candidate.mimeType
    : 'image/png';
  return {
    base64: candidate.base64,
    mimeType,
  };
};

const normalizeAssistantOrderedParts = (raw: unknown): AssistantResponsePart[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const normalized: AssistantResponsePart[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const part = item as {
      type?: unknown;
      bucket?: unknown;
      thought?: unknown;
      text?: unknown;
      image?: unknown;
      candidateIndex?: unknown;
      partIndex?: unknown;
    };

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
      if (!directImage) {
        continue;
      }
      normalizedPart.image = directImage;
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
  const message = raw as {
    role?: unknown;
    content?: unknown;
    attachments?: unknown;
    contextTurn?: unknown;
    timestamp?: unknown;
    kind?: unknown;
    errorMessage?: unknown;
    orderedParts?: unknown;
    thinking?: unknown;
    thinkingImages?: unknown;
    images?: unknown;
  };
  const timestamp = typeof message.timestamp === 'number' && Number.isFinite(message.timestamp)
    ? message.timestamp
    : Date.now();

  if (message.role === 'user') {
    if (typeof message.content !== 'string') return null;
    const attachments = Array.isArray(message.attachments)
      ? message.attachments.filter((attachment): attachment is string => typeof attachment === 'string')
      : [];
    const contextTurn = normalizeContextTurn(message.contextTurn);
    return {
      role: 'user',
      content: message.content,
      attachments: attachments.length > 0 ? attachments : undefined,
      contextTurn: contextTurn?.role === 'user' ? contextTurn : undefined,
      timestamp,
    };
  }

  if (message.role === 'assistant') {
    if (message.kind !== 'normal' && message.kind !== 'error') {
      return null;
    }
    if (message.kind === 'error') {
      if (typeof message.errorMessage !== 'string' || !message.errorMessage.trim()) {
        return null;
      }
      return {
        role: 'assistant',
        kind: 'error',
        errorMessage: message.errorMessage.trim(),
        images: [],
        timestamp,
      };
    }

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
    const orderedParts = normalizeAssistantOrderedParts(message.orderedParts);
    const orderedText = getTextFromOrderedParts(orderedParts);

    const normalizedAssistant: ChatAssistantMessage = {
      role: 'assistant',
      kind: 'normal',
      content: typeof message.content === 'string' && message.content.trim()
        ? message.content
        : orderedText.content,
      thinking: typeof message.thinking === 'string' && message.thinking.trim()
        ? message.thinking
        : orderedText.thinking,
      thinkingImages: thinkingImages.length > 0 ? thinkingImages : undefined,
      orderedParts,
      contextTurn: (() => {
        const turn = normalizeContextTurn(message.contextTurn);
        if (turn && turn.role === 'model') return turn as ModelContextTurn;
        return undefined;
      })(),
      images,
      timestamp,
    };
    return normalizedAssistant;
  }

  return null;
};

function normalizeSession(raw: unknown): ChatSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const session = raw as {
    id?: unknown;
    title?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
    messages?: unknown;
  };
  if (typeof session.id !== 'string' || !session.id.trim()) return null;
  const createdAt = typeof session.createdAt === 'number' && Number.isFinite(session.createdAt)
    ? session.createdAt
    : Date.now();
  const updatedAt = typeof session.updatedAt === 'number' && Number.isFinite(session.updatedAt)
    ? session.updatedAt
    : createdAt;
  const title = typeof session.title === 'string' && session.title.trim()
    ? session.title.trim().slice(0, 80)
    : '新对话';
  const messages = Array.isArray(session.messages)
    ? session.messages
      .map((message) => normalizeMessage(message))
      .filter((message): message is ChatMessage => Boolean(message))
    : [];
  return {
    id: session.id,
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
      if (message.kind === 'error') {
        return {
          role: 'assistant',
          kind: 'error',
          errorMessage: message.errorMessage ?? '生成失败，请重试',
          images: [],
          timestamp: message.timestamp,
        };
      }

      // Do not persist heavy/unstable debug fields to reduce IndexedDB payload churn.
      return {
        role: 'assistant',
        kind: 'normal',
        content: message.content,
        thinking: message.thinking,
        thinkingImages: message.thinkingImages,
        contextTurn: message.contextTurn,
        orderedParts: message.orderedParts?.map((part) => ({
          type: part.type,
          bucket: part.bucket,
          thought: part.thought,
          text: part.type === 'text' ? part.text : undefined,
          image: part.type === 'image' ? part.image : undefined,
          candidateIndex: part.candidateIndex,
          partIndex: part.partIndex,
          raw: null,
        })),
        images: message.images,
        timestamp: message.timestamp,
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
      .map((item) => normalizeSession(item))
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

function normalizeSettings(input: unknown): ImageChatSettings {
  if (!input || typeof input !== 'object') return { ...DEFAULT_IMAGE_CHAT_SETTINGS };
  const candidate = input as Record<string, unknown>;
  const next: ImageChatSettings = { ...DEFAULT_IMAGE_CHAT_SETTINGS };

  if (isImageModel(candidate.model)) {
    next.model = candidate.model;
  }

  next.aspectRatio = normalizeAspectRatioForModel(next.model, candidate.aspectRatio)
    || getDefaultAspectRatio(next.model);

  next.imageSize = normalizeImageSizeForModel(next.model, candidate.imageSize);

  if (supportsThinkingConfig(next.model)) {
    next.thinkingLevel = normalizeThinkingLevelForModel(next.model, candidate.thinkingLevel, next.thinkingLevel);
  } else {
    next.thinkingLevel = DEFAULT_IMAGE_CHAT_SETTINGS.thinkingLevel;
  }

  if (isResponseModality(candidate.responseModality)) {
    next.responseModality = candidate.responseModality;
  }

  const normalizedTools = normalizeSearchToolsForModel(
    next.model,
    candidate.enableGoogleSearch,
    candidate.enableImageSearch
  );
  next.enableGoogleSearch = normalizedTools.enableGoogleSearch;
  next.enableImageSearch = normalizedTools.enableImageSearch;

  return next;
}

function readSettingsFromStorage(): ImageChatSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_IMAGE_CHAT_SETTINGS };

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_IMAGE_CHAT_SETTINGS };
    const parsed = JSON.parse(raw);
    return normalizeSettings(parsed);
  } catch {
    return { ...DEFAULT_IMAGE_CHAT_SETTINGS };
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

  const setSessionsWithRef = useCallback((updater: React.SetStateAction<ChatSession[]>) => {
    const next = typeof updater === 'function'
      ? (updater as (prevState: ChatSession[]) => ChatSession[])(sessionsRef.current)
      : updater;
    sessionsRef.current = next;
    setSessions(next);
  }, []);

  const setActiveSessionIdWithRef = useCallback((sessionId: string) => {
    activeSessionIdRef.current = sessionId;
    setActiveSessionId(sessionId);
  }, []);

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
      setSessionsWithRef(hydratedSessions);
      setActiveSessionIdWithRef(hydratedActiveSessionId);
      setStorageHydrated(true);
    };

    void hydrateFromIndexedDb().catch((err) => {
      pushDevLog('chat.storage', 'hydrate-failed', 'warn', {
        reason: err instanceof Error ? err.message : String(err),
      });
      if (cancelled) return;
      const fallbackSession = createSession();
      setSessionsWithRef([fallbackSession]);
      setActiveSessionIdWithRef(fallbackSession.id);
      setStorageHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, [setActiveSessionIdWithRef, setSessionsWithRef]);

  useEffect(() => {
    if (!storageHydrated) return;
    persistSessions(sessions);
  }, [sessions, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) return;
    // 仅在校验失败时修复 activeSessionId
    if (sessions.length > 0 && !sessions.some((session) => session.id === activeSessionId)) {
      setActiveSessionIdWithRef(sessions[0].id);
    }
  }, [activeSessionId, sessions, setActiveSessionIdWithRef, storageHydrated]);

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
  const messages = activeSession ? activeSession.messages : [];

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
    setActiveSessionIdWithRef(sessionId);
  }, [activeSessionId, sessions, setActiveSessionIdWithRef, storageHydrated]);

  const updateSessionMessages = useCallback((sessionId: string, nextMessages: ChatMessage[], titleOverride?: string) => {
    setSessionsWithRef((prev) => {
      return prev.map((session) => {
        if (session.id !== sessionId) return session;
        const firstUserMessage = nextMessages.find(
          (message): message is ChatUserMessage => message.role === 'user'
        );
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
  }, [setSessionsWithRef]);

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

      const userContextTurn = buildUserContextTurn(trimmedContent, normalizedAttachments);
      if (!userContextTurn) {
        activeRequestIdRef.current = null;
        abortControllerRef.current = null;
        return;
      }

      const userMessage: ChatUserMessage = {
        role: 'user',
        content: trimmedContent,
        attachments: normalizedAttachments,
        contextTurn: userContextTurn,
        timestamp: Date.now(),
      };

      updateSessionMessages(targetSessionId, [...baseMessages, userMessage]);
      setIsLoading(true);
      setError(null);

      try {
        const input: string | ChatContextTurn[] =
          baseMessages.length === 0
          && userContextTurn.parts.length === 1
          && typeof userContextTurn.parts[0]?.text === 'string'
            ? userContextTurn.parts[0].text
            : [...buildHistoryContents(baseMessages), userContextTurn];

        const config: ChatGenerationConfig = {
          aspectRatio: settings.aspectRatio,
          responseModality: settings.responseModality,
          enableGoogleSearch: settings.enableGoogleSearch,
          enableImageSearch: settings.enableImageSearch,
        };
        if (supportsThinkingConfig(settings.model)) {
          config.thinkingLevel = settings.thinkingLevel;
        }
        if (settings.imageSize) config.imageSize = settings.imageSize;

        pushDevLog('chat.send', 'request-config', 'info', {
          model: settings.model,
          thinkingLevel: config.thinkingLevel,
          responseModality: config.responseModality,
          historyLength: baseMessages.length,
          hasAttachments: Boolean(normalizedAttachments && normalizedAttachments.length > 0),
        });

        const response = await chatImageGeneration(settings.model, input, config, controller.signal);
        if (!isCurrentRequest()) return;

        const assistantMessage: ChatAssistantMessage = {
          role: 'assistant',
          kind: 'normal',
          content: response.text?.trim() ? response.text.trim() : undefined,
          thinking: response.thinking?.trim() ? response.thinking.trim() : undefined,
          thinkingImages: response.thinkingImages,
          orderedParts: response.orderedParts,
          contextTurn: response.modelContextTurn,
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
          kind: 'error',
          errorMessage,
          images: [],
          timestamp: Date.now(),
        };

        updateSessionMessages(targetSessionId, [
          ...baseMessages,
          userMessage,
          errorMessageContent,
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
    setSessionsWithRef((prev) => [session, ...prev]);
    setActiveSessionIdWithRef(session.id);
    setError(null);
  }, [cancel, setActiveSessionIdWithRef, setSessionsWithRef, storageHydrated]);

  const deleteSession = useCallback((sessionId: string) => {
    if (!storageHydrated) return;
    if (!sessionId) return;
    if (activeSessionId === sessionId) {
      abortControllerRef.current?.abort();
      activeRequestIdRef.current = null;
      abortControllerRef.current = null;
      setIsLoading(false);
    }

    setSessionsWithRef((prev) => {
      const remaining = prev.filter((session) => session.id !== sessionId);
      if (remaining.length === 0) {
        const fallback = createSession();
        setActiveSessionIdWithRef(fallback.id);
        return [fallback];
      }
      if (activeSessionId === sessionId) {
        setActiveSessionIdWithRef(remaining[0].id);
      }
      return remaining;
    });
    setError(null);
  }, [activeSessionId, setActiveSessionIdWithRef, setSessionsWithRef, storageHydrated]);

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
    await sendToSession(currentSession.id, targetMessage.content, targetMessage.attachments, newMessages);
  }, [getCurrentSession, sendToSession, storageHydrated, updateSessionMessages]);

  const getMessageForEdit = useCallback((messageIndex: number): { content: string; attachments: string[] } | null => {
    const currentSession = getCurrentSession();
    if (!currentSession) return null;
    if (messageIndex < 0 || messageIndex >= currentSession.messages.length) return null;

    const message = currentSession.messages[messageIndex];
    if (message.role !== 'user') return null;

    return {
      content: message.content,
      attachments: message.attachments ?? [],
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
