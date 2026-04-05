import { GoogleGenAI } from '@google/genai';
import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
  GeneratedImage,
  AssistantResponsePart,
  ResponseModality,
} from '../../types';
import { stripDataUrlPrefix } from '../utils';
import { pushDevLog } from '../devConsole';

// Retry configuration
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000; // 2 seconds base delay

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

const summarizeContentPart = (part: any) => {
  if (part?.type === 'text') {
    const text = String(part.text ?? '');
    return { type: 'text', textLength: text.length };
  }
  if (part?.type === 'image' && part.inlineData) {
    const data = String(part.inlineData.data ?? '');
    return {
      type: 'image',
      mimeType: String(part.inlineData.mimeType ?? ''),
      base64Length: data.length,
    };
  }
  return { type: String(part?.type ?? 'unknown') };
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
    items: contents.map((item: any) => {
      if (item && typeof item === 'object' && 'role' in item && Array.isArray(item.parts)) {
        return {
          role: String(item.role),
          parts: item.parts.map(summarizeContentPart),
        };
      }
      return summarizeContentPart(item);
    }),
  };
};

const summarizeResponseForLog = (response: any) => {
  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
  return {
    candidateCount: candidates.length,
    candidates: candidates.map((candidate: any, idx: number) => {
      const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
      const summarizedParts = parts.map((part: any, partIndex: number) => {
        if (part?.inlineData) {
          const mimeType = String(part.inlineData.mimeType ?? '');
          const data = String(part.inlineData.data ?? '');
          return {
            partIndex,
            source: 'inlineData',
            thought: Boolean(part?.thought),
            mimeType,
            dataLength: data.length,
            dataHead: data.slice(0, 24),
          };
        }
        if (part?.fileData?.fileUri) {
          const uri = String(part.fileData.fileUri);
          const mimeMatch = uri.match(/^data:([^;]+);base64,/i);
          return {
            partIndex,
            source: 'fileData',
            thought: Boolean(part?.thought),
            mimeType: mimeMatch ? mimeMatch[1] : '',
            uriLength: uri.length,
            uriHead: uri.slice(0, 64),
          };
        }
        return {
          partIndex,
          source: part?.text !== undefined ? 'text' : 'other',
          thought: Boolean(part?.thought),
        };
      });
      const imagePartCount = summarizedParts.filter(
        (part: any) => typeof part.mimeType === 'string' && part.mimeType.startsWith('image/')
      ).length;
      return {
        index: idx,
        finishReason: candidate?.finishReason,
        partCount: parts.length,
        imagePartCount,
        parts: summarizedParts,
      };
    }),
  };
};

const toGeminiThinkingLevel = (thinkingLevel: 'minimal' | 'high'): 'LOW' | 'HIGH' => {
  return thinkingLevel === 'high' ? 'HIGH' : 'LOW';
};

const getApiKey = (): string => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('VITE_GEMINI_API_KEY environment variable is not set');
  }
  return apiKey;
};

const getBaseUrl = (): string | undefined => {
  return import.meta.env.VITE_GEMINI_BASE_URL;
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

// Retry with exponential backoff
const withRetry = async <T>(
  fn: () => Promise<T>,
  operationName: string
): Promise<T> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry if aborted
      if (lastError.name === 'AbortError') {
        throw new Error(`${operationName} 请求已取消`);
      }

      // Don't retry on last attempt
      if (attempt === MAX_RETRIES) {
        break;
      }

      // Exponential backoff: 2s, 4s
      const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
      console.warn(`${operationName} 请求失败，${delay / 1000}秒后重试（${attempt + 1}/${MAX_RETRIES}）:`, lastError.message);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error(`${operationName} 请求失败`);
};

/**
 * Build contents for generateContent API based on request type
 */
const buildContents = (
  request: ImageGenerationRequest
): string | ContentPart[] => {
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
            mimeType: (request.referenceImageMimeTypes?.[i] || 'image/png') as ImageMimeType,
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
            mimeType: (request.referenceImageMimeTypes?.[i] || 'image/png') as ImageMimeType,
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
      const _exhaustiveCheck: never = request;
      throw new Error(`Unsupported request type: ${_exhaustiveCheck}`);
    }
  }
};

/**
 * Build generation config for generateContent API
 */
