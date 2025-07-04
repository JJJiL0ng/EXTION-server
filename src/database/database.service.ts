import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatSheetDataResponseDto, SheetMetaDataWithTablesDto, ChatDto, MessageDto } from './dto/chat-sheet-data.dto';

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getChatSheetData(chatId: string): Promise<ChatSheetDataResponseDto> {
    this.logger.log(`채팅 시트 데이터 조회: chatId=${chatId}`);

    // Chat을 찾고 messages와 sheetMetaDataId를 함께 조회
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        messages: {
          orderBy: {
            timestamp: 'asc',
          },
        },
      },
    });

    if (!chat) {
      this.logger.warn(`채팅을 찾을 수 없음: chatId=${chatId}`);
      throw new Error(`Chat with id ${chatId} not found`);
    }

    this.logger.log(`채팅 조회 완료: chatId=${chatId}, 메시지 수=${chat.messages.length}`);

    // 채팅 데이터 구성
    const chatData: ChatDto = {
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      messageCount: chat.messageCount,
      status: chat.status as 'ACTIVE' | 'ARCHIVED' | 'DELETED',
      analytics: chat.analytics || undefined,
      userId: chat.userId,
      messages: chat.messages.map(message => ({
        id: message.id,
        content: message.content,
        timestamp: message.timestamp,
        role: message.role as 'USER' | 'EXTION_AI' | 'SYSTEM',
        type: message.type as 'TEXT' | 'FILE_UPLOAD' | 'FORMULA' | 'VISUALIZATION' | 'DATA_GENERATION' | 'FUNCTION' | 'DATA_EDIT',
        mode: message.mode as 'NORMAL' | 'FORMULA' | 'VISUALIZATION' | 'DATA_GENERATION' | 'DATA_FIX' | 'DATA_EDIT' | 'FUNCTION' || undefined,
        sheetContext: message.sheetContext || undefined,
        formulaData: message.formulaData || undefined,
        artifactData: message.artifactData || undefined,
        dataChangeInfo: message.dataChangeInfo || undefined,
        fileUploadInfo: message.fileUploadInfo || undefined,
        metadata: message.metadata || undefined,
      })),
    };

    // sheetMetaDataId가 없으면 sheetMetaData 없이 응답
    if (!chat.sheetMetaDataId) {
      this.logger.log(`시트 메타데이터 없음: chatId=${chatId}`);
      return {
        chatId: chat.id,
        chat: chatData,
        sheetMetaData: undefined,
      };
    }

    this.logger.log(`시트 메타데이터 조회 중: chatId=${chatId}, sheetMetaDataId=${chat.sheetMetaDataId}`);

    // sheetMetaData와 관련된 모든 sheetTableData를 함께 조회
    const sheetMetaData = await this.prisma.sheetMetaData.findUnique({
      where: { id: chat.sheetMetaDataId },
      include: {
        sheetTableData: {
          orderBy: {
            index: 'asc',
          },
        },
      },
    });

    if (!sheetMetaData) {
      this.logger.warn(`시트 메타데이터를 찾을 수 없음: sheetMetaDataId=${chat.sheetMetaDataId}`);
      throw new Error(`SheetMetaData with id ${chat.sheetMetaDataId} not found`);
    }

    this.logger.log(`채팅 시트 데이터 조회 완료: chatId=${chatId}, 메시지 수=${chat.messages.length}, 테이블 수=${sheetMetaData.sheetTableData.length}`);

    return {
      chatId: chat.id,
      chat: chatData,
      sheetMetaData: {
        id: sheetMetaData.id,
        fileName: sheetMetaData.fileName,
        originalFileName: sheetMetaData.originalFileName || undefined,
        fileSize: sheetMetaData.fileSize || undefined,
        fileType: sheetMetaData.fileType || undefined,
        activeSheetIndex: sheetMetaData.activeSheetIndex,
        createdAt: sheetMetaData.createdAt,
        updatedAt: sheetMetaData.updatedAt,
        userId: sheetMetaData.userId,
        sheetTableData: sheetMetaData.sheetTableData.map(table => ({
          id: table.id,
          name: table.name,
          index: table.index,
          data: table.data,
          createdAt: table.createdAt,
          updatedAt: table.updatedAt,
        })),
      },
    };
  }
}
