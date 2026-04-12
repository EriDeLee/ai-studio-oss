import { ChevronLeft, ChevronRight, Download, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
type NativeTouchEvent = Pick<TouchEvent, 'touches' | 'preventDefault'>;

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
  const [renderTransform, setRenderTransform] = useState<{ scale: number; offset: Point }>({
    scale: MIN_SCALE,
    offset: { x: 0, y: 0 },
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isCoarsePointer, setIsCoarsePointer] = useState(() => {
    const coarseByMedia = window.matchMedia('(pointer: coarse)').matches;
    const coarseByTouch = navigator.maxTouchPoints > 0;
    return coarseByMedia || coarseByTouch;
  });

  const modalRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const previousButtonRef = useRef<HTMLButtonElement | null>(null);
  const nextButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const gestureRectRef = useRef<DOMRect | null>(null);
  const restoreGestureUiTimerRef = useRef<number | null>(null);
  const isTouchInteractingRef = useRef(false);
  const isGestureDegradedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const queuedTransformRef = useRef<{ scale: number; offset: Point; commit: boolean } | null>(null);
  const transformRef = useRef<{ scale: number; offset: Point }>({
    scale: MIN_SCALE,
    offset: { x: 0, y: 0 },
  });
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

  const scale = renderTransform.scale;
  const offset = renderTransform.offset;

  const setChromeVisibility = useCallback((visible: boolean) => {
    const elements = [toolbarRef.current, previousButtonRef.current, nextButtonRef.current, closeButtonRef.current];

    for (const element of elements) {
      if (!element) continue;
      element.classList.toggle('opacity-0', !visible);
      element.classList.toggle('pointer-events-none', !visible);
      element.classList.toggle('opacity-100', visible);
      if (!visible) {
        element.setAttribute('aria-hidden', 'true');
      } else {
        element.removeAttribute('aria-hidden');
      }
    }
  }, []);

  const applyInteractionVisualState = useCallback(
    (active: boolean) => {
      const imageElement = imageRef.current;
      if (!imageElement) return;

      if (active) {
        imageElement.classList.add('transition-none', 'rounded-none', 'shadow-none');
        imageElement.classList.remove('rounded-lg', 'shadow-lg', 'shadow-2xl', 'transition-transform', 'duration-150');
      } else {
        imageElement.classList.remove('rounded-none', 'shadow-none');

        if (isCoarsePointer) {
          imageElement.classList.add('rounded-lg', 'shadow-lg', 'transition-none');
          imageElement.classList.remove('shadow-2xl', 'transition-transform', 'duration-150');
        } else {
          imageElement.classList.add('rounded-lg', 'shadow-2xl', 'transition-transform', 'duration-150');
          imageElement.classList.remove('shadow-lg', 'transition-none');
        }
      }
    },
    [isCoarsePointer]
  );

  const setGestureDegraded = useCallback(
    (active: boolean) => {
      if (isGestureDegradedRef.current === active) return;
      isGestureDegradedRef.current = active;

      const modalElement = modalRef.current;
      if (modalElement) {
        const backdropFilter = active || isCoarsePointer ? 'none' : 'blur(4px)';
        modalElement.style.backdropFilter = backdropFilter;
        modalElement.style.setProperty('-webkit-backdrop-filter', backdropFilter);
      }

      if (active) {
        setChromeVisibility(false);
      } else {
        setChromeVisibility(true);
      }

      applyInteractionVisualState(active);
    },
    [applyInteractionVisualState, isCoarsePointer, setChromeVisibility]
  );

  const applyTransformToDom = useCallback((next: { scale: number; offset: Point }) => {
    const imageElement = imageRef.current;
    if (!imageElement) return;
    imageElement.style.transform = `matrix3d(${next.scale},0,0,0,0,${next.scale},0,0,0,0,1,0,${next.offset.x},${next.offset.y},0,1)`;
  }, []);

  const clearInteractions = useCallback(() => {
    dragStateRef.current = null;
    touchRef.current.mode = 'none';
    gestureRectRef.current = null;
    isTouchInteractingRef.current = false;

    if (restoreGestureUiTimerRef.current != null) {
      window.clearTimeout(restoreGestureUiTimerRef.current);
      restoreGestureUiTimerRef.current = null;
    }

    setGestureDegraded(false);
    setIsDragging(false);
  }, [setGestureDegraded]);

  const commitTransform = useCallback((next: { scale: number; offset: Point }) => {
    transformRef.current = next;
    setRenderTransform(next);
    applyTransformToDom(next);
  }, [applyTransformToDom]);

  const flushTransform = useCallback(() => {
    rafRef.current = null;
    const queued = queuedTransformRef.current;
    if (!queued) return;
    queuedTransformRef.current = null;
    transformRef.current = { scale: queued.scale, offset: queued.offset };
    applyTransformToDom(transformRef.current);

    if (queued.commit) {
      setRenderTransform(transformRef.current);
    }
  }, [applyTransformToDom]);

  const scheduleTransform = useCallback(
    (nextPartial: Partial<{ scale: number; offset: Point }>, options?: { commit?: boolean }) => {
      const base = queuedTransformRef.current ?? { ...transformRef.current, commit: false };
      queuedTransformRef.current = {
        scale: nextPartial.scale ?? base.scale,
        offset: nextPartial.offset ?? base.offset,
        commit: Boolean(options?.commit || base.commit),
      };

      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(flushTransform);
      }
    },
    [flushTransform]
  );

  const flushAndCommitTransform = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const queued = queuedTransformRef.current;
    if (queued) {
      queuedTransformRef.current = null;
      const next = { scale: queued.scale, offset: queued.offset };
      transformRef.current = next;
      setRenderTransform(next);
      applyTransformToDom(next);
      return;
    }

    setRenderTransform({ ...transformRef.current });
    applyTransformToDom(transformRef.current);
  }, [applyTransformToDom]);

  const resetToMinZoom = useCallback(() => {
    queuedTransformRef.current = null;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const next = { scale: MIN_SCALE, offset: { x: 0, y: 0 } };
    commitTransform(next);
    clearInteractions();
  }, [clearInteractions, commitTransform]);

  const toCenterCoords = useCallback((clientX: number, clientY: number): Point => {
    const rect = gestureRectRef.current ?? containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    return {
      x: clientX - (rect.left + rect.width / 2),
      y: clientY - (rect.top + rect.height / 2),
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(pointer: coarse)');
    const update = () => {
      const coarseByTouch = navigator.maxTouchPoints > 0;
      setIsCoarsePointer(mediaQuery.matches || coarseByTouch);
    };

    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      if (restoreGestureUiTimerRef.current != null) {
        window.clearTimeout(restoreGestureUiTimerRef.current);
        restoreGestureUiTimerRef.current = null;
      }

      queuedTransformRef.current = null;
    };
  }, []);

  useEffect(() => {
    applyTransformToDom(transformRef.current);
    applyInteractionVisualState(false);
    setChromeVisibility(true);
    isGestureDegradedRef.current = false;
    const modalElement = modalRef.current;
    if (modalElement) {
      const backdropFilter = isCoarsePointer ? 'none' : 'blur(4px)';
      modalElement.style.backdropFilter = backdropFilter;
      modalElement.style.setProperty('-webkit-backdrop-filter', backdropFilter);
    }
  }, [applyInteractionVisualState, applyTransformToDom, currentIndex, image.base64, image.mimeType, isCoarsePointer, setChromeVisibility]);

  const zoomAt = useCallback(
    (targetScale: number, focal: Point) => {
      const prev = transformRef.current;
      const nextScale = clampScale(targetScale);
      if (nextScale === prev.scale) return;

      if (nextScale <= MIN_SCALE) {
        resetToMinZoom();
        return;
      }

      const ratio = nextScale / prev.scale;
      const nextOffset = {
        x: prev.offset.x * ratio + focal.x * (1 - ratio),
        y: prev.offset.y * ratio + focal.y * (1 - ratio),
      };

      commitTransform({ scale: nextScale, offset: nextOffset });
    },
    [commitTransform, resetToMinZoom]
  );

  const zoomByStep = useCallback(
    (delta: number) => {
      zoomAt(transformRef.current.scale + delta, { x: 0, y: 0 });
    },
    [zoomAt]
  );

  const imageSrc = useMemo(
    () => `data:${image.mimeType};base64,${image.base64}`,
    [image.base64, image.mimeType]
  );

  const handleDownload = useCallback(() => {
    downloadBase64Image(image.base64, image.mimeType, `ai-image-${Date.now()}.png`);
  }, [image]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLImageElement>) => {
      if (e.pointerType === 'touch') return;
      if (transformRef.current.scale <= 1) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStateRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startOffset: transformRef.current.offset,
      };
      setIsDragging(true);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLImageElement>) => {
      if (e.pointerType === 'touch') return;
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      e.preventDefault();
      scheduleTransform(
        {
          offset: {
            x: drag.startOffset.x + (e.clientX - drag.startX),
            y: drag.startOffset.y + (e.clientY - drag.startY),
          },
        },
        { commit: false }
      );
    },
    [scheduleTransform]
  );

  const handlePointerEnd = useCallback(
    (e: React.PointerEvent<HTMLImageElement>) => {
      if (e.pointerType === 'touch') return;
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      dragStateRef.current = null;
      flushAndCommitTransform();
      setIsDragging(false);
    },
    [flushAndCommitTransform]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLImageElement>) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const focal = toCenterCoords(e.clientX, e.clientY);
      const direction = e.deltaY > 0 ? -0.2 : 0.2;
      zoomAt(transformRef.current.scale + direction, focal);
    },
    [toCenterCoords, zoomAt]
  );

  const handleTouchStart = useCallback(
    (e: NativeTouchEvent) => {
      const current = transformRef.current;
      gestureRectRef.current = containerRef.current?.getBoundingClientRect() ?? null;

      if (restoreGestureUiTimerRef.current != null) {
        window.clearTimeout(restoreGestureUiTimerRef.current);
        restoreGestureUiTimerRef.current = null;
      }

      if (!isGestureDegradedRef.current) {
        setGestureDegraded(true);
      }

      if (e.touches.length === 2) {
        e.preventDefault();
        const a = e.touches[0];
        const b = e.touches[1];
        const midpoint = getTouchMidpoint(a, b);
        touchRef.current = {
          mode: 'pinch',
          startScale: current.scale,
          startOffset: current.offset,
          startDistance: getTouchDistance(a, b),
          startMidpoint: toCenterCoords(midpoint.x, midpoint.y),
          startTouch: { x: 0, y: 0 },
        };

        if (!isCoarsePointer && !isTouchInteractingRef.current) {
          isTouchInteractingRef.current = true;
        }

        return;
      }

      if (e.touches.length === 1 && current.scale > 1) {
        const t = e.touches[0];
        touchRef.current = {
          mode: 'pan',
          startScale: current.scale,
          startOffset: current.offset,
          startDistance: 0,
          startMidpoint: { x: 0, y: 0 },
          startTouch: { x: t.clientX, y: t.clientY },
        };

        if (!isCoarsePointer && !isTouchInteractingRef.current) {
          isTouchInteractingRef.current = true;
        }

        return;
      }

      touchRef.current.mode = 'none';
      if (!isCoarsePointer && isTouchInteractingRef.current) {
        isTouchInteractingRef.current = false;
      }
    },
    [isCoarsePointer, setGestureDegraded, toCenterCoords]
  );

  const handleTouchMove = useCallback(
    (e: NativeTouchEvent) => {
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

        if (nextScale <= MIN_SCALE) {
          resetToMinZoom();
          return;
        }

        const scaleRatio = nextScale / state.startScale;
        const zoomOffset = {
          x: state.startOffset.x * scaleRatio + state.startMidpoint.x * (1 - scaleRatio),
          y: state.startOffset.y * scaleRatio + state.startMidpoint.y * (1 - scaleRatio),
        };

        scheduleTransform(
          {
            scale: nextScale,
            offset: {
              x: zoomOffset.x + (currentMidpoint.x - state.startMidpoint.x),
              y: zoomOffset.y + (currentMidpoint.y - state.startMidpoint.y),
            },
          },
          { commit: false }
        );
        return;
      }

      if (state.mode === 'pan' && e.touches.length === 1 && transformRef.current.scale > 1) {
        e.preventDefault();
        const t = e.touches[0];
        scheduleTransform(
          {
            offset: {
              x: state.startOffset.x + (t.clientX - state.startTouch.x),
              y: state.startOffset.y + (t.clientY - state.startTouch.y),
            },
          },
          { commit: false }
        );
      }
    },
    [resetToMinZoom, scheduleTransform, toCenterCoords]
  );

  const handleTouchEnd = useCallback(
    (e: NativeTouchEvent) => {
      touchRef.current.mode = 'none';
      gestureRectRef.current = null;
      flushAndCommitTransform();

      if (!isCoarsePointer && isTouchInteractingRef.current) {
        isTouchInteractingRef.current = false;
      }

      if (e.touches.length > 0) {
        return;
      }

      if (restoreGestureUiTimerRef.current != null) {
        window.clearTimeout(restoreGestureUiTimerRef.current);
      }

      restoreGestureUiTimerRef.current = window.setTimeout(() => {
        setGestureDegraded(false);
        restoreGestureUiTimerRef.current = null;
      }, 100);
    },
    [flushAndCommitTransform, isCoarsePointer, setGestureDegraded]
  );

  const modalBackdropFilter = useMemo(() => {
    if (isCoarsePointer) {
      return 'none';
    }
    return 'blur(4px)';
  }, [isCoarsePointer]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  useEffect(() => {
    const imageElement = imageRef.current;
    if (!imageElement) return;

    const handleNativeTouchStart = (event: TouchEvent) => {
      handleTouchStart(event);
    };
    const handleNativeTouchMove = (event: TouchEvent) => {
      handleTouchMove(event);
    };
    const handleNativeTouchEnd = (event: TouchEvent) => {
      handleTouchEnd(event);
    };

    const listenerOptions: AddEventListenerOptions = { passive: false };
    imageElement.addEventListener('touchstart', handleNativeTouchStart, listenerOptions);
    imageElement.addEventListener('touchmove', handleNativeTouchMove, listenerOptions);
    imageElement.addEventListener('touchend', handleNativeTouchEnd, listenerOptions);
    imageElement.addEventListener('touchcancel', handleNativeTouchEnd, listenerOptions);

    return () => {
      imageElement.removeEventListener('touchstart', handleNativeTouchStart);
      imageElement.removeEventListener('touchmove', handleNativeTouchMove);
      imageElement.removeEventListener('touchend', handleNativeTouchEnd);
      imageElement.removeEventListener('touchcancel', handleNativeTouchEnd);
    };
  }, [handleTouchEnd, handleTouchMove, handleTouchStart]);

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
      ref={modalRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/[0.78]"
      style={{
        paddingTop: 'var(--safe-area-inset-top)',
        paddingBottom: 'var(--safe-area-inset-bottom)',
        paddingLeft: 'var(--safe-area-inset-left)',
        paddingRight: 'var(--safe-area-inset-right)',
        backdropFilter: modalBackdropFilter,
        WebkitBackdropFilter: modalBackdropFilter,
      }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
    >
      {onPrevious && (
        <button
          ref={previousButtonRef}
          type="button"
          onClick={onPrevious}
          className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white transition-opacity hover:bg-white/25 opacity-100"
          style={{ left: 'calc(0.5rem + var(--safe-area-inset-left))' }}
          aria-label="上一张"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}

      {onNext && (
        <button
          ref={nextButtonRef}
          type="button"
          onClick={onNext}
          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white transition-opacity hover:bg-white/25 opacity-100"
          style={{ right: 'calc(0.5rem + var(--safe-area-inset-right))' }}
          aria-label="下一张"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      <button
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
        className="absolute right-2 top-2 z-10 rounded-full bg-white/15 p-2 text-white transition-opacity hover:bg-white/25 opacity-100"
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
          ref={imageRef}
          src={imageSrc}
          alt="预览图片"
          draggable={false}
          className={`max-h-[86dvh] max-w-full object-contain rounded-lg ${
            isCoarsePointer ? 'shadow-lg transition-none' : 'shadow-2xl transition-transform duration-150'
          } ${scale > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'}`}
          style={{
            transform: `matrix3d(${scale},0,0,0,0,${scale},0,0,0,0,1,0,${offset.x},${offset.y},0,1)`,
            transformOrigin: 'center center',
            touchAction: 'none',
            willChange: 'transform',
            backfaceVisibility: 'hidden',
            contain: 'layout paint style',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onWheel={handleWheel}
          onLoad={resetToMinZoom}
          onDragStart={(e) => e.preventDefault()}
        />
      </div>

      <div
        ref={toolbarRef}
        className="absolute bottom-0 left-0 right-0 flex items-center justify-center p-4 transition-opacity opacity-100"
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

          <button
            type="button"
            onClick={handleDownload}
            className="rounded-md p-2 hover:bg-white/15"
            aria-label="下载图片"
          >
            <Download className="h-4 w-4" />
          </button>

          <div className="mx-1 h-5 w-px bg-white/30" />

          <span className="min-w-[3.6rem] text-center text-xs tabular-nums text-white/85">
            {currentIndex + 1}/{total}
          </span>
        </div>
      </div>
    </div>
  );
}
