import { Download, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useState, useCallback } from 'react';
import { downloadBase64Image } from '../../lib/utils';

interface ImagePreviewModalProps {
  image: { base64: string; mimeType: string };
  onClose: () => void;
}

export function ImagePreviewModal({ image, onClose }: ImagePreviewModalProps) {
  const [scale, setScale] = useState(1);

  const handleDownload = useCallback(() => {
    downloadBase64Image(image.base64, image.mimeType, `ai-image-${Date.now()}.png`);
  }, [image]);

  const handleZoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev + 0.25, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  }, []);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  // Close on Escape key
  useState(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        paddingTop: 'var(--safe-area-inset-top)',
        paddingBottom: 'var(--safe-area-inset-bottom)',
        paddingLeft: 'var(--safe-area-inset-left)',
        paddingRight: 'var(--safe-area-inset-right)',
      }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        style={{ top: 'calc(0.5rem + var(--safe-area-inset-top))', right: 'calc(0.5rem + var(--safe-area-inset-right))' }}
        aria-label="关闭预览"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Image container */}
      <div className="relative max-w-full max-h-full p-4 flex items-center justify-center">
        <img
          src={`data:${image.mimeType};base64,${image.base64}`}
          alt="预览图片"
          className="max-w-full max-h-[85dvh] object-contain rounded-lg shadow-2xl transition-transform duration-200"
          style={{ transform: `scale(${scale})` }}
        />
      </div>

      {/* Toolbar */}
      <div
        className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-3 p-4"
        style={{ paddingBottom: 'calc(1rem + var(--safe-area-inset-bottom))' }}
      >
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/50 backdrop-blur-sm">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={scale <= 0.5}
            className="p-2 rounded-lg text-white hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="缩小"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <span className="text-white text-sm min-w-[3rem] text-center tabular-nums">
            {Math.round(scale * 100)}%
          </span>

          <button
            type="button"
            onClick={handleZoomIn}
            disabled={scale >= 3}
            className="p-2 rounded-lg text-white hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="放大"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-white/30 mx-1" />

          <button
            type="button"
            onClick={handleDownload}
            className="p-2 rounded-lg text-white hover:bg-white/20 transition-colors"
            aria-label="下载图片"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
