import type { ChatContextPart, ChatContextTurn } from '../types';

const EXTRA_CONTEXT_PART_KEYS = [
  'functionCall',
  'functionResponse',
  'toolCall',
  'toolResponse',
  'executableCode',
  'codeExecutionResult',
  'mediaResolution',
  'videoMetadata',
  'partMetadata',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const safeCloneJson = (value: unknown): unknown => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
};

const normalizeInlineData = (value: unknown): ChatContextPart['inlineData'] | undefined => {
  if (!isRecord(value)) return undefined;
  if (typeof value.data !== 'string' || !value.data) return undefined;
  if (typeof value.mimeType !== 'string' || !value.mimeType) return undefined;
  return {
    data: value.data,
    mimeType: value.mimeType,
  };
};

const normalizeFileData = (value: unknown): ChatContextPart['fileData'] | undefined => {
  if (!isRecord(value)) return undefined;
  if (typeof value.fileUri !== 'string' || !value.fileUri) return undefined;
  return {
    fileUri: value.fileUri,
    mimeType: typeof value.mimeType === 'string' && value.mimeType ? value.mimeType : undefined,
  };
};

export const normalizeChatContextPart = (value: unknown): ChatContextPart | null => {
  if (!isRecord(value)) return null;

  const part: ChatContextPart = {};

  if (typeof value.text === 'string' && value.text) {
    part.text = value.text;
  }

  const inlineData = normalizeInlineData(value.inlineData);
  if (inlineData) {
    part.inlineData = inlineData;
  }

  const fileData = normalizeFileData(value.fileData);
  if (fileData) {
    part.fileData = fileData;
  }

  if (typeof value.thought === 'boolean') {
    part.thought = value.thought;
  }

  if (typeof value.thoughtSignature === 'string' && value.thoughtSignature.trim()) {
    part.thoughtSignature = value.thoughtSignature;
  }

  for (const key of EXTRA_CONTEXT_PART_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const cloned = safeCloneJson(value[key]);
    if (cloned !== undefined) {
      part[key] = cloned;
    }
  }

  return Object.keys(part).length > 0 ? part : null;
};

export const normalizeChatContextTurn = (raw: unknown): ChatContextTurn | null => {
  if (!isRecord(raw)) return null;
  if (raw.role !== 'user' && raw.role !== 'model') return null;
  if (!Array.isArray(raw.parts)) return null;

  const parts = raw.parts
    .map((part) => normalizeChatContextPart(part))
    .filter((part): part is ChatContextPart => Boolean(part));

  if (parts.length === 0) return null;

  return {
    role: raw.role,
    parts,
  };
};
