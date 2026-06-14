import { PrismaService } from '../src/v2/prisma/prisma.service';

const createDelegateMock = () => ({
  create: jest.fn(),
  findFirst: jest.fn(),
  findUnique: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  count: jest.fn(),
});

export type PrismaServiceMock = jest.Mocked<PrismaService> & {
  user: ReturnType<typeof createDelegateMock>;
  spreadSheet: ReturnType<typeof createDelegateMock>;
  spreadSheetVersionData: ReturnType<typeof createDelegateMock>;
  chat: ReturnType<typeof createDelegateMock>;
  chatSession: ReturnType<typeof createDelegateMock>;
  chatSessionBranch: ReturnType<typeof createDelegateMock>;
  message: ReturnType<typeof createDelegateMock>;
  inviteCode: ReturnType<typeof createDelegateMock>;
};

export const createPrismaServiceMock = (): PrismaServiceMock =>
  ({
    user: createDelegateMock(),
    spreadSheet: createDelegateMock(),
    spreadSheetVersionData: createDelegateMock(),
    chat: createDelegateMock(),
    chatSession: createDelegateMock(),
    chatSessionBranch: createDelegateMock(),
    message: createDelegateMock(),
    inviteCode: createDelegateMock(),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $transaction: jest.fn(),
  }) as unknown as PrismaServiceMock;

export const mockPrismaTransaction = (
  prisma: PrismaServiceMock,
  tx: PrismaServiceMock = prisma,
) => {
  (prisma.$transaction as jest.Mock).mockImplementation(async (callbackOrQueries) => {
    if (typeof callbackOrQueries === 'function') {
      return callbackOrQueries(tx);
    }

    return Promise.all(callbackOrQueries);
  });
};
