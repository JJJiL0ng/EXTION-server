// orchestrator-chat.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { OrchestratorChatController } from './orchestrator-chat.controller';
import { OrchestratorChatService } from './orchestrator-chat.service';
import {
  OrchestratorChatRequestDto,
  OrchestratorChatResponseDto,
  GeneralChatResponseDto,
} from '../dto';

// 필요한 의존성들을 모킹
jest.mock('../general-chat/general-chat.service');
jest.mock('../function-chat/function-chat.service');
jest.mock('../data-edit-chat/data-edit-chat.service');
jest.mock('../data-generate-chat/data-generate-chat.service');
jest.mock('../visualization-generate-chat/visualization-generate-chat.service');
jest.mock('../analyze-user-intent/analyze-user-intent.service');
jest.mock('../../prompts/prompt/prompt.service');
jest.mock('../../prisma/prisma.service');

describe('OrchestratorChatController', () => {
  let controller: OrchestratorChatController;
  let service: OrchestratorChatService;

  // ──────────────── 공통 Mock 데이터 ────────────────
  const mockRequest: OrchestratorChatRequestDto = {
    sheetId: 'sheet-1',
    userId: 'u123',
    message: 'SUM 함수 어떻게 써?',
    countryCode: 'KR',
    timestamp: '2025-07-11T02:00:00.000Z',
  };

  const mockSuccessResponse: GeneralChatResponseDto = {
    success: true,
    chatType: 'general-chat',
    sheetId: 'sheet-1',
    data: {
      message: '셀 범위를 선택하고 SUM 함수를 사용하세요.',
    },
    timestamp: '2025-07-11T02:00:00.000Z',
  };

  const mockErrorResponse = {
    success: false,
    chatType: null,
    sheetId: 'sheet-1',
    error: 'LLM 호출 실패',
    timestamp: expect.any(String),
  };

  // ──────────────── 테스트 모듈 세팅 ────────────────
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrchestratorChatController],
      providers: [
        {
          provide: OrchestratorChatService,
          useValue: {
            // 각 케이스마다 jest.spyOn으로 오버라이드
            processMessage: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<OrchestratorChatController>(
      OrchestratorChatController,
    );
    service = module.get<OrchestratorChatService>(
      OrchestratorChatService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ──────────────── ① 성공 시나리오 ────────────────
  it('POST /send  → 성공 응답을 반환한다', async () => {
    // 서비스 레이어 Mock 동작 정의
    jest
      .spyOn(service, 'processMessage')
      .mockResolvedValue(mockSuccessResponse);

    const res = await controller.sendMessage(mockRequest);

    expect(service.processMessage).toHaveBeenCalledWith(mockRequest);
    expect(service.processMessage).toHaveBeenCalledTimes(1);
    expect(res).toEqual(mockSuccessResponse);
    expect(res.success).toBe(true);
    expect(res.chatType).toBe('general-chat');
  });

  // ──────────────── ② 실패 시나리오 ────────────────
  it('POST /send  → 서비스 에러 발생 시 표준화된 에러 응답을 반환한다', async () => {
    jest
      .spyOn(service, 'processMessage')
      .mockRejectedValue(new Error('LLM 호출 실패'));

    const res = await controller.sendMessage(mockRequest);

    expect(service.processMessage).toHaveBeenCalledWith(mockRequest);
    expect(service.processMessage).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject(mockErrorResponse);
    expect(res.success).toBe(false);
    expect(res.error).toBe('LLM 호출 실패');
  });

  // ──────────────── ③ 다양한 요청 시나리오 ────────────────
  it('POST /send  → 다양한 chatType의 요청을 처리할 수 있다', async () => {
    const functionChatRequest: OrchestratorChatRequestDto = {
      ...mockRequest,
      message: 'VLOOKUP 함수 사용법 알려줘',
    };

    const mockFunctionResponse = {
      success: true,
      chatType: 'function-chat' as const,
      sheetId: 'sheet-1',
      data: {
        explanation: 'VLOOKUP 함수는...',
        functionDetails: {
          name: 'VLOOKUP',
          syntax: 'VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])',
          description: '수직 검색 함수입니다',
        },
      },
      timestamp: '2025-07-11T02:00:00.000Z',
    };

    jest
      .spyOn(service, 'processMessage')
      .mockResolvedValue(mockFunctionResponse);

    const res = await controller.sendMessage(functionChatRequest);

    expect(service.processMessage).toHaveBeenCalledWith(functionChatRequest);
    expect(res).toEqual(mockFunctionResponse);
    expect(res.chatType).toBe('function-chat');
  });

  // ──────────────── ④ 에러 메시지 없는 경우 ────────────────
  it('POST /send  → 에러 객체에 메시지가 없는 경우 기본 에러 메시지를 반환한다', async () => {
    jest
      .spyOn(service, 'processMessage')
      .mockRejectedValue(new Error());

    const res = await controller.sendMessage(mockRequest);

    expect(res).toMatchObject({
      success: false,
      chatType: null,
      sheetId: mockRequest.sheetId,
      error: '메시지 처리 중 오류가 발생했습니다.',
      timestamp: expect.any(String),
    });
  });

  // ──────────────── ⑤ sheetId가 없는 요청 ────────────────
  it('POST /send  → sheetId가 없는 요청도 처리할 수 있다', async () => {
    const requestWithoutSheetId: OrchestratorChatRequestDto = {
      userId: 'u123',
      message: '일반적인 질문입니다',
      countryCode: 'KR',
      timestamp: '2025-07-11T02:00:00.000Z',
    };

    const responseWithoutSheetId: GeneralChatResponseDto = {
      success: true,
      chatType: 'general-chat',
      data: {
        message: '답변 내용입니다.',
      },
      timestamp: '2025-07-11T02:00:00.000Z',
    };

    jest
      .spyOn(service, 'processMessage')
      .mockResolvedValue(responseWithoutSheetId);

    const res = await controller.sendMessage(requestWithoutSheetId);

    expect(service.processMessage).toHaveBeenCalledWith(requestWithoutSheetId);
    expect(res).toEqual(responseWithoutSheetId);
    expect(res.success).toBe(true);
  });

  // ──────────────── ⑥ 컨트롤러 인스턴스 확인 ────────────────
  it('컨트롤러가 정상적으로 정의되어야 한다', () => {
    expect(controller).toBeDefined();
    expect(service).toBeDefined();
  });
});
