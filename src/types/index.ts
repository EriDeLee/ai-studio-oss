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
export type NumberOfImages = 1 | 2 | 4;

// 图像生成请求
export interface TextToImageRequest {
  type: 'text-to-image';
  model: ImageModel;
  prompt: string;
  numberOfImages?: NumberOfImages;
  aspectRatio?: string;
  seed?: number;
  imageSize?: string;
  thinkingLevel?: ThinkingLevel;
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
  numberOfImages?: NumberOfImages;
  seed?: number;
}

export interface InpaintingRequest {
  type: 'inpainting';
  model: ImageModel;
  prompt: string;
  referenceImages: string[];
  maskImage?: string;
  referenceImageMimeTypes?: string[];
  numberOfImages?: NumberOfImages;
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

// Gemini 多轮上下文（可持久化）
export interface ChatContextPart {
  text?: string;
  inlineData?: {
    data: string;
    mimeType: string;
  };
  fileData?: {
    fileUri: string;
    mimeType?: string;
  };
  thought?: boolean;
  thoughtSignature?: string;
  [key: string]: unknown;
}

export interface ChatContextTurn {
  role: 'user' | 'model';
  parts: ChatContextPart[];
}

export interface ModelContextTurn {
  role: 'model';
  parts: ChatContextPart[];
}

export interface ImageGenerationResponse {
  images: GeneratedImage[];
  text?: string;
  thinking?: string;
  thinkingImages?: GeneratedImage[];
  orderedParts?: AssistantResponsePart[];
  modelContextTurn?: ModelContextTurn;
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
  contextTurn?: ChatContextTurn;
  timestamp: number;
}

export interface ChatAssistantMessage {
  role: 'assistant';
  kind: 'normal' | 'error';
  errorMessage?: string;
  content?: string;
  thinking?: string;
  thinkingImages?: GeneratedImage[];
  orderedParts?: AssistantResponsePart[];
  contextTurn?: ModelContextTurn;
  images: GeneratedImage[];
  timestamp: number;
}

export type ChatMessage = ChatUserMessage | ChatAssistantMessage;

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

// Unified chat settings
export interface ImageChatSettings {
  model: ImageModel;
  aspectRatio: string;
  numberOfImages: NumberOfImages;
  seed?: number;
  imageSize: string;
  thinkingLevel: ThinkingLevel;
  responseModality: ResponseModality;
  enableGoogleSearch: boolean;
  enableImageSearch: boolean;
}
