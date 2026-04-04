import type { ImageModel, ModelConfig } from '../types';

export const IMAGE_MODELS: ModelConfig[] = [
  {
    id: 'gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro Image',
    description: '高质量图像生成，适合复杂场景和精细编辑',
    supportedTaskTypes: ['text-to-image', 'image-to-image', 'inpainting'],
    maxImages: 4,
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    name: 'Gemini 3.1 Flash Image',
    description: '快速图像生成，适合日常使用和实时预览',
    supportedTaskTypes: ['text-to-image', 'image-to-image', 'inpainting'],
    maxImages: 4,
  },
];

/**
 * Get model config by ID
 */
export function getModelConfig(modelId: ImageModel): ModelConfig | undefined {
  return IMAGE_MODELS.find((m) => m.id === modelId);
}
