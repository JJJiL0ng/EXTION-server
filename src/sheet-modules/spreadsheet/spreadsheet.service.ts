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

      // 4. chatId가 제공된 경우, 채팅과 시트 메타데이터 연결
      if (chatId) {
        await tx.chat.update({
          where: { id: chatId, userId: userId },
          data: {
            sheetMetaData: {
              connect: { id: sheetMetaData.id },
            },
          },
        });
      }

      return {
        ...sheetMetaData,
        sheets: sheets.map((s) => ({
          name: s.name,
          index: s.index,
          rowCount: s.data.length,
        })),
      };
    });
  }
}
