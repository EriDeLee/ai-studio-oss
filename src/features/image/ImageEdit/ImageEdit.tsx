import { useState } from 'react';
import { Button, TextArea, Select, Card, CardHeader, CardTitle, CardContent, LoadingSpinner } from '../../../components/ui';
import { ImageUpload, ImageGallery } from '../../../components/image';
import { useImageGeneration } from '../../../hooks/useImageGeneration';
import { IMAGE_MODELS, type ImageModel } from '../../../types';

export function ImageEdit() {
  const [referenceImage, setReferenceImage] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<ImageModel>('gemini-3-pro-image-preview');

  const { isLoading, error, response, generate, reset } = useImageGeneration();

  const handleImageUpload = (base64: string) => {
    setReferenceImage(base64);
    reset();
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || !referenceImage) return;

    reset();
    await generate({
      type: 'inpainting',
      model,
      prompt: prompt.trim(),
      referenceImage: referenceImage.split(',')[1],
      referenceImageMimeType: referenceImage.split(';')[0].split(':')[1],
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Input Panel */}
      <Card>
        <CardHeader>
          <CardTitle>图像编辑</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select
            label="模型"
            value={model}
            onChange={(e) => setModel(e.target.value as ImageModel)}
            options={IMAGE_MODELS.filter((m) =>
              m.supportedTaskTypes.includes('inpainting')
            ).map((m) => ({
              value: m.id,
              label: m.name,
            }))}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              原始图像
            </label>
            <ImageUpload
              value={referenceImage}
              onChange={handleImageUpload}
              onClear={() => setReferenceImage('')}
              placeholder="上传要编辑的图像"
            />
          </div>

          <TextArea
            label="编辑指令"
            placeholder="描述你想要对图像进行什么修改..."
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />

          <Button
            onClick={handleGenerate}
            isLoading={isLoading}
            disabled={!prompt.trim() || !referenceImage}
            className="w-full"
          >
            编辑图像
          </Button>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Output Panel */}
      <Card>
        <CardHeader>
          <CardTitle>编辑结果</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <LoadingSpinner size="lg" />
            </div>
          ) : response?.images ? (
            <ImageGallery images={response.images} />
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500">
              <p>编辑后的图像将显示在这里</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
