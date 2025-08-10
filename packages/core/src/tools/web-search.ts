/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroundingMetadata } from '@google/genai';
import { BaseTool, Icon, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';

import { getErrorMessage } from '../utils/errors.js';
import { Config } from '../config/config.js';
import { getResponseText } from '../utils/generateContentResponseUtilities.js';
import { AuthType } from '../core/contentGenerator.js';

interface GroundingChunkWeb {
  uri?: string;
  title?: string;
}

interface GroundingChunkItem {
  web?: GroundingChunkWeb;
  // Other properties might exist if needed in the future
}

interface GroundingSupportSegment {
  startIndex: number;
  endIndex: number;
  text?: string; // text is optional as per the example
}

interface GroundingSupportItem {
  segment?: GroundingSupportSegment;
  groundingChunkIndices?: number[];
  confidenceScores?: number[]; // Optional as per example
}

/**
 * Parameters for the WebSearchTool.
 */
export interface WebSearchToolParams {
  /**
   * The search query.
   */

  query: string;
}

/**
 * Extends ToolResult to include sources for web search.
 */
export interface WebSearchToolResult extends ToolResult {
  sources?: GroundingMetadata extends { groundingChunks: GroundingChunkItem[] }
    ? GroundingMetadata['groundingChunks']
    : GroundingChunkItem[];
}

/**
 * A tool to perform web searches using Google Search via the Gemini API.
 */
export class WebSearchTool extends BaseTool<
  WebSearchToolParams,
  WebSearchToolResult
> {
  static readonly Name: string = 'google_web_search';

  constructor(private readonly config: Config) {
    super(
      WebSearchTool.Name,
      'GoogleSearch',
      'Performs a web search using Google Search (via the Gemini API) and returns the results. This tool is useful for finding information on the internet based on a query.',
      Icon.Globe,
      {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: 'The search query to find information on the web.',
          },
        },
        required: ['query'],
      },
    );
  }

  /**
   * Validates the parameters for the WebSearchTool.
   * @param params The parameters to validate
   * @returns An error message string if validation fails, null if valid
   */
  validateParams(params: WebSearchToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    if (!params.query || params.query.trim() === '') {
      return "The 'query' parameter cannot be empty.";
    }
    return null;
  }

  getDescription(params: WebSearchToolParams): string {
    console.warn(`WebSearchTool: getDescription called with params:`, JSON.stringify(params, null, 2));
    console.warn(`WebSearchTool: getDescription query: "${params.query}"`);
    return `Searching the web for: "${params.query}"`;
  }

  async execute(
    params: WebSearchToolParams,
    signal: AbortSignal,
  ): Promise<WebSearchToolResult> {
    // Debug logging to see what parameters we're receiving
    console.warn(`WebSearchTool: Received params:`, JSON.stringify(params, null, 2));
    console.warn(`WebSearchTool: Query value: "${params.query}"`);
    console.warn(`WebSearchTool: Query type: ${typeof params.query}`);
    
    const validationError = this.validateToolParams(params);
    if (validationError) {
      console.warn(`WebSearchTool: Validation error: ${validationError}`);
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: validationError,
      };
    }
    // Use provider-aware client instead of hardcoded Gemini
    const client = this.config.getProviderAwareClient();
    const authType = this.config.getContentGeneratorConfig()?.authType;
    
    // Web search is only supported natively by Gemini
    if (authType === AuthType.USE_OPENAI) {
      console.warn('WebSearchTool: OpenAI provider does not support native web search, falling back to Gemini');
      // For OpenAI, always fallback to Gemini for web search
      const geminiClient = this.config.getGeminiClient();
      const response = await geminiClient.generateContent(
        [{ role: 'user', parts: [{ text: params.query }] }],
        { tools: [{ googleSearch: {} }] },
        signal,
      );
      return this.processWebSearchResponse(response, params);
    }

    try {
      // For Gemini providers, use the universal client
      const response = await client.generateContent(
        [{ role: 'user', parts: [{ text: params.query }] }],
        { tools: [{ googleSearch: {} }] },
        signal,
      );

      return this.processWebSearchResponse(response, params);
    } catch (error: unknown) {
      const errorMessage = `Error during web search for query "${params.query}": ${getErrorMessage(error)}`;
      console.error(errorMessage, error);
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error performing web search.`,
      };
    }
  }

  private processWebSearchResponse(
    response: any,
    params: WebSearchToolParams
  ): WebSearchToolResult {
    const responseText = getResponseText(response);
    console.warn(`WebSearchTool: Processing response for query "${params.query}"`);
    console.warn(`WebSearchTool: ResponseText length: ${responseText?.length || 0}`);
    console.warn(`WebSearchTool: ResponseText preview: "${responseText?.substring(0, 200)}..."`);
    
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    const sources = groundingMetadata?.groundingChunks as
      | GroundingChunkItem[]
      | undefined;
    const groundingSupports = groundingMetadata?.groundingSupports as
      | GroundingSupportItem[]
      | undefined;

    if (!responseText || !responseText.trim()) {
      return {
        llmContent: `No search results or information found for query: "${params.query}"`,
        returnDisplay: 'No information found.',
      };
    }

    let modifiedResponseText = responseText;
    const sourceListFormatted: string[] = [];

    if (sources && sources.length > 0) {
      sources.forEach((source: GroundingChunkItem, index: number) => {
        const title = source.web?.title || 'Untitled';
        const uri = source.web?.uri || 'No URI';
        sourceListFormatted.push(`[${index + 1}] ${title} (${uri})`);
      });

      if (groundingSupports && groundingSupports.length > 0) {
        const insertions: Array<{ index: number; marker: string }> = [];
        groundingSupports.forEach((support: GroundingSupportItem) => {
          if (support.segment && support.groundingChunkIndices) {
            const citationMarker = support.groundingChunkIndices
              .map((chunkIndex: number) => `[${chunkIndex + 1}]`)
              .join('');
            insertions.push({
              index: support.segment.endIndex,
              marker: citationMarker,
            });
          }
        });

        // Sort insertions by index in descending order to avoid shifting subsequent indices
        insertions.sort((a, b) => b.index - a.index);

        const responseChars = modifiedResponseText.split('');
        insertions.forEach((insertion) => {
          responseChars.splice(insertion.index, 0, insertion.marker);
        });
        modifiedResponseText = responseChars.join('');
      }

      if (sourceListFormatted.length > 0) {
        modifiedResponseText +=
          '\n\nSources:\n' + sourceListFormatted.join('\n');
      }
    }

    const result = {
      llmContent: `Web search results for "${params.query}":\n\n${modifiedResponseText}`,
      returnDisplay: modifiedResponseText || `Search results for "${params.query}" returned.`, // Show actual results
      sources,
    };
    
    console.warn(`WebSearchTool: Final result llmContent length: ${result.llmContent.length}`);
    console.warn(`WebSearchTool: Final result llmContent preview: "${result.llmContent.substring(0, 300)}..."`);
    
    return result;
  }
}
