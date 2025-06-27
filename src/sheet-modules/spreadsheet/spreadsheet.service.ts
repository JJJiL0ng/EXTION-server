import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateSpreadsheetDto, AutoSaveSpreadsheetDto } from './dto/spreadsheet.dto';

// 델타 기반 자동저장 큐 인터페이스
interface CellChange {
  sheetIndex: number;
  row: number;
  col: number;
  value: any;
  oldValue?: any;
}

interface SheetMetaChange {
  sheetIndex: number;
  name?: string;
  activeSheetIndex?: number;
}

interface AutoSaveQueueItem {
  userId: string;
  spreadsheetId: string;
  changes: {
    cellChanges?: CellChange[];
    metaChanges?: SheetMetaChange[];
    newSheets?: any[];
    deletedSheets?: number[];
  };
  timestamp: number;
  retryCount: number;
}

@Injectable()
export class SpreadsheetService {
  // 델타 기반 큐 시스템
  private autoSaveQueue = new Map<string, AutoSaveQueueItem>();
  private saveTimers = new Map<string, NodeJS.Timeout>();
  private readonly AUTO_SAVE_DELAY = 1500; // 1.5초로 단축
  private readonly MAX_RETRY_COUNT = 3;
  private readonly MAX_CELL_CHANGES_PER_BATCH = 100; // 배치당 최대 셀 변경 수

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Guest User ID 생성
   */
  private generateGuestUserId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `guest_${timestamp}_${random}`;
  }

  async saveSpreadsheet(dto: CreateSpreadsheetDto) {
    // userId가 없으면 게스트 ID 생성
    if (!dto.userId) {
      dto.userId = this.generateGuestUserId();
      console.log(`게스트 사용자 ID 생성: ${dto.userId}`);
    }

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

    // 사용자 존재 여부 확인 및 게스트 사용자 생성
    let user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      // 게스트 사용자인 경우 자동 생성
      if (userId!.startsWith('guest_')) {
        try {
          user = await this.prisma.user.create({
            data: {
              id: userId!,
              email: `${userId}@guest.temp`,
              displayName: userId!,
              isGuest: true,
            },
          });
          console.log(`게스트 사용자 생성 완료: ${userId}`);
        } catch (userCreateError) {
          console.error(`게스트 사용자 생성 실패: ${userId}`, {
            error: userCreateError.message,
            code: userCreateError.code,
            meta: userCreateError.meta,
          });
          throw new Error(`게스트 사용자 생성 실패: ${userCreateError.message}`);
        }
      } else {
        throw new Error(`사용자 ID ${userId}를 찾을 수 없습니다.`);
      }
    } else {
      console.log(`기존 사용자 확인: ${userId}, isGuest: ${user.isGuest}`);
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

  // 🚀 개선된 델타 기반 자동저장 - 셀 변경사항만 추적
  async queueDeltaAutoSave(dto: {
    userId: string;
    spreadsheetId: string;
    cellChanges?: CellChange[];
    metaChanges?: SheetMetaChange[];
    newSheets?: any[];
    deletedSheets?: number[];
  }) {
    const queueKey = `${dto.userId}_${dto.spreadsheetId}`;
    
    // 기존 타이머 취소
    if (this.saveTimers.has(queueKey)) {
      clearTimeout(this.saveTimers.get(queueKey)!);
    }

    // 기존 큐 아이템과 변경사항 병합
    const existingItem = this.autoSaveQueue.get(queueKey);
    const mergedChanges = this.mergeChanges(
      existingItem?.changes,
      {
        cellChanges: dto.cellChanges,
        metaChanges: dto.metaChanges,
        newSheets: dto.newSheets,
        deletedSheets: dto.deletedSheets,
      }
    );

    const queueItem: AutoSaveQueueItem = {
      userId: dto.userId,
      spreadsheetId: dto.spreadsheetId,
      changes: mergedChanges,
      timestamp: Date.now(),
      retryCount: existingItem?.retryCount ?? 0,
    };

    this.autoSaveQueue.set(queueKey, queueItem);

    // 변경사항이 많으면 즉시 처리, 적으면 지연 처리
    const totalChanges = (mergedChanges.cellChanges?.length ?? 0) + 
                        (mergedChanges.metaChanges?.length ?? 0);
    
    const delay = totalChanges > this.MAX_CELL_CHANGES_PER_BATCH 
      ? 500 // 큰 변경사항은 빠르게 처리
      : this.AUTO_SAVE_DELAY;

    const timer = setTimeout(() => {
      this.processDeltaAutoSave(queueKey);
    }, delay);

    this.saveTimers.set(queueKey, timer);

    return {
      success: true,
      message: `델타 자동저장이 예약되었습니다. (변경사항: ${totalChanges}개)`,
      queuedAt: new Date(queueItem.timestamp).toISOString(),
      estimatedSize: this.estimateChangeSize(mergedChanges),
    };
  }

  // 변경사항 병합 로직
  private mergeChanges(
    existing?: AutoSaveQueueItem['changes'],
    newChanges?: Partial<AutoSaveQueueItem['changes']>
  ): AutoSaveQueueItem['changes'] {
    if (!existing) return newChanges || {};

    const merged = { ...existing };

    // 셀 변경사항 병합 (같은 위치의 셀은 최신 값으로 덮어쓰기)
    if (newChanges?.cellChanges) {
      const cellMap = new Map<string, CellChange>();
      
      // 기존 변경사항을 맵에 추가
      existing.cellChanges?.forEach(change => {
        const key = `${change.sheetIndex}_${change.row}_${change.col}`;
        cellMap.set(key, change);
      });

      // 새 변경사항으로 덮어쓰기
      newChanges.cellChanges.forEach(change => {
        const key = `${change.sheetIndex}_${change.row}_${change.col}`;
        cellMap.set(key, change);
      });

      merged.cellChanges = Array.from(cellMap.values());
    }

    // 메타 변경사항 병합
    if (newChanges?.metaChanges) {
      const metaMap = new Map<number, SheetMetaChange>();
      
      existing.metaChanges?.forEach(change => {
        metaMap.set(change.sheetIndex, change);
      });

      newChanges.metaChanges.forEach(change => {
        const existing = metaMap.get(change.sheetIndex) || { sheetIndex: change.sheetIndex };
        metaMap.set(change.sheetIndex, { ...existing, ...change });
      });

      merged.metaChanges = Array.from(metaMap.values());
    }

    // 새 시트와 삭제된 시트 병합
    if (newChanges?.newSheets) {
      merged.newSheets = [...(merged.newSheets || []), ...newChanges.newSheets];
    }

    if (newChanges?.deletedSheets) {
      merged.deletedSheets = [...new Set([...(merged.deletedSheets || []), ...newChanges.deletedSheets])];
    }

    return merged;
  }

  // 변경사항 크기 추정
  private estimateChangeSize(changes: AutoSaveQueueItem['changes']): string {
    const cellSize = (changes.cellChanges?.length ?? 0) * 50; // 셀당 약 50 bytes
    const metaSize = (changes.metaChanges?.length ?? 0) * 100; // 메타데이터당 약 100 bytes
    const totalBytes = cellSize + metaSize;
    
    if (totalBytes < 1024) return `${totalBytes}B`;
    if (totalBytes < 1024 * 1024) return `${Math.round(totalBytes / 1024)}KB`;
    return `${Math.round(totalBytes / (1024 * 1024))}MB`;
  }

  // 🚀 델타 기반 자동저장 처리 (DB 접근 최소화)
  private async processDeltaAutoSave(queueKey: string) {
    const queueItem = this.autoSaveQueue.get(queueKey);
    if (!queueItem) return;

    try {
      const { changes } = queueItem;
      
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

      // 델타 변경사항을 배치로 처리
      await this.prisma.$transaction(async (tx) => {
        // 1. 셀 변경사항 처리 (배치 단위로)
        if (changes.cellChanges && changes.cellChanges.length > 0) {
          await this.processCellChanges(tx, queueItem.spreadsheetId, changes.cellChanges);
        }

        // 2. 메타데이터 변경사항 처리
        if (changes.metaChanges && changes.metaChanges.length > 0) {
          await this.processMetaChanges(tx, queueItem.spreadsheetId, changes.metaChanges);
        }

        // 3. 새 시트 추가
        if (changes.newSheets && changes.newSheets.length > 0) {
          await this.processNewSheets(tx, queueItem.spreadsheetId, changes.newSheets);
        }

        // 4. 시트 삭제
        if (changes.deletedSheets && changes.deletedSheets.length > 0) {
          await this.processDeletedSheets(tx, queueItem.spreadsheetId, changes.deletedSheets);
        }

        // 5. 메타데이터 업데이트
        await tx.sheetMetaData.update({
          where: { id: queueItem.spreadsheetId },
          data: { updatedAt: new Date() },
        });
      });

      // 성공 시 큐에서 제거
      this.autoSaveQueue.delete(queueKey);
      this.saveTimers.delete(queueKey);

      console.log(`✅ 델타 자동저장 완료: ${queueKey} (변경사항: ${
        (changes.cellChanges?.length ?? 0) + (changes.metaChanges?.length ?? 0)
      }개)`);

    } catch (error) {
      console.error(`❌ 델타 자동저장 실패 (${queueKey}):`, error);
      
      // 재시도 로직
      if (queueItem.retryCount < this.MAX_RETRY_COUNT) {
        queueItem.retryCount++;
        
        const retryDelay = this.AUTO_SAVE_DELAY * Math.pow(2, queueItem.retryCount);
        const retryTimer = setTimeout(() => {
          this.processDeltaAutoSave(queueKey);
        }, retryDelay);
        
        this.saveTimers.set(queueKey, retryTimer);
      } else {
        this.autoSaveQueue.delete(queueKey);
        this.saveTimers.delete(queueKey);
        console.error(`🚫 델타 자동저장 최대 재시도 횟수 초과: ${queueKey}`);
      }
    }
  }

  // 셀 변경사항 처리 (효율적인 배치 업데이트)
  private async processCellChanges(tx: any, spreadsheetId: string, cellChanges: CellChange[]) {
    // 시트별로 그룹화
    const changesBySheet = new Map<number, CellChange[]>();
    cellChanges.forEach(change => {
      if (!changesBySheet.has(change.sheetIndex)) {
        changesBySheet.set(change.sheetIndex, []);
      }
      changesBySheet.get(change.sheetIndex)!.push(change);
    });

    // 각 시트별로 배치 처리
    for (const [sheetIndex, changes] of changesBySheet) {
      // 현재 시트 데이터 가져오기
      const sheetData = await tx.sheetTableData.findFirst({
        where: {
          sheetMetaDataId: spreadsheetId,
          index: sheetIndex,
        },
      });

      if (sheetData && sheetData.data) {
        const data = Array.isArray(sheetData.data) ? sheetData.data : JSON.parse(JSON.stringify(sheetData.data));
        
        // 변경사항 적용
        changes.forEach(change => {
          if (!data[change.row]) {
            data[change.row] = [];
          }
          data[change.row][change.col] = change.value;
        });

        // 업데이트
        await tx.sheetTableData.update({
          where: { id: sheetData.id },
          data: { data },
        });
      }
    }
  }

  // 메타데이터 변경사항 처리
  private async processMetaChanges(tx: any, spreadsheetId: string, metaChanges: SheetMetaChange[]) {
    for (const change of metaChanges) {
      if (change.name) {
        await tx.sheetTableData.updateMany({
          where: {
            sheetMetaDataId: spreadsheetId,
            index: change.sheetIndex,
          },
          data: { name: change.name },
        });
      }

      if (change.activeSheetIndex !== undefined) {
        await tx.sheetMetaData.update({
          where: { id: spreadsheetId },
          data: { activeSheetIndex: change.activeSheetIndex },
        });
      }
    }
  }

  // 새 시트 추가 처리
  private async processNewSheets(tx: any, spreadsheetId: string, newSheets: any[]) {
    const sheetTableData = newSheets.map((sheet) => ({
      name: sheet.name,
      index: sheet.index,
      data: sheet.data,
      sheetMetaDataId: spreadsheetId,
    }));

    await tx.sheetTableData.createMany({
      data: sheetTableData,
    });
  }

  // 시트 삭제 처리
  private async processDeletedSheets(tx: any, spreadsheetId: string, deletedSheets: number[]) {
    await tx.sheetTableData.deleteMany({
      where: {
        sheetMetaDataId: spreadsheetId,
        index: { in: deletedSheets },
      },
    });
  }

  // 기존 자동저장 메서드 (하위 호환성)
  async queueAutoSave(dto: AutoSaveSpreadsheetDto) {
    // userId가 없으면 게스트 ID 생성
    if (!dto.userId) {
      dto.userId = this.generateGuestUserId();
      console.log(`자동저장용 게스트 사용자 ID 생성: ${dto.userId}`);
    }

    // 레거시 호환을 위해 전체 시트 데이터를 델타로 변환
    const cellChanges: CellChange[] = [];
    
    dto.sheets.forEach((sheet, sheetIndex) => {
      if (sheet.data && Array.isArray(sheet.data)) {
        sheet.data.forEach((row: any[], rowIndex: number) => {
          row.forEach((cell: any, colIndex: number) => {
            cellChanges.push({
              sheetIndex,
              row: rowIndex,
              col: colIndex,
              value: cell,
            });
          });
        });
      }
    });

    return this.queueDeltaAutoSave({
      userId: dto.userId!,
      spreadsheetId: dto.spreadsheetId,
      cellChanges,
      metaChanges: dto.activeSheetIndex !== undefined ? [{
        sheetIndex: 0,
        activeSheetIndex: dto.activeSheetIndex,
      }] : undefined,
    });
  }

  // 자동저장 상태 확인
  async getAutoSaveStatus(userId: string, spreadsheetId: string) {
    const queueKey = `${userId}_${spreadsheetId}`;
    const queueItem = this.autoSaveQueue.get(queueKey);
    
    return {
      isQueued: !!queueItem,
      queuedAt: queueItem ? new Date(queueItem.timestamp).toISOString() : null,
      retryCount: queueItem?.retryCount ?? 0,
      pendingChanges: queueItem ? {
        cellChanges: queueItem.changes.cellChanges?.length ?? 0,
        metaChanges: queueItem.changes.metaChanges?.length ?? 0,
        newSheets: queueItem.changes.newSheets?.length ?? 0,
        deletedSheets: queueItem.changes.deletedSheets?.length ?? 0,
      } : null,
      estimatedSaveTime: queueItem 
        ? new Date(queueItem.timestamp + this.AUTO_SAVE_DELAY).toISOString() 
        : null,
      estimatedSize: queueItem ? this.estimateChangeSize(queueItem.changes) : null,
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
      await this.processDeltaAutoSave(queueKey);
      return { success: true, message: '델타 자동저장이 강제 실행되었습니다.' };
    }

    return { success: false, message: '저장할 변경사항이 큐에 없습니다.' };
  }

  // 메모리 정리
  clearAutoSaveQueue() {
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

  async getSpreadsheetByChatId(chatId: string) {
    // 1. chatId로 채팅 정보와 연결된 시트 메타데이터 조회
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        sheetMetaData: true,
      },
    });

    if (!chat) {
      return null;
    }

    if (!chat.sheetMetaData) {
      return {
        error: 'SHEET_NOT_FOUND',
        message: '이 채팅에 연결된 스프레드시트가 없습니다.',
        chatInfo: {
          id: chat.id,
          title: chat.title,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
        },
      };
    }

    // 2. 시트 메타데이터로 시트 테이블 데이터 조회
    const sheets = await this.prisma.sheetTableData.findMany({
      where: { sheetMetaDataId: chat.sheetMetaData.id },
      orderBy: {
        index: 'asc',
      },
    });

    return {
      chatInfo: {
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      },
      sheetMetaData: chat.sheetMetaData,
      sheets,
    };
  }

  /**
   * 어드민용: 채팅 ID로 스프레드시트 조회 (권한 체크 우회)
   */
  async getAdminSpreadsheetByChatId(chatId: string) {
    // 1. chatId로 채팅 정보와 연결된 시트 메타데이터 조회 (사용자 권한 체크 없음)
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        sheetMetaData: true,
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            isGuest: true,
          }
        }
      },
    });

    if (!chat) {
      return null;
    }

    if (!chat.sheetMetaData) {
      return {
        error: 'SHEET_NOT_FOUND',
        message: '이 채팅에 연결된 스프레드시트가 없습니다.',
        chatInfo: {
          id: chat.id,
          title: chat.title,
          userId: chat.userId,
          userDisplayName: chat.user?.displayName,
          userEmail: chat.user?.email,
          isGuestUser: chat.user?.isGuest,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
        },
      };
    }

    // 2. 시트 메타데이터로 시트 테이블 데이터 조회
    const sheets = await this.prisma.sheetTableData.findMany({
      where: { sheetMetaDataId: chat.sheetMetaData.id },
      orderBy: {
        index: 'asc',
      },
    });

    return {
      chatInfo: {
        id: chat.id,
        title: chat.title,
        userId: chat.userId,
        userDisplayName: chat.user?.displayName,
        userEmail: chat.user?.email,
        isGuestUser: chat.user?.isGuest,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      },
      sheetMetaData: chat.sheetMetaData,
      sheets,
    };
  }
}
