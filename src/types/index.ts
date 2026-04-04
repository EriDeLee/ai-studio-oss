// 模态类型 - 用于扩展其他模态
export type ModalityType = 'image' | 'audio' | 'video' | 'text';

// 图像生成模型
export type ImageModel =
  | 'gemini-3-pro-image-preview'
  | 'gemini-3.1-flash-image-preview';

// 所有模型联合类型
export type Model = ImageModel; // 未来可扩展: | AudioModel | VideoModel

// 图像生成任务类型
export type ImageTaskType = 'text-to-image' | 'image-to-image' | 'inpainting';

// 宽高比 (kept for backward compat, but SDK uses string)
export type AspectRatio =
  | 'square'
  | 'portrait'
  | 'landscape'
  | '16:9'
  | '9:16'
  | '4:3'
  | '3:4'
  | '1:1';

// Our own string types for UI, cast at API boundary
export type SafetyFilterLevel =
  | 'BLOCK_LOW_AND_ABOVE'
  | 'BLOCK_MEDIUM_AND_ABOVE'
  | 'BLOCK_ONLY_HIGH'
  | 'BLOCK_NONE';

export type PersonGeneration =
  | 'DONT_ALLOW'
  | 'ALLOW_ADULT'
  | 'ALLOW_ALL';

export type ImagePromptLanguage =
  | 'auto'
  | 'zh'
  | 'en'
  | 'ja'
  | 'ko'
  | 'hi'
  | 'pt'
  | 'de'
  | 'es'
  | 'fr'
  | 'id'
  | 'it'
  | 'ru'
  | 'uk'
  | 'vi'
  | 'ar';

// 思考级别
export type ThinkingLevel = 'minimal' | 'high';

// 响应模态
export type ResponseModality = 'text_image' | 'image';

// 图像生成请求
export interface TextToImageRequest {
  type: 'text-to-image';
  model: ImageModel;
  prompt: string;
  negativePrompt?: string;
  numberOfImages?: number;
  aspectRatio?: string;
  seed?: number;
  guidanceScale?: number;
  imageSize?: string;
  addWatermark?: boolean;
  safetyFilterLevel?: SafetyFilterLevel;
  personGeneration?: PersonGeneration;
  language?: ImagePromptLanguage;
  enhancePrompt?: boolean;
  thinkingLevel?: ThinkingLevel;
  includeThoughts?: boolean;
  responseModality?: ResponseModality;
  enableGoogleSearch?: boolean;
  enableImageSearch?: boolean;
}

export interface ImageToImageRequest {
  type: 'image-to-image';
  model: ImageModel;
  prompt: string;
  referenceImages: string[]; // base64 or URL array (multi-image support)
  referenceImageMimeTypes?: string[];
  numberOfImages?: number;
  seed?: number;
}

export interface InpaintingRequest {
  type: 'inpainting';
  model: ImageModel;
  prompt: string;
  referenceImages: string[];
  maskImage?: string;
  referenceImageMimeTypes?: string[];
  numberOfImages?: number;
  seed?: number;
}

export type ImageGenerationRequest =
  | TextToImageRequest
  | ImageToImageRequest
  | InpaintingRequest;

// 图像生成响应
export interface GeneratedImage {
  base64: string;
  mimeType: string;
}

export interface ImageGenerationResponse {
  images: GeneratedImage[];
  model: ImageModel;
  /** Interactions API interaction ID for multi-turn conversation */
  interactionId?: string;
}

// 模型配置
export interface ModelConfig {
  id: ImageModel;
  name: string;
  description: string;
  supportedTaskTypes: ImageTaskType[];
  maxImages: number;
}

// Chat message types for unified conversational UI
export interface ChatUserMessage {
  role: 'user';
  content: string;
  attachments?: string[]; // base64 images
  timestamp: number;
}

export interface ChatAssistantMessage {
  role: 'assistant';
  content?: string; // text explanation from model
  images: GeneratedImage[];
  interactionId?: string;
  timestamp: number;
}

export type ChatMessage = ChatUserMessage | ChatAssistantMessage;

// Unified chat settings
export interface ImageChatSettings {
  model: ImageModel;
  aspectRatio?: string;
  numberOfImages?: number;
  seed?: number;
  guidanceScale?: number;
  imageSize?: string;
  addWatermark?: boolean;
  safetyFilterLevel?: SafetyFilterLevel;
  personGeneration?: PersonGeneration;
  language?: ImagePromptLanguage;
  enhancePrompt?: boolean;
  negativePrompt?: string;
  thinkingLevel?: ThinkingLevel;
  includeThoughts?: boolean;
  responseModality?: ResponseModality;
  enableGoogleSearch?: boolean;
  enableImageSearch?: boolean;
}
