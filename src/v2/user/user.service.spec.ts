import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  createPrismaServiceMock,
  PrismaServiceMock,
} from '../../../test/prisma-service.mock';

describe('UserService', () => {
  let service: UserService;
  let prisma: PrismaServiceMock;

  beforeEach(async () => {
    prisma = createPrismaServiceMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates a user with an explicit display name', async () => {
    prisma.user.create.mockResolvedValue({
      id: 'user-1',
      displayName: 'Jihong',
      isGuest: false,
    });

    await expect(service.createUser('user-1', 'Jihong')).resolves.toEqual({
      id: 'user-1',
      displayName: 'Jihong',
      isGuest: false,
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        id: 'user-1',
        displayName: 'Jihong',
        isGuest: false,
      },
    });
  });

  it('returns an existing user when create hits a unique constraint', async () => {
    prisma.user.create.mockRejectedValue({ code: 'P2002' });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      displayName: 'Existing User',
      isGuest: false,
    });

    await expect(service.createUser('user-1')).resolves.toEqual({
      id: 'user-1',
      displayName: 'Existing User',
      isGuest: false,
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, displayName: true, isGuest: true },
    });
  });

  it('auto-creates missing guest users during validation', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    prisma.user.create.mockResolvedValue({ id: 'guest_1' });

    await expect(service.validateUser('guest_1')).resolves.toBeUndefined();
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        id: 'guest_1',
        displayName: expect.stringMatching(/^Guest User /),
        isGuest: true,
      },
      select: { id: true },
    });
  });

  it('rejects missing non-guest users during validation', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.validateUser('user-missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
