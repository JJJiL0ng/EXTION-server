// Jest 설정 파일 - 전역 모킹 설정

// Prisma 서비스 모킹
jest.mock('src/prisma/prisma.service', () => ({
  PrismaService: jest.fn().mockImplementation(() => ({
    chat: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    message: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    spreadsheet: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $transaction: jest.fn(),
  })),
}));

// 기타 필요한 서비스들 모킹
jest.mock('src/prompts/prompt/prompt.service', () => ({
  PromptService: jest.fn().mockImplementation(() => ({
    getPrompt: jest.fn(),
    loadPrompt: jest.fn(),
  })),
}));

jest.mock('src/chat-modules/gemini-api/gemini-api.service', () => ({
  GeminiApiService: jest.fn().mockImplementation(() => ({
    generateContent: jest.fn(),
  })),
})); 