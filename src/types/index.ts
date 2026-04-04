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

// 图像生成请求
export interface TextToImageRequest {
  type: 'text-to-image';
  model: ImageModel;
  prompt: string;
  negativePrompt?: string;
  numberOfImages?: number;
  aspectRatio?: AspectRatio;
}

export interface ImageToImageRequest {
  type: 'image-to-image';
  model: ImageModel;
  prompt: string;
  referenceImage: string; // base64 or URL
  referenceImageMimeType?: string;
  numberOfImages?: number;
}

export interface InpaintingRequest {
  type: 'inpainting';
  model: ImageModel;
  prompt: string;
  referenceImage: string;
  maskImage?: string;
  referenceImageMimeType?: string;
  numberOfImages?: number;
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
}

// 宽高比
export type AspectRatio =
  | 'square'
  | 'portrait'
  | 'landscape'
  | '16:9'
  | '9:16'
  | '4:3'
  | '3:4'
  | '1:1';

// 模型配置
export interface ModelConfig {
  id: ImageModel;
  name: string;
  description: string;
  supportedTaskTypes: ImageTaskType[];
  maxImages: number;
}

// 模型配置列表
export const IMAGE_MODELS: ModelConfig[] = [
  {
    id: 'gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro Image',
    description: '高质量图像生成模型，适合复杂场景',
    supportedTaskTypes: ['text-to-image', 'image-to-image', 'inpainting'],
    maxImages: 4,
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    name: 'Gemini 3.1 Flash Image',
    description: '快速图像生成模型，适合实时预览',
    supportedTaskTypes: ['text-to-image', 'image-to-image'],
    maxImages: 4,
  },
];
