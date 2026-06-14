import { Injectable, Logger } from '@nestjs/common';
import { createSafeError } from '../../sheet/types/spreadsheet.types';
import { PrismaService } from '../../prisma/prisma.service';
import { filteredSheetReturns } from '../types/aiChat.types';

@Injectable()
export class AiChatSpreadsheetContextService {
  private readonly logger = new Logger(AiChatSpreadsheetContextService.name);

  constructor(private readonly prisma: PrismaService) {}

  async loadParsedSpreadsheetData(
    spreadsheetId: string,
    parsedSheetNames: string[],
    userId: string,
    spreadSheetVersionId?: string,
  ): Promise<filteredSheetReturns | null> {
    this.logger.log(`loadParsedSpreadsheetData called with - spreadsheetId: ${spreadsheetId}, parsedSheetNames: ${JSON.stringify(parsedSheetNames)}, userId: ${userId}, versionId: ${spreadSheetVersionId}`);

    if (!spreadsheetId || !userId) {
      this.logger.warn(`Missing required parameters - spreadsheetId: ${spreadsheetId}, userId: ${userId}`);
      return null;
    }

    if (!parsedSheetNames || parsedSheetNames.length === 0) {
      this.logger.warn(`parsedSheetNames is empty or null - will load all available sheets. parsedSheetNames: ${JSON.stringify(parsedSheetNames)}`);
    }

    try {
      this.logger.log(`Loading spreadsheet data from JSONB for id: ${spreadsheetId}, sheets: ${parsedSheetNames?.join(', ') || 'ALL'}, user: ${userId}`);

      const spreadSheet = await this.prisma.spreadSheet.findFirst({
        where: {
          id: spreadsheetId,
          userId: userId,
          status: 'ACTIVE',
        },
      });

      if (!spreadSheet) {
        this.logger.warn(`SpreadSheet not found or access denied - spreadsheetId: ${spreadsheetId}, userId: ${userId}`);
        return null;
      }

      const targetVersionId = spreadSheetVersionId || spreadSheet.headVersionId;

      if (!targetVersionId) {
        this.logger.warn(`No version available for spreadsheet: ${spreadsheetId}`);
        return null;
      }

      const spreadSheetVersionData = await this.prisma.spreadSheetVersionData.findUnique({
        where: {
          id: targetVersionId,
        },
      });

      this.logger.log(`SpreadSheetVersionData query result:`, {
        found: !!spreadSheetVersionData,
        hasData: !!(spreadSheetVersionData as any)?.data,
        dataType: typeof (spreadSheetVersionData as any)?.data,
      });

      if (!spreadSheetVersionData || !(spreadSheetVersionData as any).data) {
        this.logger.warn(`No JSONB data found for spreadsheet: ${spreadsheetId}. SpreadSheetVersionData exists: ${!!spreadSheetVersionData}`);
        return null;
      }

      return this.filterSheetsFromData(
        (spreadSheetVersionData as any).data,
        parsedSheetNames,
        `spreadsheet: ${spreadsheetId}`,
      );
    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Failed to load parsed spreadsheet data: ${safeError.message}`, safeError.details);
      return null;
    }
  }

  async parseNewVersionSpreadSheetData(
    parsedSheetNames: string[],
    newVersionSpreadSheetData: Record<string, any>,
  ): Promise<filteredSheetReturns | null> {
    this.logger.log(`parseNewVersionSpreadSheetData called with - parsedSheetNames: ${JSON.stringify(parsedSheetNames)}`);

    if (!newVersionSpreadSheetData) {
      this.logger.warn(`newVersionSpreadSheetData is null or undefined`);
      return null;
    }

    if (!parsedSheetNames || parsedSheetNames.length === 0) {
      this.logger.warn(`parsedSheetNames is empty or null - will load all available sheets. parsedSheetNames: ${JSON.stringify(parsedSheetNames)}`);
    }

    try {
      this.logger.log(`Parsing new version spreadsheet data, sheets: ${parsedSheetNames?.join(', ') || 'ALL'}`);
      return this.filterSheetsFromData(
        newVersionSpreadSheetData,
        parsedSheetNames,
        'newVersionSpreadSheetData',
      );
    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Failed to parse new version spreadsheet data: ${safeError.message}`, safeError.details);
      return null;
    }
  }

  private filterSheetsFromData(
    rawData: Record<string, any>,
    parsedSheetNames: string[],
    sourceLabel: string,
  ): filteredSheetReturns | null {
    let fullData: Record<string, any>;
    let sheets: any;

    if (rawData.spreadsheetData?.sheets) {
      sheets = rawData.spreadsheetData.sheets;
      fullData = rawData.spreadsheetData;
      this.logger.log(`Using spreadsheetData.sheets structure for ${sourceLabel}`);
    } else if (rawData.sheets) {
      sheets = rawData.sheets;
      fullData = rawData;
      this.logger.log(`Using direct sheets structure for ${sourceLabel}`);
    } else {
      this.logger.warn(`No sheets found in ${sourceLabel}. Available keys:`, Object.keys(rawData));
      return null;
    }

    this.logger.log(`Found sheets:`, Object.keys(sheets));

    let foundSheetCount = 0;
    const availableSheets = Object.keys(sheets);
    let filteredSheets: { [sheetName: string]: any } = {};

    if (parsedSheetNames && parsedSheetNames.length > 0) {
      for (const sheetName of parsedSheetNames) {
        if (sheets[sheetName]) {
          filteredSheets[sheetName] = sheets[sheetName];
          foundSheetCount++;
          this.logger.log(`Found and included requested sheet: ${sheetName} in filtered data`);
        } else {
          this.logger.warn(`Requested sheet '${sheetName}' not found in ${sourceLabel}. Available sheets: ${availableSheets.join(', ')}`);
        }
      }

      if (foundSheetCount === 0) {
        this.logger.warn(`None of the requested sheets were found in ${sourceLabel}`);
        return null;
      }

      this.logger.log(`Successfully filtered ${foundSheetCount}/${parsedSheetNames.length} requested sheets: ${Object.keys(filteredSheets).join(', ')}`);
    } else {
      filteredSheets = sheets;
      foundSheetCount = availableSheets.length;
      this.logger.log(`No specific sheets requested, using all available sheets: ${availableSheets.join(', ')}`);
    }

    fullData.sheets = filteredSheets;

    const requestedSheetCount = parsedSheetNames?.length || availableSheets.length;
    this.logger.log(`Successfully loaded spreadsheet data with ${Object.keys(filteredSheets).length} sheets (${foundSheetCount}/${requestedSheetCount} requested): ${Object.keys(filteredSheets).join(', ')}`);

    return fullData.sheets;
  }
}