const buildGenerationConfig = (request: ImageGenerationRequest) => {
  const config: Record<string, unknown> = {};

  if (request.type === 'text-to-image') {
    if (typeof request.numberOfImages === 'number' && Number.isFinite(request.numberOfImages)) {
      config.candidateCount = request.numberOfImages;
    }
    if (request.seed !== undefined) config.seed = request.seed;
    
    // Image-specific config
    const imageConfig: Record<string, unknown> = {};
    if (request.aspectRatio) imageConfig.aspectRatio = request.aspectRatio;
    if (request.imageSize) imageConfig.imageSize = request.imageSize;
    config.imageConfig = imageConfig;
    
    // Thinking config
    if (request.thinkingLevel || request.includeThoughts !== undefined) {
      config.thinkingConfig = {
        thinkingLevel: toGeminiThinkingLevel(request.thinkingLevel ?? 'minimal'),
        includeThoughts: Boolean(request.includeThoughts),
      };
    }
  } else {
    // image-to-image and inpainting
    if (typeof request.numberOfImages === 'number' && Number.isFinite(request.numberOfImages)) {
      config.candidateCount = request.numberOfImages;
    }
    if (request.seed !== undefined) config.seed = request.seed;
  }

  return config;
};

/**
 * Normalize chat config into Gemini generation config shape.
 */
const normalizeChatGenerationConfig = (config: Record<string, unknown>) => {
  const normalized: Record<string, unknown> = {};

  if (config.seed !== undefined) normalized.seed = config.seed;
  if (typeof config.numberOfImages === 'number' && Number.isFinite(config.numberOfImages)) {
    normalized.candidateCount = config.numberOfImages;
  }

  const imageConfig: Record<string, unknown> = {};
  if (config.aspectRatio) imageConfig.aspectRatio = config.aspectRatio;
  if (config.imageSize) imageConfig.imageSize = config.imageSize;
  if (Object.keys(imageConfig).length > 0) normalized.imageConfig = imageConfig;

  const thinkingLevel = config.thinkingLevel as 'minimal' | 'high' | undefined;
  const includeThoughts = config.includeThoughts as boolean | undefined;
  if (thinkingLevel || includeThoughts !== undefined) {
    normalized.thinkingConfig = {
      thinkingLevel: toGeminiThinkingLevel(thinkingLevel ?? 'minimal'),
      includeThoughts: Boolean(includeThoughts),
    };
  }

  return normalized;
};

/**
 * Build tools array for generateContent API
 */
