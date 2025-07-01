import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatSheetDataResponseDto, SheetMetaDataWithTablesDto } from './dto/chat-sheet-data.dto';

@Injectable()
export class DatabaseService {
  constructor(private readonly prisma: PrismaService) {}

  async getChatSheetData(chatId: string): Promise<ChatSheetDataResponseDto> {
    // 먼저 Chat을 찾아서 sheetMetaDataId를 확인
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        id: true,
        sheetMetaDataId: true,
      },
    });

    if (!chat) {
      throw new Error(`Chat with id ${chatId} not found`);
    }

    // sheetMetaDataId가 없으면 sheetMetaData 없이 응답
    if (!chat.sheetMetaDataId) {
      return {
        chatId: chat.id,
        sheetMetaData: undefined,
      };
    }

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
      throw new Error(`SheetMetaData with id ${chat.sheetMetaDataId} not found`);
    }

    return {
      chatId: chat.id,
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
