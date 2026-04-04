import { useState } from 'react';
import { cn } from '../../lib/utils';
import { Download, ZoomIn, ZoomOut } from 'lucide-react';
import { downloadBase64Image } from '../../lib/utils';

interface ImageGalleryProps {
  images: Array<{
    base64: string;
    mimeType: string;
  }>;
  className?: string;
}

export function ImageGallery({ images, className }: ImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);

  if (images.length === 0) return null;

  const selectedImage = images[selectedIndex];

  const handleDownload = () => {
    downloadBase64Image(
      selectedImage.base64,
      selectedImage.mimeType,
      `generated-image-${Date.now()}.png`
    );
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Main image */}
      <div className="relative bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden">
        <img
          src={`data:${selectedImage.mimeType};base64,${selectedImage.base64}`}
          alt={`Generated image ${selectedIndex + 1}`}
          className={cn(
            'w-full h-auto object-contain transition-transform',
            isZoomed ? 'cursor-zoom-out scale-150' : 'cursor-zoom-in'
          )}
          onClick={() => setIsZoomed(!isZoomed)}
        />

        {/* Controls */}
        <div className="absolute bottom-4 right-4 flex gap-2">
          <button
            type="button"
            onClick={() => setIsZoomed(!isZoomed)}
            className="p-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
          >
            {isZoomed ? (
              <ZoomOut className="w-5 h-5" />
            ) : (
              <ZoomIn className="w-5 h-5" />
            )}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="p-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {images.map((image, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setSelectedIndex(index)}
              className={cn(
                'flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors',
                selectedIndex === index
                  ? 'border-primary-500'
                  : 'border-transparent hover:border-gray-300'
              )}
            >
              <img
                src={`data:${image.mimeType};base64,${image.base64}`}
                alt={`Thumbnail ${index + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