const buildTools = (
  model?: string,
  enableGoogleSearch?: boolean,
  enableImageSearch?: boolean
): any[] | undefined => {
  if (!enableGoogleSearch) return undefined;
  const canUseImageSearch = model === 'gemini-3.1-flash-image-preview';

  if (enableImageSearch && canUseImageSearch) {
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

/**
 * Extract images from generateContent response
 */
const extractImagesFromResponse = (
  response: any,
  imageThoughtState: 'thought' | 'final'
): GeneratedImage[] => {
  const images: GeneratedImage[] = [];

  if (!response.candidates || !Array.isArray(response.candidates)) return images;

  for (const candidate of response.candidates) {
    if (!candidate.content?.parts) continue;

    for (const part of candidate.content.parts) {
      const isThoughtPart = Boolean(part?.thought);
      const matchThoughtState =
        imageThoughtState === 'thought' ? isThoughtPart : !isThoughtPart;
      if (!matchThoughtState) continue;

      if (part.inlineData) {
        const mimeType = String(part.inlineData.mimeType || 'image/png');
        if (!mimeType.startsWith('image/')) continue;

        const base64 = String(part.inlineData.data || '');
        if (!base64) continue;

        images.push({
          base64,
          mimeType,
        });
      } else if (part.fileData?.fileUri) {
        const uri = part.fileData.fileUri;
        const mimeMatch = uri.match(/^data:([^;]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
        if (!mimeType.startsWith('image/')) continue;

        const rawBase64 = stripDataUrlPrefix(uri);
        if (!rawBase64) continue;

        images.push({
          base64: rawBase64,
          mimeType,
        });
      }
    }
  }

  return images;
};

const extractOrderedPartsFromResponse = (response: any): AssistantResponsePart[] => {
  const orderedParts: AssistantResponsePart[] = [];

  if (!response?.candidates || !Array.isArray(response.candidates)) {
    return orderedParts;
  }

  for (let candidateIndex = 0; candidateIndex < response.candidates.length; candidateIndex += 1) {
    const candidate = response.candidates[candidateIndex];
    if (!candidate?.content?.parts || !Array.isArray(candidate.content.parts)) continue;

    for (let partIndex = 0; partIndex < candidate.content.parts.length; partIndex += 1) {
      const part = candidate.content.parts[partIndex];
      const thought = Boolean(part?.thought);
      const bucket = thought ? 'thinking' : 'main';

      if (typeof part?.text === 'string') {
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

      if (part?.inlineData) {
        const mimeType = String(part.inlineData.mimeType || 'image/png');
        const base64 = String(part.inlineData.data || '');
        if (mimeType.startsWith('image/') && base64) {
          orderedParts.push({
            type: 'image',
            bucket,
            thought,
            image: { base64, mimeType },
            raw: part,
            candidateIndex,
            partIndex,
          });
        } else {
          orderedParts.push({
            type: 'other',
            bucket: 'other',
            thought,
            raw: part,
            candidateIndex,
            partIndex,
          });
        }
        continue;
      }

      if (part?.fileData?.fileUri) {
        const uri = String(part.fileData.fileUri);
        const mimeMatch = uri.match(/^data:([^;]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
        const base64 = stripDataUrlPrefix(uri);
        if (mimeType.startsWith('image/') && base64) {
          orderedParts.push({
            type: 'image',
            bucket,
            thought,
            image: { base64, mimeType },
            raw: part,
            candidateIndex,
            partIndex,
          });
        } else {
          orderedParts.push({
            type: 'other',
            bucket: 'other',
            thought,
            raw: part,
            candidateIndex,
            partIndex,
          });
        }
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

/**
 * Generate image using generateContent API
 * Supports text-to-image, image-to-image, and inpainting
 */
export const generateImage = async (
  request: ImageGenerationRequest,
  signal?: AbortSignal
): Promise<ImageGenerationResponse> => {
  const ai = getClient();

  const contents = buildContents(request);
  const generationConfig = buildGenerationConfig(request);
  const tools = buildTools(
    request.model,
    request.type === 'text-to-image' ? (request as any).enableGoogleSearch : undefined,
    request.type === 'text-to-image' ? (request as any).enableImageSearch : undefined
  );

  const operationName =
    request.type === 'text-to-image'
      ? '文生图'
      : request.type === 'image-to-image'
        ? '图生图'
        : '图像编辑';

  const executeRequest = async () => {
    const response = await ai.models.generateContent({
      model: request.model,
      contents,
      config: {
        ...(Object.keys(generationConfig).length > 0 ? generationConfig : {}),
        ...(tools ? { tools } : {}),
        responseModalities: request.type === 'text-to-image' && request.responseModality
          ? (request.responseModality === 'image' ? ['IMAGE'] : ['TEXT', 'IMAGE'])
          : ['TEXT', 'IMAGE'],
      },
      ...(signal ? { signal } : {}),
    });

    return response;
  };

  const response = await withRetry(executeRequest, operationName);

  // Extract images from response
  const orderedParts = extractOrderedPartsFromResponse(response as any);
  const images = extractImagesFromResponse(response as any, 'final');
  const thinkingImages = extractImagesFromResponse(response as any, 'thought');
  const { text, thinking } = bucketTextFromOrderedParts(orderedParts);

  return {
    images,
    text,
    thinking,
    thinkingImages,
    orderedParts,
    model: request.model,
  };
};

/**
 * Chat-style image generation with conversation history
 * Uses generateContent API
 */
export const chatImageGeneration = async (
  model: string,
  input: string | ContentPart[] | ChatContent[],
  config: Record<string, unknown>,
  signal?: AbortSignal
): Promise<ImageGenerationResponse> => {
  const ai = getClient();

  // Extract search settings from config
  const enableGoogleSearch = config.enableGoogleSearch as boolean | undefined;
  const enableImageSearch = config.enableImageSearch as boolean | undefined;
  const responseModality = config.responseModality as ResponseModality | undefined;

  // Remove non-generation-config fields before passing to API
  const { enableGoogleSearch: _, enableImageSearch: __, responseModality: ___, ...rawGenerationConfig } = config;
  const generationConfig = normalizeChatGenerationConfig(rawGenerationConfig);

  // Build response modalities
  const responseModalities = responseModality === 'image' ? ['IMAGE'] : ['TEXT', 'IMAGE'];

  const executeRequest = async () => {
    pushDevLog('gemini.chat', 'request', 'info', {
      model,
      generationConfig,
      responseModalities,
      contents: summarizeContentsForLog(input),
    });

    const response = await ai.models.generateContent({
      model,
      contents: input,
      config: {
        ...generationConfig,
        responseModalities,
        ...(buildTools(model, enableGoogleSearch, enableImageSearch)
          ? { tools: buildTools(model, enableGoogleSearch, enableImageSearch) as any }
          : {}),
      },
      ...(signal ? { signal } : {}),
    });

    pushDevLog('gemini.chat', 'response', 'info', summarizeResponseForLog(response));
    return response;
  };

  const response = await withRetry(executeRequest, '对话生成');

  const orderedParts = extractOrderedPartsFromResponse(response as any);
  const images = extractImagesFromResponse(response as any, 'final');
  const thinkingImages = extractImagesFromResponse(response as any, 'thought');
  const { text, thinking } = bucketTextFromOrderedParts(orderedParts);

  return {
    images,
    text,
    thinking,
    thinkingImages,
    orderedParts,
    model: model as any,
  };
};

export { getClient as getGeminiClient };
