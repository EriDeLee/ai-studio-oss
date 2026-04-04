import { useState } from 'react';
import { Button, TextArea, Select, Card, CardHeader, CardTitle, CardContent, LoadingSpinner } from '../../../components/ui';
import { ImageGallery } from '../../../components/image';
import { useImageGeneration } from '../../../hooks/useImageGeneration';
import { IMAGE_MODELS, type ImageModel } from '../../../types';

export function TextToImage() {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<ImageModel>('gemini-3.1-flash-image-preview');
  const [numberOfImages, setNumberOfImages] = useState(1);

  const { isLoading, error, response, generate, reset } = useImageGeneration();

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    reset();
    await generate({
      type: 'text-to-image',
      model,
      prompt: prompt.trim(),
      numberOfImages,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Input Panel */}
      <Card>
        <CardHeader>
          <CardTitle>文本生成图像</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select
            label="模型"
            value={model}
            onChange={(e) => setModel(e.target.value as ImageModel)}
            options={IMAGE_MODELS.map((m) => ({
              value: m.id,
              label: m.name,
            }))}
          />

          <TextArea
            label="提示词"
            placeholder="描述你想要生成的图像..."
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />

          <Select
            label="生成数量"
            value={numberOfImages.toString()}
            onChange={(e) => setNumberOfImages(parseInt(e.target.value))}
            options={[
              { value: '1', label: '1 张' },
              { value: '2', label: '2 张' },
              { value: '4', label: '4 张' },
            ]}
          />

          <Button
            onClick={handleGenerate}
            isLoading={isLoading}
            disabled={!prompt.trim()}
            className="w-full"
          >
            生成图像
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
          <CardTitle>生成结果</CardTitle>
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
              <p>生成的图像将显示在这里</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
