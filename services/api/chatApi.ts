
import { GenerateContentResponse, Part, UsageMetadata, Content, Candidate } from "@google/genai";
import { ThoughtSupportingPart } from '../../types';
import { ExtendedUsageMetadata, ExtendedCandidate, GroundingMetadata, UrlContextMetadata } from '../../types/api';
import { logService } from "../logService";
import { getConfiguredApiClient } from "./baseApi";

const processResponse = (response: GenerateContentResponse) => {
    let thoughtsText = "";
    const responseParts: Part[] = [];

    if (response.candidates && response.candidates[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            const pAsThoughtSupporting = part as ThoughtSupportingPart;
            if (pAsThoughtSupporting.thought) {
                thoughtsText += part.text;
            } else {
                responseParts.push(part);
            }
        }
    }

    if (responseParts.length === 0 && response.text) {
        responseParts.push({ text: response.text });
    }

    const candidate = response.candidates?.[0] as ExtendedCandidate | undefined;
    const groundingMetadata = candidate?.groundingMetadata as GroundingMetadata | undefined;
    const finalMetadata: GroundingMetadata = groundingMetadata ? { ...groundingMetadata } : {};

    const urlContextMetadata = (candidate?.urlContextMetadata || candidate?.url_context_metadata) as UrlContextMetadata | undefined;

    const toolCalls = candidate?.toolCalls;
    if (toolCalls) {
        for (const toolCall of toolCalls) {
            if (toolCall.functionCall?.args?.urlContextMetadata) {
                if (!finalMetadata.citations) finalMetadata.citations = [];
                const newCitations = toolCall.functionCall.args.urlContextMetadata.citations || [];
                for (const newCitation of newCitations) {
                    if (!finalMetadata.citations.some((c: any) => c.uri === newCitation.uri)) {
                        finalMetadata.citations.push(newCitation);
                    }
                }
            }
        }
    }

    return {
        parts: responseParts,
        thoughts: thoughtsText || undefined,
        usage: response.usageMetadata as ExtendedUsageMetadata | undefined,
        grounding: Object.keys(finalMetadata).length > 0 ? finalMetadata : undefined,
        urlContext: urlContextMetadata
    };
};

export const sendStatelessMessageStreamApi = async (
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
): Promise<void> => {
    logService.info(`Sending message via stateless generateContentStream for ${modelId}`);
    let finalUsageMetadata: ExtendedUsageMetadata | undefined = undefined;
    let finalGroundingMetadata: GroundingMetadata | undefined = undefined;
    let finalUrlContextMetadata: UrlContextMetadata | undefined = undefined;

    try {
        const ai = await getConfiguredApiClient(apiKey);
        
        if (abortSignal.aborted) {
            logService.warn("Streaming aborted by signal before start.");
            return;
        }

        const result = await ai.models.generateContentStream({
            model: modelId,
            contents: [...history, { role: 'user', parts }],
            config: config
        });

        for await (const chunkResponse of result) {
            if (abortSignal.aborted) {
                logService.warn("Streaming aborted by signal.");
                break;
            }
            if (chunkResponse.usageMetadata) {
                finalUsageMetadata = chunkResponse.usageMetadata;
            }
            const candidate = chunkResponse.candidates?.[0] as ExtendedCandidate | undefined;
            
            if (candidate) {
                const metadataFromChunk = candidate.groundingMetadata as GroundingMetadata | undefined;
                if (metadataFromChunk) {
                    finalGroundingMetadata = metadataFromChunk;
                }

                const urlMetadata = (candidate.urlContextMetadata || candidate.url_context_metadata) as UrlContextMetadata | undefined;
                if (urlMetadata) {
                    finalUrlContextMetadata = urlMetadata;
                }

                const toolCalls = candidate.toolCalls;
                if (toolCalls) {
                    for (const toolCall of toolCalls) {
                        if (toolCall.functionCall?.args?.urlContextMetadata) {
                            if (!finalGroundingMetadata) finalGroundingMetadata = {} as GroundingMetadata;
                            if (!finalGroundingMetadata.citations) finalGroundingMetadata.citations = [];
                            const newCitations = toolCall.functionCall.args.urlContextMetadata.citations || [];
                            for (const newCitation of newCitations) {
                                if (!finalGroundingMetadata.citations.some((c: any) => c.uri === newCitation.uri)) {
                                    finalGroundingMetadata.citations.push(newCitation);
                                }
                            }
                        }
                    }
                }
                
                if (candidate.content?.parts?.length) {
                    for (const part of candidate.content.parts) {
                        const pAsThoughtSupporting = part as ThoughtSupportingPart;

                        if (pAsThoughtSupporting.thought) {
                            onThoughtChunk(part.text || '');
                        } else {
                            onPart(part);
                        }
                    }
                }
            }
        }
    } catch (error) {
        logService.error("Error sending message (stream):", error);
        onError(error instanceof Error ? error : new Error(String(error) || "Unknown error during streaming."));
    } finally {
        logService.info("Streaming complete.", { usage: finalUsageMetadata, hasGrounding: !!finalGroundingMetadata });
        onComplete(finalUsageMetadata, finalGroundingMetadata, finalUrlContextMetadata);
    }
};

export const sendStatelessMessageNonStreamApi = async (
  apiKey: string,
  modelId: string,
  history: Content[],
    parts: Part[],
    config: any,
    abortSignal: AbortSignal,
    onError: (error: Error) => void,
    onComplete: (parts: Part[], thoughtsText?: string, usageMetadata?: ExtendedUsageMetadata, groundingMetadata?: GroundingMetadata, urlContextMetadata?: UrlContextMetadata) => void
): Promise<void> => {
    logService.info(`Sending message via stateless generateContent (non-stream) for model ${modelId}`);
    
    try {
        const ai = await getConfiguredApiClient(apiKey);

        if (abortSignal.aborted) { onComplete([], "", undefined, undefined, undefined); return; }

        const response = await ai.models.generateContent({
            model: modelId,
            contents: [...history, { role: 'user', parts }],
            config: config
        });

        if (abortSignal.aborted) { onComplete([], "", undefined, undefined, undefined); return; }

        const { parts: responseParts, thoughts, usage, grounding, urlContext } = processResponse(response);

        logService.info(`Stateless non-stream complete for ${modelId}.`, { usage, hasGrounding: !!grounding, hasUrlContext: !!urlContext });
        onComplete(responseParts, thoughts, usage, grounding, urlContext);
    } catch (error) {
        logService.error(`Error in stateless non-stream for ${modelId}:`, error);
        onError(error instanceof Error ? error : new Error(String(error) || "Unknown error during stateless non-streaming call."));
    }
};
