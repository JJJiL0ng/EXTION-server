import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

export type LlmModelAlias =
  | 'gemini-small'
  | 'gemini-normal'
  | 'gemini-large'
  | 'extion-small'
  | 'extion-medium'
  | 'extion-large'
  | 'task-manager';

export interface LlmModelConfig {
  model: string;
  temperature: number;
  maxOutputTokens: number;
  streaming: boolean;
  maxRetries?: number;
}

export type LlmModelOverrides = Partial<LlmModelConfig>;

const MODEL_CONFIGS: Record<LlmModelAlias, LlmModelConfig> = {
  'gemini-small': {
    model: 'gemini-2.5-flash-lite',
    temperature: 0.3,
    maxOutputTokens: 8000,
    streaming: false,
  },
  'gemini-normal': {
    model: 'gemini-2.5-flash',
    temperature: 0.3,
    maxOutputTokens: 6000,
    streaming: false,
  },
  'gemini-large': {
    model: 'gemini-2.5-pro',
    temperature: 0.3,
    maxOutputTokens: 8000,
    streaming: false,
  },
  'extion-large': {
    model: 'gemini-2.5-flash',
    temperature: 0.3,
    maxOutputTokens: 8000,
    streaming: false,
  },
  'extion-medium': {
    model: 'gemini-2.5-flash-lite',
    temperature: 0.3,
    maxOutputTokens: 8000,
    streaming: false,
  },
  'extion-small': {
    model: 'gemini-2.0-flash-lite',
    temperature: 0.3,
    maxOutputTokens: 8000,
    streaming: false,
  },
  'task-manager': {
    model: 'gemini-2.5-flash-lite',
    temperature: 0.1,
    maxOutputTokens: 8000,
    streaming: false,
  },
};

export function resolveLlmModelConfig(
  alias: LlmModelAlias,
  overrides: LlmModelOverrides = {},
): LlmModelConfig {
  return {
    ...MODEL_CONFIGS[alias],
    ...overrides,
  };
}

@Injectable()
export class LlmModelFactoryService {
  constructor(private readonly configService: ConfigService) {}

  create(alias: LlmModelAlias, overrides: LlmModelOverrides = {}): ChatGoogleGenerativeAI {
    const config = resolveLlmModelConfig(alias, overrides);

    return new ChatGoogleGenerativeAI({
      apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
      ...config,
    });
  }
}
