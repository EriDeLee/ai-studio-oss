import { GoogleGenAI } from '@google/genai';
import type { Candidate, GenerateContentConfig, GenerateContentResponse, Part, Tool } from '@google/genai';
import type {
  AssistantResponsePart,
  ChatContextPart,
  ChatContextTurn,
  GeneratedImage,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageModel,
  ModelContextTurn,
  ResponseModality,
  ThinkingLevel,
} from '../../types';
import { pushDevLog } from '../devConsole';
import { stripDataUrlPrefix } from '../utils';
import {
  normalizeAspectRatioForModel,
  normalizeImageSizeForModel,
  normalizeSearchToolsForModel,
  supportsThinkingConfig,
  supportsThinkingLevelParam,
} from '../../config/imageModelCapabilities';
import { normalizeChatContextPart } from '../chatContext';

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

type GeminiGenerationConfig = Pick<
  GenerateContentConfig,
  'imageConfig' | 'thinkingConfig' | 'responseModalities'
>;

export interface ChatGenerationConfig {
  aspectRatio?: string;
  imageSize?: string;
  thinkingLevel?: ThinkingLevel;
  responseModality?: ResponseModality;
  enableGoogleSearch?: boolean;
  enableImageSearch?: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const summarizeContentPart = (part: unknown) => {
  if (!isRecord(part)) {
    return { type: typeof part };
  }

  if (typeof part.text === 'string') {
    const text = String(part.text ?? '');
    return { type: 'text', textLength: text.length };
  }

  if (isRecord(part.inlineData)) {
    const data = String(part.inlineData.data ?? '');
    return {
      type: 'image',
      mimeType: String(part.inlineData.mimeType ?? ''),
      base64Length: data.length,
    };
  }

  return { type: String(part.type ?? 'unknown') };
};

const summarizeContentsForLog = (contents: unknown) => {
  if (typeof contents === 'string') {
    return { kind: 'text', textLength: contents.length };
  }
  if (!Array.isArray(contents)) {
    return { kind: typeof contents };
  }

  return {
    kind: 'list',
    items: contents.map((item) => {
      if (isRecord(item) && Array.isArray(item.parts)) {
        return {
          role: String(item.role ?? 'unknown'),
          parts: item.parts.map(summarizeContentPart),
        };
      }
      return summarizeContentPart(item);
    }),
  };
};

const extractCandidates = (response: GenerateContentResponse): Candidate[] => {
  return Array.isArray(response.candidates) ? response.candidates : [];
};

const parseThoughtFlag = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  }
  return false;
};

const isThoughtPart = (part: Part): boolean => {
  return parseThoughtFlag((part as { thought?: unknown }).thought);
};

const summarizeResponseForLog = (response: GenerateContentResponse) => {
  const candidates = extractCandidates(response);

  return {
    candidateCount: candidates.length,
    candidates: candidates.map((candidate, idx) => {
      const parts = Array.isArray(candidate.content?.parts) ? candidate.content.parts : [];

      const summarizedParts = parts.map((part, partIndex) => {
        if (part.inlineData) {
          const mimeType = String(part.inlineData.mimeType ?? '');
          const data = String(part.inlineData.data ?? '');
          return {
            partIndex,
            source: 'inlineData',
            thought: isThoughtPart(part),
            mimeType,
            dataLength: data.length,
            dataHead: data.slice(0, 24),
          };
        }

        if (part.fileData?.fileUri) {
          const uri = String(part.fileData.fileUri);
          const mimeMatch = uri.match(/^data:([^;]+);base64,/i);
          return {
            partIndex,
            source: 'fileData',
            thought: isThoughtPart(part),
            mimeType: mimeMatch ? mimeMatch[1] : '',
            uriLength: uri.length,
            uriHead: uri.slice(0, 64),
          };
        }

        return {
          partIndex,
          source: part.text !== undefined ? 'text' : 'other',
          thought: isThoughtPart(part),
          textLength: typeof part.text === 'string' ? part.text.length : 0,
          thoughtSignature: (() => {
            const raw = (part as { thoughtSignature?: unknown }).thoughtSignature;
            return typeof raw === 'string' && raw.trim().length > 0;
          })(),
        };
      });

      const imagePartCount = summarizedParts.filter((part) => {
        if (!('mimeType' in part)) return false;
        return typeof part.mimeType === 'string' && part.mimeType.startsWith('image/');
      }).length;

      return {
        index: idx,
        finishReason: candidate.finishReason,
        partCount: parts.length,
        imagePartCount,
        parts: summarizedParts,
      };
    }),
  };
};

