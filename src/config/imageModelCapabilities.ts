import type { ImageChatSettings, ImageModel, ImageTaskType, ModelConfig } from '../types';

type ImageModelCatalogItem = ModelConfig & {
  tag: string;
  supportsImageSearch: boolean;
  allowedImageSizes: readonly string[];
  allowedAspectRatios: readonly string[];
};

const IMAGE_TASK_TYPES: readonly ImageTaskType[] = ['text-to-image', 'image-to-image', 'inpainting'];
const FLASH_ASPECT_RATIOS = [
  '1:1',
  '1:4',
  '1:8',
  '2:3',
  '3:2',
  '3:4',
  '4:1',
  '4:3',
  '4:5',
  '5:4',
  '8:1',
  '9:16',
  '16:9',
  '21:9',
] as const;
const PRO_ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
] as const;
const FLASH_IMAGE_SIZES = ['', '512', '1K', '2K', '4K'] as const;
const PRO_IMAGE_SIZES = ['', '1K', '2K', '4K'] as const;

const IMAGE_MODEL_CATALOG: readonly ImageModelCatalogItem[] = [
  {
    id: 'gemini-3.1-flash-image-preview',
    name: 'Gemini 3.1 Flash Image',
    description: '更快响应，适合高频迭代。',
    tag: '速度优先',
    supportedTaskTypes: [...IMAGE_TASK_TYPES],
    maxImages: 4,
    supportsImageSearch: true,
    allowedImageSizes: FLASH_IMAGE_SIZES,
    allowedAspectRatios: FLASH_ASPECT_RATIOS,
  },
  {
    id: 'gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro Image',
    description: '更强细节和构图能力，适合最终稿。',
    tag: '质量优先',
    supportedTaskTypes: [...IMAGE_TASK_TYPES],
    maxImages: 4,
    supportsImageSearch: false,
    allowedImageSizes: PRO_IMAGE_SIZES,
    allowedAspectRatios: PRO_ASPECT_RATIOS,
  },
];

const IMAGE_MODEL_CATALOG_MAP = Object.fromEntries(
  IMAGE_MODEL_CATALOG.map((item) => [item.id, item])
) as Record<ImageModel, ImageModelCatalogItem>;

export const IMAGE_MODEL_IDS: readonly ImageModel[] = IMAGE_MODEL_CATALOG.map((item) => item.id);
export const DEFAULT_IMAGE_MODEL: ImageModel = 'gemini-3.1-flash-image-preview';
export const DEFAULT_IMAGE_CHAT_SETTINGS: ImageChatSettings = {
  model: DEFAULT_IMAGE_MODEL,
  aspectRatio: FLASH_ASPECT_RATIOS[0],
  numberOfImages: 1,
  imageSize: '',
  thinkingLevel: 'minimal',
  includeThoughts: true,
  responseModality: 'text_image',
  enableGoogleSearch: false,
  enableImageSearch: false,
};

export const IMAGE_MODEL_OPTIONS = IMAGE_MODEL_CATALOG.map((item) => ({
  value: item.id,
  label: item.name,
  tag: item.tag,
  description: item.description,
}));

export const IMAGE_MODELS: ModelConfig[] = IMAGE_MODEL_CATALOG.map((item) => ({
  id: item.id,
  name: item.name,
  description: item.description,
  supportedTaskTypes: [...item.supportedTaskTypes],
  maxImages: item.maxImages,
}));

export const getModelConfig = (modelId: ImageModel): ModelConfig | undefined => {
  return IMAGE_MODELS.find((model) => model.id === modelId);
};

export const isImageModel = (value: unknown): value is ImageModel => {
  return typeof value === 'string' && Object.hasOwn(IMAGE_MODEL_CATALOG_MAP, value);
};

export const getImageModelLabel = (model: ImageModel): string => {
  return IMAGE_MODEL_CATALOG_MAP[model].name;
};

export const supportsImageSearch = (model: ImageModel): boolean => {
  return IMAGE_MODEL_CATALOG_MAP[model].supportsImageSearch;
};

export const getAllowedImageSizes = (model: ImageModel): readonly string[] => {
  return IMAGE_MODEL_CATALOG_MAP[model].allowedImageSizes;
};

export const getAllowedAspectRatios = (model: ImageModel): readonly string[] => {
  return IMAGE_MODEL_CATALOG_MAP[model].allowedAspectRatios;
};

export const getDefaultAspectRatio = (model: ImageModel): string => {
  return getAllowedAspectRatios(model)[0] ?? '1:1';
};

export const normalizeImageSizeForModel = (model: ImageModel, imageSize: unknown): string => {
  const normalized = typeof imageSize === 'string' ? imageSize : '';
  return getAllowedImageSizes(model).includes(normalized) ? normalized : '';
};

export const normalizeAspectRatioForModel = (model: ImageModel, aspectRatio: unknown): string => {
  const normalized = typeof aspectRatio === 'string' ? aspectRatio : '';
  return getAllowedAspectRatios(model).includes(normalized) ? normalized : '';
};

export const normalizeSearchToolsForModel = (
  model: ImageModel,
  enableGoogleSearch: unknown,
  enableImageSearch: unknown
): { enableGoogleSearch: boolean; enableImageSearch: boolean } => {
  const googleSearchEnabled = enableGoogleSearch === true;
  const imageSearchEnabled = googleSearchEnabled && enableImageSearch === true && supportsImageSearch(model);

  return {
    enableGoogleSearch: googleSearchEnabled,
    enableImageSearch: imageSearchEnabled,
  };
};
