import { resolveLlmModelConfig } from './llm-model-factory.service';

describe('resolveLlmModelConfig', () => {
  it('resolves Extion aliases to the existing Gemini model names', () => {
    expect(resolveLlmModelConfig('extion-small')).toMatchObject({
      model: 'gemini-2.0-flash-lite',
      temperature: 0.3,
      maxOutputTokens: 8000,
      streaming: false,
    });
    expect(resolveLlmModelConfig('extion-large')).toMatchObject({
      model: 'gemini-2.5-flash',
    });
  });

  it('keeps the task manager tuned temperature', () => {
    expect(resolveLlmModelConfig('task-manager')).toMatchObject({
      model: 'gemini-2.5-flash-lite',
      temperature: 0.1,
      maxOutputTokens: 8000,
    });
  });

  it('allows use-case specific overrides without mutating defaults', () => {
    expect(
      resolveLlmModelConfig('gemini-small', {
        temperature: 0,
        maxOutputTokens: 16384,
        maxRetries: 2,
      }),
    ).toMatchObject({
      model: 'gemini-2.5-flash-lite',
      temperature: 0,
      maxOutputTokens: 16384,
      maxRetries: 2,
    });
    expect(resolveLlmModelConfig('gemini-small')).toMatchObject({
      temperature: 0.3,
      maxOutputTokens: 8000,
    });
  });
});