const toGeminiThinkingLevel = (
  thinkingLevel: 'minimal' | 'high'
): NonNullable<NonNullable<GenerateContentConfig['thinkingConfig']>['thinkingLevel']> => {
  return (thinkingLevel === 'high' ? 'HIGH' : 'MINIMAL') as NonNullable<
    NonNullable<GenerateContentConfig['thinkingConfig']>['thinkingLevel']
  >;
};

const getApiKey = (): string => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing Gemini API key: set VITE_GEMINI_API_KEY or GEMINI_API_KEY');
  }
  return apiKey;
};

const getBaseUrl = (): string | undefined => {
  return import.meta.env.VITE_GEMINI_BASE_URL || import.meta.env.GEMINI_API_BASE_URL;
};

let client: GoogleGenAI | null = null;

const getClient = (): GoogleGenAI => {
  if (!client) {
    const baseUrl = getBaseUrl();
    client = new GoogleGenAI({
      apiKey: getApiKey(),
      ...(baseUrl ? { httpOptions: { baseUrl } } : {}),
    });
  }
  return client;
};

const buildContents = (request: ImageGenerationRequest): string | ContentPart[] => {
  switch (request.type) {
    case 'text-to-image':
      return request.prompt;

    case 'image-to-image': {
      const parts: ContentPart[] = [
        { type: 'text', text: request.prompt },
        ...request.referenceImages.map((img, i) => ({
          type: 'image' as const,
          inlineData: {
            data: stripDataUrlPrefix(img),
            mimeType: (request.referenceImageMimeTypes?.[i] ?? 'image/png') as ImageMimeType,
          },
        })),
      ];
      return parts;
    }

    case 'inpainting': {
      const parts: ContentPart[] = [
        { type: 'text', text: request.prompt },
        ...request.referenceImages.map((img, i) => ({
          type: 'image' as const,
          inlineData: {
            data: stripDataUrlPrefix(img),
            mimeType: (request.referenceImageMimeTypes?.[i] ?? 'image/png') as ImageMimeType,
          },
        })),
      ];

      if (request.maskImage) {
        parts.push({
          type: 'image',
          inlineData: {
            data: stripDataUrlPrefix(request.maskImage),
            mimeType: 'image/png',
          },
        });
      }

      return parts;
    }

    default: {
      const exhaustiveCheck: never = request;
      throw new Error(`Unsupported request type: ${String(exhaustiveCheck)}`);
    }
  }
};

const toGeminiResponseModalities = (responseModality?: ResponseModality): string[] => {
  return responseModality === 'image' ? ['IMAGE'] : ['TEXT', 'IMAGE'];
};

interface OfficialRequestConfigInput {
  model: ImageModel;
  aspectRatio?: string;
  imageSize?: string;
  thinkingLevel?: ThinkingLevel;
  responseModality?: ResponseModality;
}

const buildOfficialGenerationConfig = (input: OfficialRequestConfigInput): GeminiGenerationConfig => {
  const config: GeminiGenerationConfig = {
    responseModalities: toGeminiResponseModalities(input.responseModality),
  };

  const imageConfig: GeminiGenerationConfig['imageConfig'] = {};
  if (input.aspectRatio) {
    const aspectRatio = normalizeAspectRatioForModel(input.model, input.aspectRatio);
    if (aspectRatio) {
      imageConfig.aspectRatio = aspectRatio;
    }
  }
  if (input.imageSize) {
    const imageSize = normalizeImageSizeForModel(input.model, input.imageSize);
    if (imageSize) {
      imageConfig.imageSize = imageSize;
    }
  }
  if (Object.keys(imageConfig).length > 0) {
    config.imageConfig = imageConfig;
  }

  if (supportsThinkingConfig(input.model)) {
    const thinkingConfig: NonNullable<GeminiGenerationConfig['thinkingConfig']> = {
      includeThoughts: true,
    };
    if (supportsThinkingLevelParam(input.model)) {
      thinkingConfig.thinkingLevel = toGeminiThinkingLevel(input.thinkingLevel ?? 'minimal');
    }
    config.thinkingConfig = thinkingConfig;
  }

  return config;
};

