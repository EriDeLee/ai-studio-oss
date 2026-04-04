import { useState, useCallback } from 'react';
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
  reset: () => void;
}

export function useImageGeneration(): UseImageGenerationReturn {
  const [state, setState] = useState<UseImageGenerationState>({
    isLoading: false,
    error: null,
    response: null,
  });

  const generate = useCallback(async (request: ImageGenerationRequest) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await generateImage(request);
      setState({ isLoading: false, error: null, response });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to generate image';
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
    }
  }, []);

  const reset = useCallback(() => {
    setState({ isLoading: false, error: null, response: null });
  }, []);

  return { ...state, generate, reset };
}
