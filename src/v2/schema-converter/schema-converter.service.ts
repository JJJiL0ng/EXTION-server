import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadSheetsReqDto, UploadSheetsResDto } from './dto/uploadSheets.dto';
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
    dto: UploadSheetsReqDto,
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
      // 매핑 제안 실행 (선택적) - 워크플로우 생성 전에 먼저 실행
      let mappingSuggestions: string | undefined;
      let shouldCreateWorkflowCode = false;

      if (isExcuteMappingSuggestion !== false) {
        // 기본값이 true이므로 명시적으로 false가 아니면 실행
        shouldCreateWorkflowCode = true; // 매핑 제안 실행 시도 시 무조건 WorkflowCode 생성
        this.logger.log(`Executing mapping suggestion... (isExcuteMappingSuggestion: ${isExcuteMappingSuggestion})`);
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
          }, 'small'); // 'small' 모델 사용 | small, large, normal 선택해서 사용
          this.logger.log(`Mapping suggestion completed. Result length: ${mappingSuggestions?.length || 0}`);
        } catch (error) {
          this.logger.error(`Mapping suggestion failed - Error: ${error.message}`, error.stack);
          // 매핑 제안 실패해도 워크플로우 생성은 성공으로 처리
        }
      } else {
        this.logger.log(`Skipping mapping suggestion (isExcuteMappingSuggestion: ${isExcuteMappingSuggestion})`);
      }

      // 매핑 제안 후 워크플로우 생성
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

      // 매핑 제안 실행을 시도했으면 무조건 WorkflowCode 생성 (mappingSuggestion이 없어도)
      let WorkflowCodeId: string | undefined;
      if (shouldCreateWorkflowCode) {
        try {
          const workflowCode = await this.prisma.workflowCode.create({
            data: {
              workflowId: workflow.id,
              name: `매핑 제안 - ${new Date().toISOString()}`,
              code: '', // 코드는 나중에 생성될 수 있으므로 빈 문자열
              mappingSuggestion: mappingSuggestions || '', // mappingSuggestions가 없어도 빈 문자열로 생성
              mappingScript: {}, // 빈 객체로 초기화
            },
          });
          WorkflowCodeId = workflowCode.id;
          this.logger.log(`WorkflowCode created with ID: ${WorkflowCodeId}`);
        } catch (error) {
          this.logger.error(`Failed to create WorkflowCode: ${error.message}`, error.stack);
          // WorkflowCode 생성 실패해도 워크플로우 생성은 성공으로 처리
        }
      }

      return {
        workflowId: workflow.id,
        sourceSheetVersionId: workflow.sourceSheetVersions[0].id,
        targetSheetVersionId: workflow.targetSheetVersions[0].id,
        mappingSuggestions,
        WorkflowCodeId,
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

    // 매핑 제안 실행 (선택적) - 새 버전 생성 전에 먼저 실행
    let mappingSuggestions: string | undefined;
    let shouldCreateWorkflowCode = false;

    if (isExcuteMappingSuggestion == true) {
      shouldCreateWorkflowCode = true; // 매핑 제안 실행 시도 시 무조건 WorkflowCode 생성
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
        }, 'small'); // 'small' 모델 사용 | small, large, normal 선택해서 사용
      } catch (error) {
        this.logger.error('Mapping suggestion failed, continuing without it:', error);
      }
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

    // 매핑 제안 실행을 시도했으면 무조건 WorkflowCode 생성 (mappingSuggestion이 없어도)
    let WorkflowCodeId: string | undefined;
    if (shouldCreateWorkflowCode) {
      try {
        const workflowCode = await this.prisma.workflowCode.create({
          data: {
            workflowId: workFlowId,
            name: `매핑 제안 - ${new Date().toISOString()}`,
            code: '', // 코드는 나중에 생성될 수 있으므로 빈 문자열
            mappingSuggestion: mappingSuggestions || '', // mappingSuggestions가 없어도 빈 문자열로 생성
            mappingScript: {}, // 빈 객체로 초기화
          },
        });
        WorkflowCodeId = workflowCode.id;
        this.logger.log(`WorkflowCode created with ID: ${WorkflowCodeId}`);
      } catch (error) {
        this.logger.error(`Failed to create WorkflowCode: ${error.message}`, error.stack);
        // WorkflowCode 생성 실패해도 버전 추가는 성공으로 처리
      }
    }

    return {
      workflowId: workFlowId,
      sourceSheetVersionId: newSourceVersion.id,
      targetSheetVersionId: newTargetVersion.id,
      mappingSuggestions,
      WorkflowCodeId,
    };
  }
}