const buildTools = (
  model?: ImageModel,
  enableGoogleSearch?: boolean,
  enableImageSearch?: boolean
): Tool[] | undefined => {
  if (!model) return undefined;
  const normalizedTools = normalizeSearchToolsForModel(model, enableGoogleSearch, enableImageSearch);
  if (!normalizedTools.enableGoogleSearch) return undefined;

  if (normalizedTools.enableImageSearch) {
    return [
      {
        googleSearch: {
          searchTypes: {
            webSearch: {},
            imageSearch: {},
          },
        },
      },
    ];
  }

  return [{ googleSearch: {} }];
};

const extractImageFromPart = (part: Part): GeneratedImage | null => {
  if (hasOwnProp(part, 'inlineData') && part.inlineData && typeof part.inlineData === 'object') {
    const inlineData = part.inlineData as { mimeType?: unknown; data?: unknown };
    const mimeType = String(inlineData.mimeType ?? 'image/png');
    if (!mimeType.startsWith('image/')) return null;

    const base64 = String(inlineData.data ?? '');
    if (!base64) return null;

    return { base64, mimeType };
  }

  if (hasOwnProp(part, 'fileData') && part.fileData && typeof part.fileData === 'object') {
    const fileData = part.fileData as { fileUri?: unknown };
    if (!fileData.fileUri) return null;
    const uri = String(fileData.fileUri);
    const mimeMatch = uri.match(/^data:([^;]+);base64,/i);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    if (!mimeType.startsWith('image/')) return null;

    const rawBase64 = stripDataUrlPrefix(uri);
    if (!rawBase64) return null;

    return { base64: rawBase64, mimeType };
  }

  return null;
};

const extractImagesFromResponse = (
  response: GenerateContentResponse,
  imageThoughtState: 'thought' | 'final'
): GeneratedImage[] => {
  const images: GeneratedImage[] = [];

  for (const candidate of extractCandidates(response)) {
    if (!Array.isArray(candidate.content?.parts)) continue;

    for (const part of candidate.content.parts) {
      const thoughtPart = isThoughtPart(part);
      const matchThoughtState = imageThoughtState === 'thought' ? thoughtPart : !thoughtPart;
      if (!matchThoughtState) continue;

      const image = extractImageFromPart(part);
      if (image) {
        images.push(image);
      }
    }
  }

  return images;
};

const extractOrderedPartsFromResponse = (response: GenerateContentResponse): AssistantResponsePart[] => {
  const orderedParts: AssistantResponsePart[] = [];
  const candidates = extractCandidates(response);

  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const candidate = candidates[candidateIndex];
    if (!Array.isArray(candidate.content?.parts)) continue;

    for (let partIndex = 0; partIndex < candidate.content.parts.length; partIndex += 1) {
      const part = candidate.content.parts[partIndex];
      const thought = isThoughtPart(part);
      const bucket = thought ? 'thinking' : 'main';

      if (typeof part.text === 'string') {
        orderedParts.push({
          type: 'text',
          bucket,
          thought,
          text: part.text,
          raw: part,
          candidateIndex,
          partIndex,
        });
        continue;
      }

      const image = extractImageFromPart(part);
      if (image) {
        orderedParts.push({
          type: 'image',
          bucket,
          thought,
          image,
          raw: part,
          candidateIndex,
          partIndex,
        });
        continue;
      }

      orderedParts.push({
        type: 'other',
        bucket: 'other',
        thought,
        raw: part,
        candidateIndex,
        partIndex,
      });
    }
  }

  return orderedParts;
};

const toSerializableContextPart = (part: Part): ChatContextPart | null => {
  return normalizeChatContextPart(part);
};

const extractModelContextTurn = (response: GenerateContentResponse): ModelContextTurn | undefined => {
  const parts: ChatContextPart[] = [];

  for (const candidate of extractCandidates(response)) {
    if (!Array.isArray(candidate.content?.parts)) continue;
    for (const part of candidate.content.parts) {
      const serializablePart = toSerializableContextPart(part);
      if (serializablePart) {
        parts.push(serializablePart);
      }
    }
  }

  if (parts.length === 0) return undefined;
  return {
    role: 'model',
    parts,
  };
};

