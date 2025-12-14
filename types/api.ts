
import { Part, UsageMetadata, File as GeminiFile, Content, Candidate } from "@google/genai";

// 扩展官方 UsageMetadata 以包含可能缺失的字段
export interface ExtendedUsageMetadata extends UsageMetadata {
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number; // Gemini 2.5/3.0 thinking tokens
}

// 定义 Grounding 相关的具体结构
export interface GroundingChunk {
    web?: {
        uri: string;
        title: string;
    };
}

export interface GroundingSupport {
    segment: {
        startIndex: number;
        endIndex: number;
        text: string;
    };
    groundingChunkIndices: number[];
    confidenceScores: number[];
}

export interface GroundingMetadata {
    groundingChunks?: GroundingChunk[];
    groundingSupports?: GroundingSupport[];
    webSearchQueries?: string[];
    searchEntryPoint?: any;
    citations?: Array<{
        startIndex: number;
        endIndex: number;
        uri: string;
        title: string;
        license?: string;
        publicationDate?: { year: number; month: number; day: number };
    }>;
}

export interface UrlContextItem {
    retrievedUrl?: string; // camelCase
    retrieved_url?: string; // snake_case fallback
    urlRetrievalStatus?: string;
    url_retrieval_status?: string;
}

export interface UrlContextMetadata {
    urlMetadata?: UrlContextItem[];
    url_metadata?: UrlContextItem[]; // snake_case fallback
}

// 扩展 Candidate 接口
export interface ExtendedCandidate {
    content?: Content;
    finishReason?: string;
    index?: number;
    safetyRatings?: any[];

    // 扩展属性
    groundingMetadata?: GroundingMetadata;
    urlContextMetadata?: UrlContextMetadata;
    // 处理原始 API 可能返回 snake_case 的情况
    url_context_metadata?: UrlContextMetadata;
    toolCalls?: Array<{
        functionCall?: {
            name: string;
            args: Record<string, any>;
        }
    }>;
}

export interface GeminiService {
  uploadFile: (
    apiKey: string,
    file: File,
    mimeType: string,
    displayName: string,
    signal: AbortSignal,
    onProgress?: (loaded: number, total: number) => void
  ) => Promise<GeminiFile>;
  getFileMetadata: (apiKey: string, fileApiName: string) => Promise<GeminiFile | null>;

  // Stateless Message Sending
  sendMessageStream: (
    apiKey: string,
    modelId: string,
    history: Content[],
    parts: Part[],
    config: any,
    abortSignal: AbortSignal,
    onPart: (part: Part) => void,
    onThoughtChunk: (chunk: string) => void,
    onError: (error: Error) => void,
    onComplete: (usageMetadata?: ExtendedUsageMetadata, groundingMetadata?: GroundingMetadata, urlContextMetadata?: UrlContextMetadata) => void
  ) => Promise<void>;

  sendMessageNonStream: (
    apiKey: string,
    modelId: string,
    history: Content[],
    parts: Part[],
    config: any,
    abortSignal: AbortSignal,
    onError: (error: Error) => void,
    onComplete: (parts: Part[], thoughtsText?: string, usageMetadata?: ExtendedUsageMetadata, groundingMetadata?: GroundingMetadata, urlContextMetadata?: UrlContextMetadata) => void
  ) => Promise<void>;

  generateImages: (apiKey: string, modelId: string, prompt: string, aspectRatio: string, imageSize: string | undefined, abortSignal: AbortSignal) => Promise<string[]>;
  generateSpeech: (apiKey: string, modelId: string, text: string, voice: string, abortSignal: AbortSignal) => Promise<string>;
  transcribeAudio: (apiKey: string, audioFile: File, modelId: string) => Promise<string>;
  translateText(apiKey: string, text: string, targetLanguage?: string): Promise<string>;
  generateTitle(apiKey: string, userContent: string, modelContent: string, language: 'en' | 'zh'): Promise<string>;
  generateSuggestions(apiKey: string, userContent: string, modelContent: string, language: 'en' | 'zh'): Promise<string[]>;
  editImage: (apiKey: string, modelId: string, history: Content[], parts: Part[], abortSignal: AbortSignal, aspectRatio?: string, imageSize?: string) => Promise<Part[]>;
  countTokens: (apiKey: string, modelId: string, parts: Part[]) => Promise<number>;
}

export interface ThoughtSupportingPart extends Part {
    thought?: any;
}