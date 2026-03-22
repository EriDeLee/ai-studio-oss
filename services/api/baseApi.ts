
import { GoogleGenAI, GoogleGenAIOptions, Modality } from "@google/genai";
import { logService } from "../logService";
import { dbService } from '../../utils/db';
import { DEEP_SEARCH_SYSTEM_PROMPT } from "../../constants/promptConstants";
import { SafetySetting, MediaResolution } from "../../types/settings";
import { isGemini3Model } from "../../utils/appUtils";

// Export constants for polling
export const POLLING_INTERVAL_MS = 2000;
export const MAX_POLLING_DURATION_MS = 10 * 60 * 1000;

/**
 * Helper function: Normalize URL to remove trailing slashes, version suffixes, and handle protocol.
 * The SDK appends /v1beta or /v1 automatically, so we must strip them from the base.
 * @param url - The URL to normalize
 * @returns Normalized URL or null if empty/invalid
 */
const normalizeUrl = (url: string | null | undefined): string | null => {
    if (!url || !url.trim()) return null;

    let cleanUrl = url.trim();

    // Remove trailing slashes
    while (cleanUrl.endsWith('/')) {
        cleanUrl = cleanUrl.slice(0, -1);
    }

    // Remove version suffixes (v1, v1beta, v2, etc.) to prevent double-versioning by SDK
    cleanUrl = cleanUrl.replace(/\/v\d+(beta)?$/, '');

    // Ensure URL has protocol, if not provided assume https
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        cleanUrl = `https://${cleanUrl}`;
    }

    return cleanUrl;
};

/**
 * Get base SDK client with proper Base URL handling via httpOptions
 * @param apiKey - API key for authentication
 * @param specificBaseUrl - (optional) Specific Base URL to use
 */
export const getClient = (apiKey: string, specificBaseUrl?: string | null): GoogleGenAI => {
    try {
        // Sanitize API Key
        const sanitizedApiKey = apiKey
            .replace(/[\u2013\u2014]/g, '-')
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/[\u00A0]/g, ' ');

        if (apiKey !== sanitizedApiKey) {
            logService.warn("API key sanitized: non-ASCII characters removed.");
        }

        // Construct Configuration strictly according to GoogleGenAIOptions interface
        const clientConfig: GoogleGenAIOptions = {
            apiKey: sanitizedApiKey
        };

        // Configure Base URL via httpOptions if provided
        // This overrides the default AI platform service endpoint
        if (specificBaseUrl) {
            clientConfig.httpOptions = {
                baseUrl: specificBaseUrl,
                // apiVersion can be added here if needed, e.g., 'v1beta'
            };
        }

        // Log configuration in Dev mode (masking key)
        if (process.env.NODE_ENV === 'development') {
            console.log('[API Init]', {
                hasKey: !!sanitizedApiKey,
                baseUrl: clientConfig.httpOptions?.baseUrl || 'DEFAULT (Official Google)',
            });
        }

        return new GoogleGenAI(clientConfig);
    } catch (error) {
        logService.error("Failed to initialize GoogleGenAI client:", error);
        throw error;
    }
};

/**
 * Core method: Get API client configured with strict separation logic
 * Logic:
 * 1. Custom Config ON: Use DB Settings (Key & Proxy). NO Env fallback.
 * 2. Custom Config OFF: Use Env Vars (Key & BaseURL).
 */
export const getConfiguredApiClient = async (apiKey: string): Promise<GoogleGenAI> => {
    // 1. Read user settings
    const settings = await dbService.getAppSettings();

    let resolvedBaseUrl: string | null = null;

    // 2. Determine Base URL based on strict separation logic
    if (settings?.useCustomApiConfig) {
        // --- Mode: Custom Configuration ---
        // If "Use API Proxy" is checked in UI, use that URL. Otherwise default.
        if (settings.useApiProxy && settings.apiProxyUrl) {
            resolvedBaseUrl = normalizeUrl(settings.apiProxyUrl);
            logService.debug('[API Config] Using Custom Proxy URL from Settings.');
        } else {
            logService.debug('[API Config] Custom Config ON, but Proxy OFF. Using Default Google Endpoint.');
        }
    } else {
        // --- Mode: Environment Configuration ---
        // Use environment variable if available.
        const envBaseUrl = normalizeUrl(process.env.GEMINI_API_BASE_URL);
        if (envBaseUrl) {
            resolvedBaseUrl = envBaseUrl;
            logService.debug('[API Config] Using Base URL from Environment Variables.');
        } else {
            logService.debug('[API Config] Env Config ON, but no Base URL var. Using Default Google Endpoint.');
        }
    }

    // 3. Instantiate client
    // Note: The apiKey passed here is already selected by utils/apiUtils.ts based on the same logic
    return getClient(apiKey, resolvedBaseUrl);
};

