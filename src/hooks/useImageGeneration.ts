import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
} from '../types';
import { generateImage } from '../lib/gemini';

interface UseImageGenerationState {
  isLoading: boolean;
  error: string | null;
  response: ImageGenerationResponse | null;
}

interface UseImageGenerationReturn extends UseImageGenerationState {
  generate: (request: ImageGenerationRequest) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

export function useImageGeneration(): UseImageGenerationReturn {
  const [state, setState] = useState<UseImageGenerationState>({
    isLoading: false,
    error: null,
    response: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const generate = useCallback(async (request: ImageGenerationRequest) => {
    // Cancel any in-flight request
    abortControllerRef.current?.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await generateImage(request, controller.signal);
      setState({ isLoading: false, error: null, response });
    } catch (err) {
      // Ignore abort errors
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      const errorMessage =
        err instanceof Error ? err.message : 'Failed to generate image';
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
    }
  }, []);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const reset = useCallback(() => {
    cancel();
    setState({ isLoading: false, error: null, response: null });
  }, [cancel]);

  return { ...state, generate, cancel, reset };
}
