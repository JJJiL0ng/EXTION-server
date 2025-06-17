import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateSpreadsheetDto } from './dto/spreadsheet.dto';

@Injectable()
export class SpreadsheetService {
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
