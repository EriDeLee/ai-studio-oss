import { GoogleGenAI } from '@google/genai';
import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
  GeneratedImage,
  TextToImageRequest,
  ImageToImageRequest,
  InpaintingRequest,
} from '../../types';

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

const extractImagesFromResponse = (response: unknown): GeneratedImage[] => {
  const images: GeneratedImage[] = [];
  const resp = response as {
    generatedImages?: Array<{
      images?: Array<{ imageBytes?: string; mimeType?: string }>;
    }>;
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { mimeType?: string; data?: string };
        }>;
      };
    }>;
  };

  // Handle generatedImages format
  if (resp.generatedImages) {
    for (const genImage of resp.generatedImages) {
      if (genImage.images) {
        for (const img of genImage.images) {
          if (img.imageBytes) {
            images.push({
              base64: img.imageBytes,
              mimeType: img.mimeType || 'image/png',
            });
          }
        }
      }
    }
  }

  // Handle candidates format
  if (resp.candidates) {
    for (const candidate of resp.candidates) {
      const parts = candidate.content?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.inlineData?.data) {
            images.push({
              base64: part.inlineData.data,
              mimeType: part.inlineData.mimeType || 'image/png',
            });
          }
        }
      }
    }
  }

  return images;
};

export const generateImage = async (
  request: ImageGenerationRequest
): Promise<ImageGenerationResponse> => {
  const ai = getClient();

  let response: unknown;

  switch (request.type) {
    case 'text-to-image':
      response = await handleTextToImage(ai, request);
      break;
    case 'image-to-image':
      response = await handleImageToImage(ai, request);
      break;
    case 'inpainting':
      response = await handleInpainting(ai, request);
      break;
    default:
      throw new Error(`Unsupported request type`);
  }

  const images = extractImagesFromResponse(response);

  return {
    images,
    model: request.model,
  };
};

const handleTextToImage = async (
  ai: GoogleGenAI,
  request: TextToImageRequest
): Promise<unknown> => {
  const response = await ai.models.generateImages({
    model: request.model,
    prompt: request.prompt,
    config: {
      numberOfImages: request.numberOfImages || 1,
    },
  });

  return response;
};

const handleImageToImage = async (
  ai: GoogleGenAI,
  request: ImageToImageRequest
): Promise<unknown> => {
  const response = await ai.models.generateContent({
    model: request.model,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: request.prompt,
          },
          {
            inlineData: {
              mimeType: request.referenceImageMimeType || 'image/png',
              data: request.referenceImage.replace(/^data:image\/\w+;base64,/, ''),
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['image', 'text'],
    },
  });

  return response;
};

const handleInpainting = async (
  ai: GoogleGenAI,
  request: InpaintingRequest
): Promise<unknown> => {
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    { text: request.prompt },
    {
      inlineData: {
        mimeType: request.referenceImageMimeType || 'image/png',
        data: request.referenceImage.replace(/^data:image\/\w+;base64,/, ''),
      },
    },
  ];

  if (request.maskImage) {
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: request.maskImage.replace(/^data:image\/\w+;base64,/, ''),
      },
    });
  }

  const response = await ai.models.generateContent({
    model: request.model,
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
    config: {
      responseModalities: ['image', 'text'],
    },
  });

  return response;
};

export { getClient as getGeminiClient };
