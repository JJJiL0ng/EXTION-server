import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadSheetsDto, UploadSheetsResDto } from './dto/uploadSheets.dto';
import { MappingService } from './mapping/mapping.service';

@Injectable()
export class SchemaConverterService {
  private readonly logger = new Logger(SchemaConverterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mappingService: MappingService,
  ) { }

  /**
   * uploadSheets - sourceSheet와 targetSheet를 저장
   *
   * @param userId - 워크플로우를 소유할 사용자 ID
   * @param dto - 업로드할 시트 데이터
   * @returns 생성된 워크플로우와 버전 정보 (+ 매핑 제안)
   */
  async uploadSheets(
    userId: string,
    dto: UploadSheetsDto,
  ): Promise<Omit<UploadSheetsResDto, 'success'>> {
    const {
      sourceSheetData,
      targetSheetData,
      sourceSheetName,
      targetSheetName,
      isFirstWorkFlowGenerated,
      isExcuteMappingSuggestion,
      sourceSheetRange,
      selectedSourceSheetName,
      targetSheetRange,
      selectedTargetSheetName,
      workFlowId,
    } = dto;

    // Case 1: 새로운 워크플로우 생성
    if (isFirstWorkFlowGenerated) {
      const workflow = await this.prisma.schemaConverterWorkflow.create({
        data: {
          userId,
          name: `워크플로우 - ${new Date().toISOString()}`,
          description: '새로운 스키마 변환 워크플로우',
          sourceSheetVersions: {
            create: {
              name: sourceSheetName,
              data: sourceSheetData,
            },
          },
          targetSheetVersions: {
            create: {
              name: targetSheetName,
              data: targetSheetData,
            },
          },
        },
        include: {
          sourceSheetVersions: true,
          targetSheetVersions: true,
        },
      });

      // 매핑 제안 실행 (선택적)
      let mappingSuggestions: string | undefined;
      if (isExcuteMappingSuggestion !== false) {
        // 기본값이 true이므로 명시적으로 false가 아니면 실행
        this.logger.log('Executing mapping suggestion...');
        try {
          mappingSuggestions = await this.mappingService.generateMappingSuggestion({
            sourceSheetName,
            sourceSheet: sourceSheetData,
            sourceSheetRange,
            selectedSourceSheetName,
            targetSheetName,
            targetSheet: targetSheetData,
            targetSheetRange,
            selectedTargetSheetName,
          });
        } catch (error) {
          this.logger.error('Mapping suggestion failed, continuing without it:', error);
          // 매핑 제안 실패해도 워크플로우 생성은 성공으로 처리
        }
      }

      return {
        workflowId: workflow.id,
        sourceSheetVersionId: workflow.sourceSheetVersions[0].id,
        targetSheetVersionId: workflow.targetSheetVersions[0].id,
        mappingSuggestions,
      };
    }

    // Case 2: 기존 워크플로우에 새 버전 추가
    if (!workFlowId) {
      throw new Error('workFlowId는 필수입니다 (isFirstWorkFlowGenerated가 false인 경우)');
    }

    // 기존 워크플로우 존재 확인
    const existingWorkflow = await this.prisma.schemaConverterWorkflow.findUnique({
      where: { id: workFlowId },
      include: {
        sourceSheetVersions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        targetSheetVersions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!existingWorkflow) {
      throw new Error(`워크플로우를 찾을 수 없습니다: ${workFlowId}`);
    }

    // 최신 버전을 부모로 하는 새 버전 생성
    const latestSourceVersion = existingWorkflow.sourceSheetVersions[0];
    const latestTargetVersion = existingWorkflow.targetSheetVersions[0];

    const [newSourceVersion, newTargetVersion] = await this.prisma.$transaction([
      this.prisma.sourceSheetVersion.create({
        data: {
          workflowId: workFlowId,
          name: sourceSheetName,
          data: sourceSheetData,
          parentId: latestSourceVersion?.id,
        },
      }),
      this.prisma.targetSheetVersion.create({
        data: {
          workflowId: workFlowId,
          name: targetSheetName,
          data: targetSheetData,
          parentId: latestTargetVersion?.id,
        },
      }),
    ]);

    // 매핑 제안 실행 (선택적)
    let mappingSuggestions: string | undefined;
    if (isExcuteMappingSuggestion == true) {
      this.logger.log('Executing mapping suggestion for existing workflow...');
      try {
        mappingSuggestions = await this.mappingService.generateMappingSuggestion({
          sourceSheetName,
          sourceSheet: sourceSheetData,
          sourceSheetRange,
          selectedSourceSheetName,
          targetSheetName,
          targetSheet: targetSheetData,
          targetSheetRange,
          selectedTargetSheetName,
        });
      } catch (error) {
        this.logger.error('Mapping suggestion failed, continuing without it:', error);
      }
    }

    return {
      workflowId: workFlowId,
      sourceSheetVersionId: newSourceVersion.id,
      targetSheetVersionId: newTargetVersion.id,
      mappingSuggestions,
    };
  }
}
