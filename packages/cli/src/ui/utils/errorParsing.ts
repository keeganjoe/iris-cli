/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AuthType,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_AZURE_MODEL,
  isApiError,
  isStructuredError,
} from 'iris-cli-core';

const getRateLimitErrorMessageOpenAI = (
  currentModel: string = DEFAULT_OPENAI_MODEL,
) =>
  `\nYou have reached your rate limit for ${currentModel}. Please wait and try again later, or check your OpenAI API usage limits.`;

const getRateLimitErrorMessageAzure = (
  currentModel: string = DEFAULT_AZURE_MODEL,
) =>
  `\nYou have reached your rate limit for ${currentModel} in Azure OpenAI. Please wait and try again later, or check your Azure OpenAI quota and usage limits in the Azure portal.`;

const getRateLimitErrorMessageDefault = () =>
  '\nRate limit exceeded. Please wait and try again later.';

function getRateLimitMessage(
  authType?: AuthType,
  currentModel?: string,
): string {
  switch (authType) {
    case AuthType.USE_OPENAI:
      return getRateLimitErrorMessageOpenAI(currentModel);
    case AuthType.USE_AZURE:
    case AuthType.LOGIN_WITH_AZURE:
      return getRateLimitErrorMessageAzure(currentModel);
    default:
      return getRateLimitErrorMessageDefault();
  }
}

export function parseAndFormatApiError(
  error: unknown,
  authType?: AuthType,
  currentModel?: string,
): string {
  if (isStructuredError(error)) {
    let text = `[API Error: ${error.message}]`;
    if (error.status === 429) {
      text += getRateLimitMessage(
        authType,
        currentModel,
      );
    }
    return text;
  }

  // The error message might be a string containing a JSON object.
  if (typeof error === 'string') {
    const jsonStart = error.indexOf('{');
    if (jsonStart === -1) {
      return `[API Error: ${error}]`; // Not a JSON error, return as is.
    }

    const jsonString = error.substring(jsonStart);

    try {
      const parsedError = JSON.parse(jsonString) as unknown;
      if (isApiError(parsedError)) {
        let finalMessage = parsedError.error.message;
        try {
          // See if the message is a stringified JSON with another error
          const nestedError = JSON.parse(finalMessage) as unknown;
          if (isApiError(nestedError)) {
            finalMessage = nestedError.error.message;
          }
        } catch (_e) {
          // It's not a nested JSON error, so we just use the message as is.
        }
        let text = `[API Error: ${finalMessage} (Status: ${parsedError.error.status})]`;
        if (parsedError.error.code === 429) {
          text += getRateLimitMessage(
            authType,
            currentModel,
          );
        }
        return text;
      }
    } catch (_e) {
      // Not a valid JSON, fall through and return the original message.
    }
    return `[API Error: ${error}]`;
  }

  return '[API Error: An unknown error occurred.]';
}
