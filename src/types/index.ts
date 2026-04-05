// 模态类型
export type ModalityType = 'image' | 'audio' | 'video' | 'text';

// 图像生成模型（仅支持两款）
export type ImageModel =
  | 'gemini-3-pro-image-preview'
  | 'gemini-3.1-flash-image-preview';

// 所有模型联合类型
export type Model = ImageModel;

// 图像生成任务类型
export type ImageTaskType = 'text-to-image' | 'image-to-image' | 'inpainting';

// 思考级别
export type ThinkingLevel = 'minimal' | 'high';

// 响应模态
export type ResponseModality = 'text_image' | 'image';

// 图像生成请求
export interface TextToImageRequest {
  type: 'text-to-image';
  model: ImageModel;
  prompt: string;
  numberOfImages?: number;
  aspectRatio?: string;
  seed?: number;
  imageSize?: string;
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
  referenceImages: string[];
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

export interface AssistantResponsePart {
  type: 'text' | 'image' | 'other';
  bucket: 'thinking' | 'main' | 'other';
  thought: boolean;
  text?: string;
  image?: GeneratedImage;
  raw: unknown;
  candidateIndex: number;
  partIndex: number;
}

export interface ImageGenerationResponse {
  images: GeneratedImage[];
  text?: string;
  thinking?: string;
  thinkingImages?: GeneratedImage[];
  orderedParts?: AssistantResponsePart[];
  model: ImageModel;
}

// 模型配置
export interface ModelConfig {
  id: ImageModel;
  name: string;
  description: string;
  supportedTaskTypes: ImageTaskType[];
  maxImages: number;
}

// Chat message
export interface ChatUserMessage {
  role: 'user';
  content: string;
  attachments?: string[];
  timestamp: number;
}

export interface ChatAssistantMessage {
  role: 'assistant';
  content?: string;
  thinking?: string;
  thinkingImages?: GeneratedImage[];
  orderedParts?: AssistantResponsePart[];
  images: GeneratedImage[];
  timestamp: number;
}

export type ChatMessage = ChatUserMessage | ChatAssistantMessage;

// Unified chat settings
export interface ImageChatSettings {
  model: ImageModel;
  aspectRatio?: string;
  numberOfImages?: number;
  seed?: number;
  imageSize?: string;
  thinkingLevel?: ThinkingLevel;
  includeThoughts?: boolean;
  responseModality?: ResponseModality;
  enableGoogleSearch?: boolean;
  enableImageSearch?: boolean;
}
