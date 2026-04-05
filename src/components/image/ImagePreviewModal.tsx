import { ChevronLeft, ChevronRight, Download, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { downloadBase64Image } from '../../lib/utils';

interface ImagePreviewModalProps {
  image: { base64: string; mimeType: string };
  currentIndex: number;
  total: number;
  onPrevious?: () => void;
  onNext?: () => void;
  onClose: () => void;
}

type Point = { x: number; y: number };
type TouchMode = 'none' | 'pan' | 'pinch';

const MIN_SCALE = 1;
const MAX_SCALE = 6;

const clampScale = (value: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, value));

const getTouchDistance = (
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number }
) => {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
};

const getTouchMidpoint = (
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number }
): Point => ({
  x: (a.clientX + b.clientX) / 2,
  y: (a.clientY + b.clientY) / 2,
});

export function ImagePreviewModal({
  image,
  currentIndex,
  total,
  onPrevious,
  onNext,
  onClose,
}: ImagePreviewModalProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isTouchInteracting, setIsTouchInteracting] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startOffset: Point;
  } | null>(null);
  const touchRef = useRef<{
    mode: TouchMode;
    startScale: number;
    startOffset: Point;
    startDistance: number;
    startMidpoint: Point;
    startTouch: Point;
  }>({
    mode: 'none',
    startScale: 1,
    startOffset: { x: 0, y: 0 },
    startDistance: 0,
    startMidpoint: { x: 0, y: 0 },
    startTouch: { x: 0, y: 0 },
  });

  const toCenterCoords = useCallback((clientX: number, clientY: number): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    return {
      x: clientX - (rect.left + rect.width / 2),
      y: clientY - (rect.top + rect.height / 2),
    };
  }, []);

  const zoomAt = useCallback((targetScale: number, focal: Point) => {
    setScale((prevScale) => {
      const nextScale = clampScale(targetScale);
      if (nextScale === prevScale) return prevScale;

      const ratio = nextScale / prevScale;
      setOffset((prevOffset) => ({
        x: prevOffset.x * ratio + focal.x * (1 - ratio),
        y: prevOffset.y * ratio + focal.y * (1 - ratio),
      }));

      return nextScale;
    });
  }, []);

  const zoomByStep = useCallback((delta: number) => {
    zoomAt(scale + delta, { x: 0, y: 0 });
  }, [scale, zoomAt]);

  const handleDownload = useCallback(() => {
    downloadBase64Image(image.base64, image.mimeType, `ai-image-${Date.now()}.png`);
  }, [image]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLImageElement>) => {
    if (scale <= 1) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startOffset: offset,
    };
    setIsDragging(true);
  }, [offset, scale]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLImageElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.preventDefault();
    setOffset({
      x: drag.startOffset.x + (e.clientX - drag.startX),
      y: drag.startOffset.y + (e.clientY - drag.startY),
    });
  }, []);

  const handlePointerEnd = useCallback((e: React.PointerEvent<HTMLImageElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragStateRef.current = null;
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLImageElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const focal = toCenterCoords(e.clientX, e.clientY);
    const direction = e.deltaY > 0 ? -0.2 : 0.2;
    zoomAt(scale + direction, focal);
  }, [scale, toCenterCoords, zoomAt]);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLImageElement>) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const a = e.touches[0];
      const b = e.touches[1];
      const midpoint = getTouchMidpoint(a, b);
      touchRef.current = {
        mode: 'pinch',
        startScale: scale,
        startOffset: offset,
        startDistance: getTouchDistance(a, b),
        startMidpoint: toCenterCoords(midpoint.x, midpoint.y),
        startTouch: { x: 0, y: 0 },
      };
      setIsTouchInteracting(true);
      return;
    }

    if (e.touches.length === 1 && scale > 1) {
      const t = e.touches[0];
      touchRef.current = {
        mode: 'pan',
        startScale: scale,
        startOffset: offset,
        startDistance: 0,
        startMidpoint: { x: 0, y: 0 },
        startTouch: { x: t.clientX, y: t.clientY },
      };
      setIsTouchInteracting(true);
    }
  }, [offset, scale, toCenterCoords]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLImageElement>) => {
    const state = touchRef.current;

    if (state.mode === 'pinch' && e.touches.length === 2) {
      e.preventDefault();
      const a = e.touches[0];
      const b = e.touches[1];
      const midpoint = getTouchMidpoint(a, b);
      const currentMidpoint = toCenterCoords(midpoint.x, midpoint.y);
      const distance = getTouchDistance(a, b);
      const ratio = state.startDistance > 0 ? distance / state.startDistance : 1;
      const nextScale = clampScale(state.startScale * ratio);
      const scaleRatio = nextScale / state.startScale;

      const zoomOffset = {
        x: state.startOffset.x * scaleRatio + state.startMidpoint.x * (1 - scaleRatio),
        y: state.startOffset.y * scaleRatio + state.startMidpoint.y * (1 - scaleRatio),
      };

      setScale(nextScale);
      setOffset({
        x: zoomOffset.x + (currentMidpoint.x - state.startMidpoint.x),
        y: zoomOffset.y + (currentMidpoint.y - state.startMidpoint.y),
      });
      return;
    }

    if (state.mode === 'pan' && e.touches.length === 1 && scale > 1) {
      e.preventDefault();
      const t = e.touches[0];
      setOffset({
        x: state.startOffset.x + (t.clientX - state.startTouch.x),
        y: state.startOffset.y + (t.clientY - state.startTouch.y),
      });
    }
  }, [scale, toCenterCoords]);

  const handleTouchEnd = useCallback(() => {
    touchRef.current.mode = 'none';
    setIsTouchInteracting(false);
  }, []);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    dragStateRef.current = null;
    setIsDragging(false);
  }, [image.base64, image.mimeType]);

  useEffect(() => {
    if (scale <= 1) {
      setOffset({ x: 0, y: 0 });
      dragStateRef.current = null;
      setIsDragging(false);
      touchRef.current.mode = 'none';
      setIsTouchInteracting(false);
    }
  }, [scale]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.imagePreviewOpen = '1';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && onPrevious) {
        e.preventDefault();
        onPrevious();
      } else if (e.key === 'ArrowRight' && onNext) {
        e.preventDefault();
        onNext();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      delete root.dataset.imagePreviewOpen;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, onNext, onPrevious]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
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
      {onPrevious && (
        <button
          type="button"
          onClick={onPrevious}
          className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white transition-colors hover:bg-white/25"
          style={{ left: 'calc(0.5rem + var(--safe-area-inset-left))' }}
          aria-label="上一张"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}

      {onNext && (
        <button
          type="button"
          onClick={onNext}
          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white transition-colors hover:bg-white/25"
          style={{ right: 'calc(0.5rem + var(--safe-area-inset-right))' }}
          aria-label="下一张"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      <button
        type="button"
        onClick={onClose}
        className="absolute right-2 top-2 z-10 rounded-full bg-white/15 p-2 text-white transition-colors hover:bg-white/25"
        style={{
          top: 'calc(0.5rem + var(--safe-area-inset-top))',
          right: 'calc(0.5rem + var(--safe-area-inset-right))',
        }}
        aria-label="关闭预览"
      >
        <X className="h-5 w-5" />
      </button>

      <div ref={containerRef} className="relative flex h-full w-full items-center justify-center p-4">
        <img
          src={`data:${image.mimeType};base64,${image.base64}`}
          alt="预览图片"
          className={`max-h-[86dvh] max-w-full rounded-lg object-contain shadow-2xl ${
            isDragging || isTouchInteracting ? 'transition-none' : 'transition-transform duration-150'
          } ${scale > 1 ? (isDragging || isTouchInteracting ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'}`}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            touchAction: 'none',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        />
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 flex items-center justify-center p-4"
        style={{ paddingBottom: 'calc(1rem + var(--safe-area-inset-bottom))' }}
      >
        <div className="flex items-center gap-2 rounded-full bg-black/55 px-3 py-2 text-white backdrop-blur-sm">
          <button
            type="button"
            onClick={() => zoomByStep(-0.25)}
            disabled={scale <= MIN_SCALE}
            className="rounded-md p-2 hover:bg-white/15 disabled:opacity-40"
            aria-label="缩小"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="min-w-[3rem] text-center text-sm tabular-nums">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            onClick={() => zoomByStep(0.25)}
            disabled={scale >= MAX_SCALE}
            className="rounded-md p-2 hover:bg-white/15 disabled:opacity-40"
            aria-label="放大"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <div className="mx-1 h-5 w-px bg-white/30" />
          <span className="min-w-[3.6rem] text-center text-xs tabular-nums text-white/85">{currentIndex + 1}/{total}</span>
          <div className="mx-1 h-5 w-px bg-white/30" />
          <button
            type="button"
            onClick={handleDownload}
            className="rounded-md p-2 hover:bg-white/15"
            aria-label="下载图片"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
