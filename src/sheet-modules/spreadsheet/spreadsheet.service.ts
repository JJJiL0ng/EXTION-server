import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateSpreadsheetDto, AutoSaveSpreadsheetDto } from './dto/spreadsheet.dto';

// 메모리 기반 자동저장 큐 인터페이스
interface AutoSaveQueueItem {
  userId: string;
  spreadsheetId: string;
  sheets: any[];
  activeSheetIndex?: number;
  timestamp: number;
  retryCount: number;
}

@Injectable()
export class SpreadsheetService {
  // 메모리 기반 큐 시스템
  private autoSaveQueue = new Map<string, AutoSaveQueueItem>();
  private saveTimers = new Map<string, NodeJS.Timeout>();
  private readonly AUTO_SAVE_DELAY = 3000; // 3초 지연
  private readonly MAX_RETRY_COUNT = 3;

  constructor(private readonly prisma: PrismaService) {}

  async saveSpreadsheet(dto: CreateSpreadsheetDto) {
    const {
      userId,
      chatId,
      fileName,
      originalFileName,
      fileSize,
      fileType,
      activeSheetIndex,
      sheets,
    } = dto;

    // 사용자 존재 여부 확인
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`사용자 ID ${userId}를 찾을 수 없습니다.`);
    }

    // chatId가 제공된 경우 채팅 존재 여부 확인
    let existingChatId = chatId;
    if (chatId) {
      const chat = await this.prisma.chat.findFirst({
        where: { 
          id: chatId, 
          userId: userId 
        },
      });

      if (!chat) {
        throw new Error(`채팅 ID ${chatId}를 찾을 수 없거나 사용자 권한이 없습니다.`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. 시트 메타데이터 생성
      const sheetMetaData = await tx.sheetMetaData.create({
        data: {
          user: {
            connect: { id: userId },
          },
          fileName,
          originalFileName,
          fileSize,
          fileType,
          activeSheetIndex: activeSheetIndex ?? 0,
        },
      });

      // 2. 시트 테이블 데이터 준비
      if (sheets && sheets.length > 0) {
        const sheetTableData = sheets.map((sheet) => ({
          name: sheet.name,
          index: sheet.index,
          data: sheet.data,
          sheetMetaDataId: sheetMetaData.id,
        }));

        // 3. 시트 테이블 데이터 생성
        await tx.sheetTableData.createMany({
          data: sheetTableData,
        });
      }

      // 4. chatId가 없는 경우 새로운 채팅 생성
      if (!existingChatId) {
        const today = new Date().toLocaleDateString('ko-KR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).replace(/\./g, '').replace(/\s/g, '');
        
        const chatTitle = `${fileName} ${today}`;
        
        const newChat = await tx.chat.create({
          data: {
            title: chatTitle,
            user: {
              connect: { id: userId },
            },
            sheetMetaData: {
              connect: { id: sheetMetaData.id },
            },
          },
        });
        
        existingChatId = newChat.id;
      } else {
        // 5. chatId가 제공된 경우, 채팅과 시트 메타데이터 연결
        await tx.chat.update({
          where: { id: existingChatId, userId: userId },
          data: {
            sheetMetaData: {
              connect: { id: sheetMetaData.id },
            },
          },
        });
      }

      return {
        ...sheetMetaData,
        chatId: existingChatId,
        sheets: sheets.map((s) => ({
          name: s.name,
          index: s.index,
          rowCount: s.data.length,
        })),
      };
    });
  }

  // 경량화된 자동저장 메서드 - 메모리 큐에 추가
  async queueAutoSave(dto: AutoSaveSpreadsheetDto) {
    const queueKey = `${dto.userId}_${dto.spreadsheetId}`;
    
    // 기존 타이머 취소
    if (this.saveTimers.has(queueKey)) {
      clearTimeout(this.saveTimers.get(queueKey)!);
    }

    // 큐에 최신 데이터로 업데이트 (즉시 병합)
    const existingItem = this.autoSaveQueue.get(queueKey);
    const queueItem: AutoSaveQueueItem = {
      userId: dto.userId,
      spreadsheetId: dto.spreadsheetId,
      sheets: dto.sheets,
      activeSheetIndex: dto.activeSheetIndex,
      timestamp: Date.now(),
      retryCount: existingItem?.retryCount ?? 0,
    };

    this.autoSaveQueue.set(queueKey, queueItem);

    // 새로운 타이머 설정
    const timer = setTimeout(() => {
      this.processAutoSave(queueKey);
    }, this.AUTO_SAVE_DELAY);

    this.saveTimers.set(queueKey, timer);

    return {
      success: true,
      message: '자동저장이 예약되었습니다.',
      queuedAt: new Date(queueItem.timestamp).toISOString(),
    };
  }

  // 실제 자동저장 처리 (DB 접근)
  private async processAutoSave(queueKey: string) {
    const queueItem = this.autoSaveQueue.get(queueKey);
    if (!queueItem) return;

    try {
      // 스프레드시트 존재 여부 확인
      const existingSheet = await this.prisma.sheetMetaData.findFirst({
        where: {
          id: queueItem.spreadsheetId,
          userId: queueItem.userId,
        },
      });

      if (!existingSheet) {
        throw new Error('스프레드시트를 찾을 수 없습니다.');
      }

      // 트랜잭션으로 안전하게 업데이트
      await this.prisma.$transaction(async (tx) => {
        // 1. 기존 시트 데이터 삭제
        await tx.sheetTableData.deleteMany({
          where: { sheetMetaDataId: queueItem.spreadsheetId },
        });

        // 2. 새로운 시트 데이터 생성
        const sheetTableData = queueItem.sheets.map((sheet) => ({
          name: sheet.name,
          index: sheet.index,
          data: sheet.data,
          sheetMetaDataId: queueItem.spreadsheetId,
        }));

        await tx.sheetTableData.createMany({
          data: sheetTableData,
        });

        // 3. 메타데이터 업데이트
        await tx.sheetMetaData.update({
          where: { id: queueItem.spreadsheetId },
          data: {
            activeSheetIndex: queueItem.activeSheetIndex ?? 0,
            updatedAt: new Date(),
          },
        });
      });

      // 성공 시 큐에서 제거
      this.autoSaveQueue.delete(queueKey);
      this.saveTimers.delete(queueKey);

    } catch (error) {
      console.error(`자동저장 실패 (${queueKey}):`, error);
      
      // 재시도 로직
      if (queueItem.retryCount < this.MAX_RETRY_COUNT) {
        queueItem.retryCount++;
        
        // 지수 백오프로 재시도
        const retryDelay = this.AUTO_SAVE_DELAY * Math.pow(2, queueItem.retryCount);
        const retryTimer = setTimeout(() => {
          this.processAutoSave(queueKey);
        }, retryDelay);
        
        this.saveTimers.set(queueKey, retryTimer);
      } else {
        // 최대 재시도 횟수 초과 시 큐에서 제거
        this.autoSaveQueue.delete(queueKey);
        this.saveTimers.delete(queueKey);
        console.error(`자동저장 최대 재시도 횟수 초과: ${queueKey}`);
      }
    }
  }

  // 자동저장 상태 확인
  async getAutoSaveStatus(userId: string, spreadsheetId: string) {
    const queueKey = `${userId}_${spreadsheetId}`;
    const queueItem = this.autoSaveQueue.get(queueKey);
    
    return {
      isQueued: !!queueItem,
      queuedAt: queueItem ? new Date(queueItem.timestamp).toISOString() : null,
      retryCount: queueItem?.retryCount ?? 0,
      estimatedSaveTime: queueItem 
        ? new Date(queueItem.timestamp + this.AUTO_SAVE_DELAY).toISOString() 
        : null,
    };
  }

  // 강제 자동저장 실행
  async forceAutoSave(userId: string, spreadsheetId: string) {
    const queueKey = `${userId}_${spreadsheetId}`;
    
    if (this.saveTimers.has(queueKey)) {
      clearTimeout(this.saveTimers.get(queueKey)!);
      this.saveTimers.delete(queueKey);
    }

    if (this.autoSaveQueue.has(queueKey)) {
      await this.processAutoSave(queueKey);
      return { success: true, message: '강제 자동저장이 완료되었습니다.' };
    }

    return { success: false, message: '저장할 데이터가 큐에 없습니다.' };
  }

  // 메모리 정리 (선택적 - 필요 시 호출)
  clearAutoSaveQueue() {
    // 모든 타이머 정리
    this.saveTimers.forEach((timer) => clearTimeout(timer));
    this.saveTimers.clear();
    this.autoSaveQueue.clear();
  }

  async getSpreadsheet(sheetId: string) {
    const sheetMetaData = await this.prisma.sheetMetaData.findUnique({
      where: { id: sheetId },
    });

    if (!sheetMetaData) {
      return null;
    }

    const sheets = await this.prisma.sheetTableData.findMany({
      where: { sheetMetaDataId: sheetId },
      orderBy: {
        index: 'asc',
      },
    });

    return {
      ...sheetMetaData,
      sheets,
    };
  }
}
