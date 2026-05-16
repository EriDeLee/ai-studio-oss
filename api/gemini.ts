import { GoogleGenAI } from '@google/genai';
import type {
  GenerateContentConfig,
  GenerateContentParameters,
  GenerateContentResponse,
  Tool,
} from '@google/genai';

type GenerateContentPayload = {
  model: string;
  contents: GenerateContentParameters['contents'];
  config?: GenerateContentConfig & { tools?: Tool[] };
};

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const json = (body: unknown, init?: ResponseInit): Response => {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...(init?.headers ?? {}),
    },
  });
};

const getApiKey = (): string => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error('Missing Gemini API key: set GEMINI_API_KEY on Vercel'), {
      status: 500,
      code: 'missing_api_key',
    });
  }
  return apiKey;
};

const getBaseUrl = (): string | undefined => {
  return process.env.GEMINI_API_BASE_URL || process.env.VITE_GEMINI_BASE_URL;
};

const normalizePayload = (raw: unknown): GenerateContentPayload => {
  if (!isRecord(raw)) {
    throw Object.assign(new Error('Request body must be a JSON object'), {
      status: 400,
      code: 'invalid_request',
    });
  }

  if (typeof raw.model !== 'string' || !raw.model.trim()) {
    throw Object.assign(new Error('Missing model'), {
      status: 400,
      code: 'invalid_model',
    });
  }

  if (!Object.hasOwn(raw, 'contents')) {
    throw Object.assign(new Error('Missing contents'), {
      status: 400,
      code: 'invalid_contents',
    });
  }

  return {
    model: raw.model,
    contents: raw.contents as GenerateContentParameters['contents'],
    config: isRecord(raw.config) ? raw.config as GenerateContentPayload['config'] : undefined,
  };
};

const readJsonBody = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON'), {
      status: 400,
      code: 'invalid_json',
    });
  }
};

const getErrorStatus = (err: unknown): number => {
  if (isRecord(err) && typeof err.status === 'number' && Number.isInteger(err.status)) {
    return Math.min(Math.max(err.status, 400), 599);
  }
  return 500;
};

const getErrorCode = (err: unknown): unknown => {
  return isRecord(err) ? err.code : undefined;
};

const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  return 'Gemini proxy request failed';
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response(null, {
        status: 405,
        headers: {
          allow: 'POST',
          ...JSON_HEADERS,
        },
      });
    }

    try {
      const payload = normalizePayload(await readJsonBody(request));
      const baseUrl = getBaseUrl();
      const ai = new GoogleGenAI({
        apiKey: getApiKey(),
        httpOptions: {
          ...(baseUrl ? { baseUrl } : {}),
          headers: {
            'APP-Code': 'WHVL9885',
          },
        },
      });

      const response = await ai.models.generateContent({
        model: payload.model,
        contents: payload.contents,
        config: {
          ...(payload.config ?? {}),
          abortSignal: request.signal,
        },
      });

      const serializableResponse: Pick<GenerateContentResponse, 'candidates'> & { text?: string } = {
        candidates: response.candidates,
        text: response.text,
      };

      return json(serializableResponse);
    } catch (err) {
      const status = getErrorStatus(err);
      return json({
        error: getErrorMessage(err),
        code: getErrorCode(err) ?? status,
      }, { status });
    }
  },
};
