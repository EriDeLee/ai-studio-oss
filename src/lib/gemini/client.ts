import { GoogleGenAI } from '@google/genai';
import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
  GeneratedImage,
  ResponseModality,
} from '../../types';
import { stripDataUrlPrefix } from '../utils';

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

type InteractionInputPart =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mime_type?: ImageMimeType };

const getApiKey = (): string => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('VITE_GEMINI_API_KEY environment variable is not set');
  }
  return apiKey;
};

let client: GoogleGenAI | null = null;

const getClient = (): GoogleGenAI => {
  if (!client) {
    client = new GoogleGenAI({ apiKey: getApiKey() });
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
 * Build input for Interactions API based on request type
 */
const buildInput = (
  request: ImageGenerationRequest
): string | InteractionInputPart[] => {
  switch (request.type) {
    case 'text-to-image':
      return request.prompt;

    case 'image-to-image': {
      const parts: InteractionInputPart[] = [
        { type: 'text', text: request.prompt },
        ...request.referenceImages.map((img, i) => ({
          type: 'image' as const,
          data: stripDataUrlPrefix(img),
          mime_type: (request.referenceImageMimeTypes?.[i] || 'image/png') as ImageMimeType,
        })),
      ];
      return parts;
    }

    case 'inpainting': {
      const parts: InteractionInputPart[] = [
        { type: 'text', text: request.prompt },
        ...request.referenceImages.map((img, i) => ({
          type: 'image' as const,
          data: stripDataUrlPrefix(img),
          mime_type: (request.referenceImageMimeTypes?.[i] || 'image/png') as ImageMimeType,
        })),
      ];

      if (request.maskImage) {
        parts.push({
          type: 'image',
          data: stripDataUrlPrefix(request.maskImage),
          mime_type: 'image/png',
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
 * Build generation config for Interactions API
 */
const buildGenerationConfig = (request: ImageGenerationRequest) => {
  const config: Record<string, unknown> = {};

  if (request.type === 'text-to-image') {
    if (request.numberOfImages) config.numberOfImages = request.numberOfImages;
    if (request.aspectRatio) config.aspectRatio = request.aspectRatio;
    if (request.negativePrompt) config.negativePrompt = request.negativePrompt;
    if (request.seed) config.seed = request.seed;
    if (request.guidanceScale) config.guidanceScale = request.guidanceScale;
    if (request.imageSize) config.imageSize = request.imageSize;
    if (request.addWatermark !== undefined) config.addWatermark = request.addWatermark;
    if (request.safetyFilterLevel) config.safetyFilterLevel = request.safetyFilterLevel;
    if (request.personGeneration) config.personGeneration = request.personGeneration;
    if (request.language && request.language !== 'auto') config.language = request.language;
    if (request.enhancePrompt !== undefined) config.enhancePrompt = request.enhancePrompt;
    if (request.thinkingLevel) config.thinkingLevel = request.thinkingLevel;
    if (request.includeThoughts !== undefined) config.includeThoughts = request.includeThoughts;
  } else {
    // image-to-image and inpainting
    if (request.numberOfImages) config.numberOfImages = request.numberOfImages;
    if (request.seed) config.seed = request.seed;
  }

  return config;
};

/**
 * Build tools array for Google Search / Image Search
 */
const buildTools = (
  enableGoogleSearch?: boolean,
  enableImageSearch?: boolean
): any[] | undefined => {
  if (!enableGoogleSearch) return undefined;

  if (enableImageSearch) {
    return [
      {
        google_search: {
          search_types: {
            web_search: {},
            image_search: {},
          },
        },
      },
    ];
  }

  return [{ google_search: {} }];
};

/**
 * Map responseModality to API response_modalities
 */
const mapResponseModality = (
  modality?: ResponseModality
): ('image' | 'text')[] => {
  if (modality === 'image') return ['image'];
  return ['image', 'text'];
};

/**
 * Extract images from Interactions API response outputs
 */
const extractImagesFromOutputs = (outputs: unknown[]): GeneratedImage[] => {
  const images: GeneratedImage[] = [];

  if (!Array.isArray(outputs)) return images;

  for (const output of outputs) {
    if (
      output &&
      typeof output === 'object' &&
      'type' in output &&
      (output as { type: string }).type === 'image'
    ) {
      const block = output as { data?: string; mime_type?: string; mimeType?: string; uri?: string };
      if (block.data) {
        images.push({
          base64: block.data,
          mimeType: block.mime_type || block.mimeType || 'image/png',
        });
      } else if (block.uri) {
        const rawBase64 = stripDataUrlPrefix(block.uri);
        const mimeMatch = block.uri.match(/^data:([^;]+);base64,/);
        images.push({
          base64: rawBase64,
          mimeType: mimeMatch ? mimeMatch[1] : 'image/png',
        });
      }
    }
  }

  return images;
};

/**
 * Generate image using Interactions API (unified interface)
 * Supports text-to-image, image-to-image, and inpainting
 */
export const generateImage = async (
  request: ImageGenerationRequest,
  signal?: AbortSignal,
  previousInteractionId?: string
): Promise<ImageGenerationResponse> => {
  const ai = getClient();

  const input = buildInput(request);
  const generationConfig = buildGenerationConfig(request);

  const operationName =
    request.type === 'text-to-image'
      ? '文生图'
      : request.type === 'image-to-image'
        ? '图生图'
        : '图像编辑';

  const executeRequest = async () => {
    const interaction = await ai.interactions.create({
      model: request.model,
      input,
      response_modalities: mapResponseModality(
        request.type === 'text-to-image'
          ? (request as any).responseModality
          : undefined
      ),
      ...(Object.keys(generationConfig).length > 0 ? { generation_config: generationConfig } : {}),
      ...(buildTools(
        request.type === 'text-to-image' ? (request as any).enableGoogleSearch : undefined,
        request.type === 'text-to-image' ? (request as any).enableImageSearch : undefined
      ) ? { tools: buildTools(
        request.type === 'text-to-image' ? (request as any).enableGoogleSearch : undefined,
        request.type === 'text-to-image' ? (request as any).enableImageSearch : undefined
      ) as any } : {}),
      ...(previousInteractionId ? { previous_interaction_id: previousInteractionId } : {}),
      ...(signal ? { httpOptions: { signal } } : {}),
    });

    return interaction;
  };

  const interaction = await withRetry(executeRequest, operationName);

  // Extract images from outputs
  const images = extractImagesFromOutputs((interaction as any).outputs || []);

  return {
    images,
    model: request.model,
    interactionId: (interaction as any).id,
  };
};

/**
 * Chat-style image generation with conversation history
 * Uses previous_interaction_id to maintain context
 */
export const chatImageGeneration = async (
  model: string,
  input: string | InteractionInputPart[],
  config: Record<string, unknown>,
  previousInteractionId: string | null,
  signal?: AbortSignal
): Promise<ImageGenerationResponse> => {
  const ai = getClient();

  // Extract search settings from config
  const enableGoogleSearch = config.enableGoogleSearch as boolean | undefined;
  const enableImageSearch = config.enableImageSearch as boolean | undefined;
  const responseModality = config.responseModality as ResponseModality | undefined;

  // Remove non-generation-config fields before passing to API
  const { enableGoogleSearch: _, enableImageSearch: __, responseModality: ___, ...generationConfig } = config;

  const executeRequest = async () => {
    const interaction = await ai.interactions.create({
      model,
      input,
      response_modalities: mapResponseModality(responseModality),
      ...(Object.keys(generationConfig).length > 0 ? { generation_config: generationConfig } : {}),
      ...(buildTools(enableGoogleSearch, enableImageSearch)
        ? { tools: buildTools(enableGoogleSearch, enableImageSearch) as any }
        : {}),
      ...(previousInteractionId ? { previous_interaction_id: previousInteractionId } : {}),
      ...(signal ? { httpOptions: { signal } } : {}),
    });

    return interaction;
  };

  const interaction = await withRetry(executeRequest, '对话生成');

  const images = extractImagesFromOutputs((interaction as any).outputs || []);

  return {
    images,
    model: model as any,
    interactionId: (interaction as any).id,
  };
};

export { getClient as getGeminiClient };