// Keep the buildGenerationConfig function unchanged
export const buildGenerationConfig = (
    modelId: string,
    systemInstruction: string,
    config: { temperature?: number; topP?: number },
    showThoughts: boolean,
    thinkingBudget: number,
    isGoogleSearchEnabled?: boolean,
    isCodeExecutionEnabled?: boolean,
    isUrlContextEnabled?: boolean,
    thinkingLevel?: 'LOW' | 'HIGH',
    aspectRatio?: string,
    isDeepSearchEnabled?: boolean,
    imageSize?: string,
    safetySettings?: SafetySetting[],
    mediaResolution?: MediaResolution
): any => {
    if (modelId === 'gemini-2.5-flash-image' || modelId === 'gemini-2.5-flash-image-preview') {
        const imageConfig: any = {};
        if (aspectRatio && aspectRatio !== 'Auto') imageConfig.aspectRatio = aspectRatio;

        const config: any = {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        };
        if (Object.keys(imageConfig).length > 0) {
            config.imageConfig = imageConfig;
        }
        return config;
    }

    if (modelId === 'gemini-3-pro-image-preview' || modelId === 'gemini-3.1-flash-image-preview') {
         const imageConfig: any = {
            imageSize: imageSize || '1K',
         };
         if (aspectRatio && aspectRatio !== 'Auto') {
            imageConfig.aspectRatio = aspectRatio;
         }

         const config: any = {
            responseModalities: ['IMAGE', 'TEXT'],
            imageConfig,
         };

         const tools = [];
         if (isGoogleSearchEnabled || isDeepSearchEnabled) tools.push({ googleSearch: {} });
         if (tools.length > 0) config.tools = tools;

         if (systemInstruction) config.systemInstruction = systemInstruction;

         // Gemini 3.1 Flash Image Preview supports thinking
         if (modelId === 'gemini-3.1-flash-image-preview') {
             config.thinkingConfig = {
                 includeThoughts: showThoughts,
             };
             if (thinkingBudget > 0) {
                 config.thinkingConfig.thinkingBudget = thinkingBudget;
             } else {
                 config.thinkingConfig.thinkingLevel = thinkingLevel || 'HIGH';
             }
         }

         return config;
    }

    let finalSystemInstruction = systemInstruction;
    if (isDeepSearchEnabled) {
        finalSystemInstruction = finalSystemInstruction
            ? `${finalSystemInstruction}\n\n${DEEP_SEARCH_SYSTEM_PROMPT}`
            : DEEP_SEARCH_SYSTEM_PROMPT;
    }

    const generationConfig: any = {
        ...config,
        systemInstruction: finalSystemInstruction || undefined,
        safetySettings: safetySettings || undefined,
    };

    // Check if model is Gemini 3. If so, prefer per-part media resolution (handled in content construction),
    // but we can omit the global config to avoid conflict, or set it if per-part isn't used.
    // However, if we are NOT Gemini 3, we MUST use global config.
    const isGemini3 = isGemini3Model(modelId);
    
    if (!isGemini3 && mediaResolution) {
        // For non-Gemini 3 models, apply global resolution if specified
        generationConfig.mediaResolution = mediaResolution;
    } 
    // Note: For Gemini 3, we don't set global mediaResolution here because we inject it into parts in `buildContentParts`.
    // The API documentation says per-part overrides global, but to be clean/explicit as requested ("become Per-part"), 
    // we skip global for G3.

    if (!generationConfig.systemInstruction) {
        delete generationConfig.systemInstruction;
    }

    // Robust check for Gemini 3
    if (isGemini3) {
        // Gemini 3.0 supports both thinkingLevel and thinkingBudget.
        // We prioritize budget if it's explicitly set (>0).
        generationConfig.thinkingConfig = {
            includeThoughts: showThoughts,
        };

        if (thinkingBudget > 0) {
            generationConfig.thinkingConfig.thinkingBudget = thinkingBudget;
        } else {
            generationConfig.thinkingConfig.thinkingLevel = thinkingLevel || 'HIGH';
        }
    } else {
        const modelSupportsThinking = [
            'models/gemini-flash-lite-latest',
            'gemini-2.5-pro',
            'models/gemini-flash-latest'
        ].includes(modelId) || modelId.includes('gemini-2.5');

        if (modelSupportsThinking) {
            generationConfig.thinkingConfig = {
                thinkingBudget: thinkingBudget,
                includeThoughts: showThoughts,
            };
        }
    }

    const tools = [];
    if (isGoogleSearchEnabled || isDeepSearchEnabled) {
        tools.push({ googleSearch: {} });
    }
    if (isCodeExecutionEnabled) {
        tools.push({ codeExecution: {} });
    }
    if (isUrlContextEnabled) {
        tools.push({ urlContext: {} });
    }

    if (tools.length > 0) {
        generationConfig.tools = tools;
        delete generationConfig.responseMimeType;
        delete generationConfig.responseSchema;
    }

    return generationConfig;
};
