import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TableDataJsonParserDto } from './dto/tableDataJsonParserDto';
import { createHash } from 'crypto';

@Injectable()
export class TableDataJsonParserService {
	constructor(private readonly prisma: PrismaService) {}

	// 입력으로 전체 원본 JSON과 참조 ID들을 받아 시트별 저장 + 잔여 저장 수행
	async parseAndPersist(dto: TableDataJsonParserDto) {
		const { spreadSheetId, sourceDataId, rawData } = dto;

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
			// 잔여 저장
			const remainderRow = await p.parsedRemainder.create({
				data: {
					spreadSheetId,
					sourceDataId: sourceDataId ?? null,
					content: remainder as any,
					dataHash: hash(remainder),
					savedAt: now,
				},
			});

			// 시트별 저장 (세부 내용 비파싱 그대로 저장)
			const sheetEntries = Object.entries(sheets as Record<string, unknown>);
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
			}

			return {
				spreadSheetId,
				savedAt: now,
				sheetsSaved: sheetEntries.length,
				remainderId: remainderRow.id,
			};
		});
	}
}
