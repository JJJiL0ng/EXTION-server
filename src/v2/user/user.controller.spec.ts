import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';

describe('UserController', () => {
  let controller: UserController;
  const userService = {
    createUser: jest.fn(),
  };

  beforeEach(async () => {
    userService.createUser.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: userService,
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('creates a user through UserService', async () => {
    userService.createUser.mockResolvedValue({
      id: 'user-1',
      displayName: 'Jihong',
      isGuest: false,
    });

    await expect(
      controller.createUser({ userId: 'user-1', displayName: 'Jihong' }),
    ).resolves.toEqual({
      success: true,
      data: {
        id: 'user-1',
        displayName: 'Jihong',
        isGuest: false,
      },
      message: 'User created successfully',
    });
    expect(userService.createUser).toHaveBeenCalledWith(
      'user-1',
      'Jihong',
      false,
    );
  });
});