const bucketTextFromOrderedParts = (
  parts: AssistantResponsePart[]
): { text?: string; thinking?: string } => {
  const mainTexts = parts
    .filter((part) => part.bucket === 'main' && part.type === 'text')
    .map((part) => part.text ?? '');
  const thinkingTexts = parts
    .filter((part) => part.bucket === 'thinking' && part.type === 'text')
    .map((part) => part.text ?? '');

  return {
    text: mainTexts.length > 0 ? mainTexts.join('\n\n') : undefined,
    thinking: thinkingTexts.length > 0 ? thinkingTexts.join('\n\n') : undefined,
  };
};

const hasOwnProp = <K extends string>(value: object, key: K): value is Record<K, unknown> => {
  return Object.prototype.hasOwnProperty.call(value, key);
};

/**
 * Execute a one-shot image generation request.
 */
export const generateImage = async (
  request: ImageGenerationRequest,
  signal?: AbortSignal
): Promise<ImageGenerationResponse> => {
  const ai = getClient();

  const contents = buildContents(request);
  const generationConfig = buildOfficialGenerationConfig({
    model: request.model,
    responseModality: request.type === 'text-to-image' ? request.responseModality : undefined,
    aspectRatio: request.type === 'text-to-image' ? request.aspectRatio : undefined,
    imageSize: request.type === 'text-to-image' ? request.imageSize : undefined,
    thinkingLevel: request.type === 'text-to-image' ? request.thinkingLevel : undefined,
  });
  const tools = buildTools(
    request.model,
    request.type === 'text-to-image' ? request.enableGoogleSearch : undefined,
    request.type === 'text-to-image' ? request.enableImageSearch : undefined
  );

  const executeRequest = async () => {
    const response = await ai.models.generateContent({
      model: request.model,
      contents,
      config: {
        ...(Object.keys(generationConfig).length > 0 ? generationConfig : {}),
        ...(tools ? { tools } : {}),
      },
      ...(signal ? { signal } : {}),
    });

    return response;
  };

  const response = await executeRequest();
  const orderedParts = extractOrderedPartsFromResponse(response);
  const modelContextTurn = extractModelContextTurn(response);
  const images = extractImagesFromResponse(response, 'final');
  const thinkingImages = extractImagesFromResponse(response, 'thought');
  const { text: bucketedText, thinking } = bucketTextFromOrderedParts(orderedParts);
  const text = response.text?.trim() ? response.text.trim() : bucketedText;

  return {
    images,
    text,
    thinking,
    thinkingImages,
    orderedParts,
    modelContextTurn,
    model: request.model,
  };
};

/**
 * Continue image generation in multi-turn chat context.
 */
export const chatImageGeneration = async (
  model: ImageModel,
  input: string | ChatContextTurn[],
  config: ChatGenerationConfig,
  signal?: AbortSignal
): Promise<ImageGenerationResponse> => {
  const ai = getClient();

  const enableGoogleSearch = config.enableGoogleSearch;
  const enableImageSearch = config.enableImageSearch;
  const responseModality = config.responseModality;

  const generationConfig = buildOfficialGenerationConfig({
    model,
    aspectRatio: config.aspectRatio,
    imageSize: config.imageSize,
    thinkingLevel: config.thinkingLevel,
    responseModality,
  });
  const tools = buildTools(model, enableGoogleSearch, enableImageSearch);

  const executeRequest = async () => {
    pushDevLog('gemini.chat', 'request', 'info', {
      model,
      generationConfig,
      contents: summarizeContentsForLog(input),
    });

    const response = await ai.models.generateContent({
      model,
      contents: input,
      config: {
        ...generationConfig,
        ...(tools ? { tools } : {}),
      },
      ...(signal ? { signal } : {}),
    });

    pushDevLog('gemini.chat', 'response', 'info', summarizeResponseForLog(response));
    return response;
  };

  const response = await executeRequest();
  const orderedParts = extractOrderedPartsFromResponse(response);
  const modelContextTurn = extractModelContextTurn(response);
  const images = extractImagesFromResponse(response, 'final');
  const thinkingImages = extractImagesFromResponse(response, 'thought');
  const { text: bucketedText, thinking } = bucketTextFromOrderedParts(orderedParts);
  const text = response.text?.trim() ? response.text.trim() : bucketedText;

  return {
    images,
    text,
    thinking,
    thinkingImages,
    orderedParts,
    modelContextTurn,
    model,
  };
};

export { getClient as getGeminiClient };
