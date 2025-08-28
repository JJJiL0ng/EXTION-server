import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TableDataJsonParserDto } from './dto/tableDataJsonParserDto';
import { createHash } from 'crypto';

@Injectable()
export class TableDataJsonParserService {
	constructor(private readonly prisma: PrismaService) {}

	// 시트 ID와 parsedSheetName으로 ParsedSheet 데이터를 가져오는 함수
	async loadParsedSpreadSheetData(spreadSheetId: string, parsedSheetName: string) {
		console.log(`[DEBUG] loadParsedSpreadSheetData called with:`, {
			spreadSheetId,
			parsedSheetName
		});

		try {
			const parsedSheet = await this.prisma.parsedSheet.findFirst({
				where: {
					spreadSheetId: spreadSheetId,
					sheetName: parsedSheetName,
				},
				orderBy: {
					savedAt: 'desc' // 가장 최근 저장된 데이터를 가져옴
				}
			});

			if (!parsedSheet) {
				console.log(`[DEBUG] No ParsedSheet found for spreadSheetId: ${spreadSheetId}, sheetName: ${parsedSheetName}`);
				return null;
			}

			console.log(`[DEBUG] Found ParsedSheet:`, {
				id: parsedSheet.id,
				sheetName: parsedSheet.sheetName,
				dataHash: parsedSheet.dataHash,
				savedAt: parsedSheet.savedAt
			});

			return {
				id: parsedSheet.id,
				spreadSheetId: parsedSheet.spreadSheetId,
				sourceDataId: parsedSheet.sourceDataId,
				sheetName: parsedSheet.sheetName,
				content: parsedSheet.content,
				dataHash: parsedSheet.dataHash,
				savedAt: parsedSheet.savedAt
			};

		} catch (error) {
			console.error(`[ERROR] Failed to load ParsedSheet:`, error);
			throw new Error(`Failed to load parsed spreadsheet data: ${error.message}`);
		}
	}

	// 입력으로 전체 원본 JSON과 참조 ID들을 받아 시트별 저장 + 잔여 저장 수행
	async parseAndPersist(dto: TableDataJsonParserDto) {
		const { spreadSheetId, sourceDataId, rawData } = dto;

		console.log(`[DEBUG] ParseAndPersist called with:`, {
			spreadSheetId,
			sourceDataId,
			rawDataKeys: rawData ? Object.keys(rawData) : 'null'
		});

		if (!rawData || typeof rawData !== 'object') {
			throw new Error('rawData must be a JSON object');
		}

		// sheets 객체를 추출하고, 잔여 데이터는 얕은 복사 후 sheets 제거
		const sheets = (rawData as any).sheets ?? {};
		const remainder: Record<string, any> = { ...(rawData as any) };
		delete (remainder as any).sheets;

		// 해시 유틸
			const hash = (val: unknown) =>
				createHash('sha256').update(JSON.stringify(val)).digest('hex');

		const now = new Date();

		// 트랜잭션으로 일괄 저장
			return await this.prisma.$transaction(async (tx) => {
				const p: any = tx as any;
			// 잔여 저장 비활성화 (요청에 따라 주석 처리)
			// const remainderRow = await p.parsedRemainder.create({
			// 	data: {
			// 		spreadSheetId,
			// 		sourceDataId: sourceDataId ?? null,
			// 		content: remainder as any,
			// 		dataHash: hash(remainder),
			// 		savedAt: now,
			// 	},
			// });
			const remainderRowId: string | null = null;

			// 시트별 저장 (세부 내용 비파싱 그대로 저장)
			const sheetEntries = Object.entries(sheets as Record<string, unknown>);
			console.log(`[DEBUG] Processing ${sheetEntries.length} sheets with sourceDataId: ${sourceDataId ?? null}`);
			
			if (sheetEntries.length > 0) {
				await p.parsedSheet.createMany({
					data: sheetEntries.map(([sheetName, content]) => ({
						spreadSheetId,
						sourceDataId: sourceDataId ?? null,
						sheetName,
						content: content as any,
						dataHash: hash(content),
						savedAt: now,
					})),
					skipDuplicates: true, // (spreadSheetId, sheetName, dataHash) unique
				});
				console.log(`[DEBUG] Successfully created ${sheetEntries.length} ParsedSheet records`);
			}

			return {
				spreadSheetId,
				savedAt: now,
				sheetsSaved: sheetEntries.length,
				remainderId: remainderRowId,
			};
		});
	}
}
