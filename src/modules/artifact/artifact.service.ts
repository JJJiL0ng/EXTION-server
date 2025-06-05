// src/modules/artifact/artifact.service.ts
import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { GenerateArtifactDto, ArtifactResponseDto, ArtifactType } from './dto/generate-artifact.dto';
import { FirebaseService } from '../../common/firebase/firebase.service';
import { CreateMessageDto, MessageRole, MessageType, MessageMode } from '../../common/dto/chat.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ArtifactService {
  private readonly logger = new Logger(ArtifactService.name);
  private readonly openai: OpenAI;

  constructor(
    private configService: ConfigService,
    private firebaseService: FirebaseService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });
  }

  async generateArtifact(dto: GenerateArtifactDto): Promise<ArtifactResponseDto> {
    try {
      this.logger.log(`아티팩트 생성 요청: ${dto.userInput}`);
      this.logger.log(`사용자 ID: ${dto.userId}`);
      this.logger.log(`채팅 ID: ${dto.chatId || '새 채팅'}`);
      this.logger.log(`스프레드시트 ID: ${dto.spreadsheetId || '없음'}`);
      this.logger.log(`스프레드시트 데이터 내 ID: ${dto.spreadsheetData?.spreadsheetId || '없음'}`);

      // === 1. 채팅 세션 처리 ===
      let chatId = dto.chatId;

      if (!chatId) {
        // chatId가 전혀 없는 경우 - 새 채팅 생성
        const chatTitle = dto.chatTitle || this.generateChatTitle(dto.userInput);
        chatId = await this.firebaseService.createChat(dto.userId, { 
          title: chatTitle,
          spreadsheetId: dto.spreadsheetId || dto.spreadsheetData?.spreadsheetId // 스프레드시트 ID 포함
        });
        this.logger.log(`새 채팅 생성: ${chatId}`);
        
        // 생성된 채팅에서 spreadsheetId 확인
        const createdChat = await this.firebaseService.getChat(chatId);
        this.logger.log(`✅ 새 채팅 spreadsheetId 저장 확인: ${createdChat?.spreadsheetId || '없음'}`);
      } else {
        // 프론트에서 chatId를 보낸 경우
        this.logger.log(`프론트에서 제공된 chatId: ${chatId}`);

        // 기존 채팅 존재 확인
        const existingChat = await this.firebaseService.getChat(chatId);

        if (!existingChat) {
          // Firebase에 해당 chatId로 채팅이 없으면 생성
          this.logger.log(`Firebase에 채팅이 없어서 새로 생성: ${chatId}`);
          const chatTitle = dto.chatTitle || this.generateChatTitle(dto.userInput);

          // 프론트엔드가 제공한 chatId를 사용하여 채팅 생성
          await this.firebaseService.createChatWithId(dto.userId, chatId, { 
            title: chatTitle,
            spreadsheetId: dto.spreadsheetId || dto.spreadsheetData?.spreadsheetId // 스프레드시트 ID 포함
          });
          
          // 생성된 채팅에서 spreadsheetId 확인
          const createdChatWithId = await this.firebaseService.getChat(chatId);
          this.logger.log(`✅ 특정 ID 채팅 spreadsheetId 저장 확인: ${createdChatWithId?.spreadsheetId || '없음'}`);
        } else {
          // 기존 채팅 소유권 확인
          if (existingChat.userId !== dto.userId) {
            throw new BadRequestException('채팅 접근 권한이 없습니다.');
          }
          this.logger.log(`기존 채팅 사용: ${chatId}`);
          
          // 기존 채팅에 스프레드시트 ID가 없고 새로 전달된 경우 업데이트
          const newSpreadsheetId = dto.spreadsheetId || dto.spreadsheetData?.spreadsheetId;
          if (!existingChat.spreadsheetId && newSpreadsheetId) {
            await this.firebaseService.updateChatSpreadsheetId(chatId, newSpreadsheetId);
            this.logger.log(`기존 채팅에 스프레드시트 ID 연결: ${newSpreadsheetId}`);
            
            // 업데이트된 채팅에서 spreadsheetId 확인
            const updatedChat = await this.firebaseService.getChat(chatId);
            this.logger.log(`✅ 기존 채팅 spreadsheetId 업데이트 확인: ${updatedChat?.spreadsheetId || '없음'}`);
          }
        }

        // === 중복 요청 방지 체크 ===
        const recentMessages = await this.firebaseService.getChatMessages(chatId, 5);
        const duplicateMessage = recentMessages.find(msg => 
          msg.content === dto.userInput && 
          msg.role === 'user' && 
          msg.type === 'artifact' &&
          (Date.now() - new Date(msg.timestamp).getTime()) < 30000 // 30초 이내
        );

        if (duplicateMessage) {
          this.logger.warn(`중복 요청 감지: ${dto.userInput} (최근 30초 이내)`);
          throw new BadRequestException('동일한 요청이 최근에 처리되었습니다. 잠시 후 다시 시도해주세요.');
        }
      }

      // === 2. 스프레드시트 데이터 처리 ===
      let spreadsheetMetadata: any = null;
      let activeSheetData: any = null;

      if (dto.spreadsheetData && dto.spreadsheetData.sheets.length > 0) {
        this.logger.log('프론트엔드에서 전송된 스프레드시트 데이터 사용');
        this.logger.log(`활성 시트: ${dto.spreadsheetData.activeSheet}`);
        this.logger.log(`전체 시트 수: ${dto.spreadsheetData.sheets.length}`);

        // 현재 활성 시트의 데이터 가져오기
        const currentSheet = dto.spreadsheetData.sheets[0]; // 프론트엔드에서 현재 시트만 보내므로 첫 번째 시트

        if (currentSheet) {
          this.logger.log(`현재 시트명: ${currentSheet.name}`);
          this.logger.log(`데이터 행 수: ${currentSheet.data.length}`);
          this.logger.log(`데이터 열 수: ${currentSheet.headers.length}`);

          // spreadsheetMetadata 구성
          spreadsheetMetadata = {
            fileName: dto.spreadsheetData.fileName || currentSheet.name,
            spreadsheetId: dto.spreadsheetData.spreadsheetId, // 스프레드시트 데이터 내 ID 사용
            sheets: [{
              sheetName: currentSheet.name,
              sheetIndex: currentSheet.sheetIndex || 0,
              headers: currentSheet.headers
            }],
            activeSheetIndex: 0,
            totalSheets: dto.spreadsheetData.sheets.length
          };

          // activeSheetData 구성
          activeSheetData = {
            data: {
              rows: currentSheet.data
            },
            rowCount: currentSheet.data.length,
            columnCount: currentSheet.headers.length,
            headers: currentSheet.headers
          };

          this.logger.log(`변환 완료 - 시트명: ${spreadsheetMetadata.sheets[0].sheetName}`);
          this.logger.log(`변환 완료 - 데이터 행 수: ${activeSheetData.data.rows.length}`);

          // 채팅에 스프레드시트 ID가 연결되지 않은 경우 연결
          if (dto.spreadsheetData.spreadsheetId) {
            const existingChat = await this.firebaseService.getChat(chatId);
            if (existingChat && !existingChat.spreadsheetId) {
              await this.firebaseService.updateChatSpreadsheetId(chatId, dto.spreadsheetData.spreadsheetId);
              this.logger.log(`채팅에 스프레드시트 ID 연결: ${dto.spreadsheetData.spreadsheetId}`);
              
              // 연결 후 실제 저장 확인
              const finalChat = await this.firebaseService.getChat(chatId);
              this.logger.log(`✅ 최종 채팅 spreadsheetId 연결 확인: ${finalChat?.spreadsheetId || '없음'}`);
            } else if (existingChat?.spreadsheetId) {
              this.logger.log(`✅ 채팅에 이미 spreadsheetId 존재: ${existingChat.spreadsheetId}`);
            }
          }
        }
      } else {
        this.logger.log('프론트엔드에서 스프레드시트 데이터를 보내지 않았습니다.');
      }

      // === 3. 사용자 메시지 저장 ===
      const sheetContext = this.createSheetContext(spreadsheetMetadata, activeSheetData);
      const userMessageDto: CreateMessageDto = {
        content: dto.userInput,
        role: MessageRole.USER,
        type: MessageType.ARTIFACT,
        mode: MessageMode.ARTIFACT,
        ...(sheetContext && { sheetContext }),
      };

      const userMessageId = await this.firebaseService.createMessage(chatId, userMessageDto);
      this.logger.log(`사용자 메시지 저장: ${userMessageId}`);

      // 아티팩트 타입 결정
      const artifactType = this.determineArtifactType(dto.userInput);

      // 시스템 프롬프트 생성
      const systemPrompt = this.createSystemPrompt(dto, artifactType);

      // 사용자 프롬프트 생성
      const userPrompt = this.createUserPrompt(dto.userInput, dto);

      // OpenAI API 호출
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 4000,
      });

      const aiResponse = completion.choices[0]?.message?.content;
      
      if (!aiResponse) {
        throw new InternalServerErrorException('AI 응답을 받을 수 없습니다.');
      }

      // 응답에서 코드 추출
      const extractedCode = this.extractCodeFromResponse(aiResponse);
      
      if (!extractedCode) {
        throw new InternalServerErrorException('유효한 코드를 생성할 수 없습니다.');
      }

      // 코드 검증
      this.validateGeneratedCode(extractedCode);

      // 데이터 분석 결과 추출
      const dataAnalysis = this.extractExplanationFromResponse(aiResponse);

      // === 4. AI 응답 메시지 저장 (아티팩트 데이터 포함) ===
      const artifactId = uuidv4();
      const aiMessageDto: CreateMessageDto = {
        content: dataAnalysis || `${artifactType} 데이터 분석이 완료되었습니다.`,
        role: MessageRole.EXTION_AI,
        type: MessageType.ARTIFACT,
        mode: MessageMode.ARTIFACT,
        ...(sheetContext && { sheetContext }),
        artifactData: {
          type: artifactType,
          title: this.generateTitle(dto.userInput, artifactType),
          artifactId: artifactId,
          code: extractedCode,
          explanation: dataAnalysis || `${artifactType} 데이터 분석이 완료되었습니다.`,
        },
      };

      const aiMessageId = await this.firebaseService.createMessage(chatId, aiMessageDto);
      this.logger.log(`AI 응답 메시지 저장: ${aiMessageId}`);

      // === 5. 분석 카운터 증가 ===
      await this.firebaseService.incrementAnalyticsCounter(chatId, 'artifactCount');

      // === 스프레드시트 메타데이터 업데이트 (양방향 참조) ===
      if (dto.spreadsheetData?.spreadsheetId && spreadsheetMetadata) {
        this.updateSpreadsheetMetadata(chatId, dto.spreadsheetData.spreadsheetId, spreadsheetMetadata).catch(error => {
          this.logger.error('스프레드시트 메타데이터 업데이트 중 오류 (비동기):', error);
        });
      }

      // === 6. 응답 반환 ===
      const result: ArtifactResponseDto = {
        success: true,
        code: extractedCode,
        type: artifactType,
        explanation: {
          korean: dataAnalysis || `${artifactType} 데이터 분석이 완료되었습니다.`
        },
        title: this.generateTitle(dto.userInput, artifactType),
        timestamp: new Date().toISOString(),
        chatId,
        userMessageId,
        aiMessageId,
        spreadsheetMetadata: this.buildSpreadsheetMetadataResponse(spreadsheetMetadata),
      };
      
      // 전체 응답 데이터 로깅 (code 포함)
      this.logger.log('==================== 프론트엔드 전송 응답 데이터 시작 ====================');
      this.logger.log(`성공 여부: ${result.success}`);
      this.logger.log(`타입: ${result.type}`);
      this.logger.log(`제목: ${result.title}`);
      this.logger.log(`데이터 분석: ${result.explanation?.korean || '분석 없음'}`);
      this.logger.log(`채팅 ID: ${result.chatId}`);
      this.logger.log(`사용자 메시지 ID: ${result.userMessageId}`);
      this.logger.log(`AI 메시지 ID: ${result.aiMessageId}`);
      this.logger.log(`코드:\n${result.code}`);
      this.logger.log(`타임스탬프: ${result.timestamp}`);
      this.logger.log('==================== 프론트엔드 전송 응답 데이터 끝 ====================');
      
      return result;

    } catch (error) {
      this.logger.error('아티팩트 생성 오류:', error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      const errorResult: ArtifactResponseDto = {
        success: false,
        error: error.message || '아티팩트 생성 중 오류가 발생했습니다.',
        timestamp: new Date().toISOString()
      };
      
      this.logger.log('==================== 프론트엔드 전송 오류 응답 시작 ====================');
      this.logger.log(JSON.stringify(errorResult, null, 2));
      this.logger.log('==================== 프론트엔드 전송 오류 응답 끝 ====================');
      
      return errorResult;
    }
  }

  // === 시트 컨텍스트 생성 ===
  private createSheetContext(spreadsheetMetadata: any, activeSheetData: any): any {
    if (!spreadsheetMetadata || !activeSheetData) {
      return null;
    }

    const activeSheet = spreadsheetMetadata.sheets?.[0];

    if (!activeSheet) {
      return null;
    }

    return {
      sheetIndex: activeSheet.sheetIndex || 0,
      sheetName: activeSheet.sheetName,
      affectedCells: [],
      totalRows: activeSheetData.rowCount || 0,
      totalColumns: activeSheetData.columnCount || 0,
      headers: activeSheetData.headers || []
    };
  }

  // === 스프레드시트 메타데이터 응답 생성 ===
  private buildSpreadsheetMetadataResponse(spreadsheetMetadata: any): any {
    if (!spreadsheetMetadata) {
      return {
        hasSpreadsheet: false,
        totalSheets: 0,
        activeSheetIndex: 0,
        sheetNames: [],
        lastModifiedAt: new Date(),
      };
    }

    return {
      hasSpreadsheet: true,
      fileName: spreadsheetMetadata.fileName,
      totalSheets: spreadsheetMetadata.totalSheets || spreadsheetMetadata.sheets?.length || 0,
      activeSheetIndex: spreadsheetMetadata.activeSheetIndex || 0,
      sheetNames: spreadsheetMetadata.sheets?.map(sheet => sheet.sheetName) || [],
      lastModifiedAt: new Date(),
    };
  }

  // === 채팅 제목 자동 생성 ===
  private generateChatTitle(userInput: string): string {
    const title = userInput.length > 30 ? userInput.substring(0, 30) + '...' : userInput;
    return title || '새로운 아티팩트 채팅';
  }

  private determineArtifactType(userInput: string): ArtifactType {
    const input = userInput.toLowerCase();
    
    // 차트 관련 키워드
    if (input.includes('차트') || input.includes('그래프') || 
        input.includes('시각화') || input.includes('막대') || 
        input.includes('선') || input.includes('파이') || 
        input.includes('산점도')) {
      return ArtifactType.CHART;
    }
    
    // 테이블 관련 키워드
    if (input.includes('테이블') || input.includes('표') || 
        input.includes('목록') || input.includes('정렬')) {
      return ArtifactType.TABLE;
    }
    
    // 기본값은 분석
    return ArtifactType.ANALYSIS;
  }

  private createSystemPrompt(dto: GenerateArtifactDto, artifactType: ArtifactType): string {
    const hasSpreadsheetData = !!(dto.spreadsheetData?.sheets?.length);
    const isMultiSheet = hasSpreadsheetData && (dto.spreadsheetData?.sheets?.length || 0) > 1;
    
    return `당신은 React와 Recharts를 사용하여 **엔터프라이즈급 비즈니스 전문가용** 데이터 분석 컴포넌트를 생성하는 전문가입니다.
  
  ## 🚨 중요한 규칙 (반드시 준수):
  1. **반드시 ComponentToRender 함수 컴포넌트를 정의**해야 합니다.
  2. **import 문을 절대 사용하지 마세요** - React, Recharts는 이미 전역으로 주입됩니다.
  3. **ResponsiveContainer는 사용하지 마세요** - 프론트엔드에서 제공되지 않습니다.
  4. **데이터는 자동으로 사용 가능**하므로 별도 import 불필요합니다.
  5. React hooks (useState, useEffect, useMemo)는 직접 사용 가능합니다.
  6. Recharts 컴포넌트들은 직접 사용 가능합니다.
  7. **JSX 대신 React.createElement를 반드시 사용**하세요.
  8. **Tailwind CSS 클래스는 className 속성으로 전달**하세요.
  9. **모든 텍스트는 한국어**로 작성하세요.
  10. **반드시 데이터 검증 로직을 포함**하세요.
  11. **코드 외부에 반드시 상세한 데이터 분석 결과를 포함**하세요.
  12. **💼 전문적이고 비즈니스 친화적인 디자인을 최우선으로 고려**하세요.
  
  ## 💼 엔터프라이즈 디자인 가이드라인 (필수 적용):
  
  ### 1. 전문적 색상 팔레트 (절제되고 신뢰감 있는):
  - **기본 비즈니스**: ['#1f2937', '#374151', '#6b7280', '#9ca3af', '#d1d5db']
  - **데이터 강조**: ['#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a']
  - **성과 지표**: ['#059669', '#047857', '#065f46'] (긍정적 수치)
  - **주의 지표**: ['#dc2626', '#b91c1c', '#991b1b'] (부정적 수치)
  - **중립 지표**: ['#7c3aed', '#6d28d9', '#5b21b6'] (중립적 수치)
  
  ### 2. 미니멀한 스타일링:
  - **배경**: 순백색(#ffffff) 또는 연한 회색(#f9fafb)
  - **테두리**: 얇고 절제된 선 (border-gray-200)
  - **그림자**: 최소한의 drop shadow (shadow-sm)
  - **둥근 모서리**: 약간만 (rounded-lg, 최대 rounded-xl)
  
  ### 3. 타이포그래피:
  - **제목**: text-xl 또는 text-2xl, font-semibold (과도한 bold 금지)
  - **본문**: text-sm 또는 text-base, font-normal
  - **레이블**: text-xs 또는 text-sm, text-gray-600
  - **폰트**: 시스템 기본 폰트 사용
  
  ### 4. 레이아웃:
  - **여백**: 적절하고 일정한 패딩/마진 (p-4, p-6, gap-4 등)
  - **정렬**: 깔끔한 그리드 시스템
  - **간격**: 충분하지만 낭비 없는 공간 활용
  
  ### 5. 차트 디자인 원칙:
  - **색상**: 최대 3-4개 색상만 사용
  - **선**: 얇고 선명한 선 (strokeWidth: 1-2)
  - **배경**: 완전 투명 또는 순백색
  - **애니메이션**: 최소한 또는 완전 제거
  
  ## 📊 차트별 전문적 스타일링:
  
  ### Bar Chart:
  - 모서리: 직각 또는 최소한의 radius={[2, 2, 0, 0]}
  - 색상: 단일 색상 또는 데이터 유형별 구분
  - 간격: 적절한 여백으로 가독성 확보
  
  ### Line Chart:
  - 선 스타일: 직선적 type="linear" (부드러운 곡선 지양)
  - 점: 작고 명확한 크기 dot={{ r: 3-4 }}
  - 색상: 단색 또는 최대 2-3개 색상
  
  ### Pie Chart:
  - 3D 효과 금지
  - 단순한 색상 구성
  - 명확한 라벨링
  
  ## 고정 크기 설정:
  - **표준 차트**: width={1000}, height={500}
  - **와이드 차트**: width={1200}, height={400}
  - **세로형 차트**: width={800}, height={600}
  
  ## 데이터 접근 방법:
  ${hasSpreadsheetData ? `
  ### 다중 시트 환경:
  - **xlsxData**: 전체 XLSX 파일 정보 (fileName, sheets, activeSheetIndex)
  - **activeSheetData**: 현재 활성 시트 데이터 (headers, data, sheetName)
  - **allSheetsData**: 모든 시트 데이터 배열
  - **getSheetByName(name)**: 이름으로 시트 찾기
  - **getSheetByIndex(index)**: 인덱스로 시트 찾기
  - **csvData**: 하위 호환성을 위한 활성 시트 데이터 (headers, data, fileName, sheetName)
  
  ### 활성 시트 정보:
  - 시트명: ${dto.spreadsheetData?.sheets?.[0]?.name || '알 수 없음'}
  - 총 시트 수: ${dto.spreadsheetData?.sheets?.length || 0}
  ` : `
  ### 단일 시트 환경:
  - **csvData**: 메인 데이터 객체 (headers, data, fileName)
  `}
  
  ## 현재 시트 구조:
  - headers: [${dto.spreadsheetData?.sheets[0]?.headers?.join(', ') || '없음'}]
  - data: string[][] (2차원 배열)
  - 각 행은 헤더 순서대로 데이터가 배열되어 있습니다.
  
  ## 필수 코드 구조 (엔터프라이즈급 전문 디자인):
  \`\`\`javascript
  const ComponentToRender = () => {
    // 1. 데이터 검증
    ${hasSpreadsheetData ? `
    if (!xlsxData || !activeSheetData || !activeSheetData.data) {
      return React.createElement('div', 
        { className: 'flex items-center justify-center h-64 bg-gray-50 border border-gray-200 rounded-lg' }, 
        React.createElement('div', { className: 'text-center' },
          React.createElement('div', { className: 'text-4xl mb-3 text-gray-400' }, '📊'),
          React.createElement('p', { className: 'text-gray-600 text-sm' }, '분석할 데이터가 없습니다.')
        )
      );
    }
    
    const currentData = activeSheetData.data;
    const headers = activeSheetData.headers;
    ` : `
    if (!csvData || !csvData.data) {
      return React.createElement('div', 
        { className: 'flex items-center justify-center h-64 bg-gray-50 border border-gray-200 rounded-lg' }, 
        React.createElement('div', { className: 'text-center' },
          React.createElement('div', { className: 'text-4xl mb-3 text-gray-400' }, '📊'),
          React.createElement('p', { className: 'text-gray-600 text-sm' }, '분석할 데이터가 없습니다.')
        )
      );
    }
    
    const currentData = csvData.data;
    const headers = csvData.headers;
    `}
    
    // 2. 전문적 크기 설정
    const chartWidth = 1000;
    const chartHeight = 500;
    
    // 3. 전문적 색상 설정 (최대 4개 색상)
    const businessColors = ['#2563eb', '#059669', '#dc2626', '#7c3aed'];
    
    // 4. 데이터 처리
    const processedData = currentData.map((row, index) => ({
      name: row[0] || \`항목 \${index + 1}\`,
      value: parseFloat(row[1]) || 0,
      fill: businessColors[index % businessColors.length]
    }));
    
    // 5. 통계 계산
    const totalValue = processedData.reduce((sum, item) => sum + item.value, 0);
    const avgValue = totalValue / processedData.length;
    const maxValue = Math.max(...processedData.map(item => item.value));
    const minValue = Math.min(...processedData.map(item => item.value));
    
    // 6. 전문적 렌더링
    return React.createElement('div', 
      { className: 'w-full bg-white' },
      
      // 헤더 (간단하고 전문적)
      React.createElement('div', 
        { className: 'border-b border-gray-200 pb-4 mb-6' },
        React.createElement('h1', 
          { className: 'text-2xl font-semibold text-gray-900 mb-2' }, 
          '${artifactType === ArtifactType.CHART ? '데이터 시각화' : '데이터 분석'}'
        ),
        React.createElement('p', 
          { className: 'text-sm text-gray-600' }, 
          \`총 \${processedData.length}개 항목 • \${new Date().toLocaleDateString('ko-KR')}\`
        )
      ),
      
      // 주요 지표 카드 (간결하게)
      React.createElement('div', 
        { className: 'grid grid-cols-4 gap-4 mb-6' },
        React.createElement('div', 
          { className: 'bg-gray-50 p-4 rounded-lg border border-gray-200' },
          React.createElement('p', { className: 'text-xs text-gray-500 mb-1' }, '총합'),
          React.createElement('p', { className: 'text-lg font-semibold text-gray-900' }, totalValue.toLocaleString())
        ),
        React.createElement('div', 
          { className: 'bg-gray-50 p-4 rounded-lg border border-gray-200' },
          React.createElement('p', { className: 'text-xs text-gray-500 mb-1' }, '평균'),
          React.createElement('p', { className: 'text-lg font-semibold text-gray-900' }, avgValue.toFixed(1))
        ),
        React.createElement('div', 
          { className: 'bg-gray-50 p-4 rounded-lg border border-gray-200' },
          React.createElement('p', { className: 'text-xs text-gray-500 mb-1' }, '최댓값'),
          React.createElement('p', { className: 'text-lg font-semibold text-gray-900' }, maxValue.toLocaleString())
        ),
        React.createElement('div', 
          { className: 'bg-gray-50 p-4 rounded-lg border border-gray-200' },
          React.createElement('p', { className: 'text-xs text-gray-500 mb-1' }, '최솟값'),
          React.createElement('p', { className: 'text-lg font-semibold text-gray-900' }, minValue.toLocaleString())
        )
      ),
      
      // 차트 영역 (깔끔하고 전문적)
      React.createElement('div', 
        { className: 'bg-white border border-gray-200 rounded-lg p-6 overflow-x-auto' },
        React.createElement('div',
          { style: { width: chartWidth, height: chartHeight } },
          React.createElement(BarChart, 
            { 
              width: chartWidth,
              height: chartHeight,
              data: processedData,
              margin: { top: 20, right: 30, left: 20, bottom: 40 }
            },
            
            React.createElement(CartesianGrid, 
              { 
                strokeDasharray: "3 3",
                stroke: "#e5e7eb",
                strokeWidth: 1
              }
            ),
            React.createElement(XAxis, 
              { 
                dataKey: 'name',
                tick: { fontSize: 12, fill: '#6b7280' },
                axisLine: { stroke: '#d1d5db', strokeWidth: 1 },
                tickLine: { stroke: '#d1d5db', strokeWidth: 1 }
              }
            ),
            React.createElement(YAxis, 
              { 
                tick: { fontSize: 12, fill: '#6b7280' },
                axisLine: { stroke: '#d1d5db', strokeWidth: 1 },
                tickLine: { stroke: '#d1d5db', strokeWidth: 1 }
              }
            ),
            React.createElement(Tooltip, 
              { 
                contentStyle: {
                  backgroundColor: '#ffffff',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  fontSize: '12px'
                }
              }
            ),
            React.createElement(Bar, 
              { 
                dataKey: 'value',
                fill: '#2563eb',
                radius: [2, 2, 0, 0]
              }
            )
          )
        )
      ),
      
      // 데이터 테이블 (추가 정보)
      React.createElement('div', 
        { className: 'mt-6' },
        React.createElement('h2', 
          { className: 'text-lg font-semibold text-gray-900 mb-3' }, 
          '상세 데이터'
        ),
        React.createElement('div', 
          { className: 'overflow-x-auto' },
          React.createElement('table', 
            { className: 'min-w-full divide-y divide-gray-200' },
            React.createElement('thead', 
              { className: 'bg-gray-50' },
              React.createElement('tr', {},
                headers.map((header, index) => 
                  React.createElement('th', 
                    { 
                      key: index,
                      className: 'px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'
                    }, 
                    header
                  )
                )
              )
            ),
            React.createElement('tbody', 
              { className: 'bg-white divide-y divide-gray-200' },
              currentData.slice(0, 5).map((row, rowIndex) => 
                React.createElement('tr', 
                  { key: rowIndex },
                  row.map((cell, cellIndex) => 
                    React.createElement('td', 
                      { 
                        key: cellIndex,
                        className: 'px-4 py-2 whitespace-nowrap text-sm text-gray-900'
                      }, 
                      cell
                    )
                  )
                )
              )
            )
          )
        ),
        currentData.length > 5 && React.createElement('p', 
          { className: 'text-xs text-gray-500 mt-2' }, 
          \`상위 5개 항목 표시 (전체 \${currentData.length}개)\`
        )
      )
    );
  };
  \`\`\`
  
  ## 🎯 엔터프라이즈급 특징:
  
  ### 1. 색상 철학:
  - 화려함보다 신뢰성
  - 브랜드 중립적
  - 인쇄 시에도 효과적
  
  ### 2. 레이아웃 철학:
  - 정보 전달이 우선
  - 불필요한 장식 제거
  - 일관성 있는 간격
  
  ### 3. 데이터 표현:
  - 명확한 수치 표시
  - 직관적인 범례
  - 오해의 여지가 없는 라벨
  
  ### 4. 접근성:
  - 색맹 친화적 색상
  - 충분한 대비
  - 명확한 텍스트
  
  ## 요청 타입: ${artifactType}
  ${artifactType === ArtifactType.CHART ? '- 전문적인 차트 시각화에 집중하세요. 비즈니스 의사결정에 도움이 되는 명확한 차트를 만드세요.' : ''}
  ${artifactType === ArtifactType.TABLE ? '- 깔끔한 테이블 분석에 집중하세요. 데이터의 패턴을 쉽게 파악할 수 있도록 하세요.' : ''}
  ${artifactType === ArtifactType.ANALYSIS ? '- 객관적인 데이터 분석에 집중하세요. 비즈니스 인사이트를 명확히 전달하세요.' : ''}
  
  ## 📊 데이터 분석 결과 제공 (전문적 형식):
  코드 생성 후 반드시 다음 형식으로 **객관적이고 전문적인** 데이터 분석 결과를 제공하세요:
  
  ■ 데이터 개요
  - 분석 대상: [데이터셋 설명]
  - 데이터 건수: [정확한 숫자]
  - 분석 기준일: [오늘 날짜]
  
  ■ 주요 지표
  - 총합: [수치 + 단위]
  - 평균: [수치 + 단위]
  - 최댓값/최솟값: [수치 + 항목명]
  - 표준편차: [변동성 수치]
  
  ■ 핵심 인사이트
  - [가장 중요한 발견사항 1개]
  - [두 번째 중요한 패턴]
  - [주목할 만한 이상값이나 트렌드]
  
  ■ 비즈니스 임플리케이션
  - [의사결정에 도움이 되는 해석]
  - [추천 액션 아이템 1-2개]
  
  **중요**: 화려한 효과나 그라데이션을 피하고, 깔끔하고 전문적인 비즈니스 문서 수준의 결과물을 만들어주세요. PowerPoint 프레젠테이션에 바로 사용할 수 있는 수준이어야 합니다.`;
  }

  private createUserPrompt(userInput: string, dto: GenerateArtifactDto): string {
    const hasData = !!(dto.spreadsheetData?.sheets?.length);
    const isMultiSheet = hasData && (dto.spreadsheetData?.sheets?.length || 0) > 1;
    
    let promptContent = `사용자 요청: "${userInput}"

`;

    if (hasData && dto.spreadsheetData?.sheets?.[0]) {
      const currentSheet = dto.spreadsheetData.sheets[0];

      promptContent += `## 현재 데이터 정보:
- **스프레드시트**: ${dto.spreadsheetData.fileName || '파일명 없음'}
- **시트명**: ${currentSheet.name}
- **컬럼**: ${currentSheet.headers?.join(', ') || '컬럼 없음'}
- **전체 데이터 행 수**: ${currentSheet.data?.length || 0}
- **전체 데이터 열 수**: ${currentSheet.headers?.length || 0}

`;

      // 실제 데이터가 있는 경우 포함
      if (currentSheet.data.length > 0) {
        const limitedRows = this.limitDataForPrompt(
          currentSheet.data,
          currentSheet.headers
        );

        promptContent += `## 실제 데이터:
\`\`\`
${limitedRows}
\`\`\`

**중요**: 위의 실제 데이터를 바탕으로 정확한 분석을 수행해주세요.
- 각 행과 열의 실제 값들을 참조하여 분석하세요
- 데이터의 패턴, 트렌드, 통계를 구체적으로 계산하세요
- 이상값이나 특이사항이 있다면 구체적으로 언급하세요

`;
      }
    } else {
      promptContent += `## 현재 데이터가 없습니다. 
사용자에게 데이터 업로드를 안내하거나 일반적인 스프레드시트 관련 질문에 답변해주세요.

`;
    }

    promptContent += `## 📊 데이터 분석 요구사항:
사용자의 요청에 대해 다음과 같이 응답해주세요:

1. **시각화 컴포넌트 생성**: 요청에 맞는 React 컴포넌트를 생성하세요.

2. **상세한 데이터 분석 제공**: 코드와 함께 반드시 다음을 포함한 데이터 분석을 제공하세요:
   - 실제 데이터를 기반으로 한 통계 분석 (평균, 총합, 최댓값, 최솟값 등)
   - 데이터의 패턴과 트렌드 분석
   - 이상값이나 특이사항 발견
   - 비즈니스 관점에서의 인사이트
   - 데이터 기반 추천사항이나 액션 아이템

3. **구체적 수치 제시**: 모든 분석은 실제 데이터의 구체적 수치와 함께 제시하세요.

데이터가 없는 경우에는 데이터 업로드를 안내하되, 일반적인 분석 방법론을 제시해주세요.`;

    return promptContent;
  }

  private limitDataForPrompt(rows: string[][], headers: string[]): string {
    const maxRows = 100; // 최대 100행까지만 포함
    const maxLength = 50000; // 최대 50,000 문자

    let csvContent = '';

    // 헤더 추가
    if (headers && headers.length > 0) {
      csvContent = headers.join(',') + '\n';
    }

    // 데이터 행 추가 (제한적으로)
    const limitedRows = rows.slice(0, maxRows);
    for (const row of limitedRows) {
      const rowContent = row.join(',') + '\n';

      if (csvContent.length + rowContent.length > maxLength) {
        csvContent += '\n... (더 많은 데이터가 있습니다. 총 ' + rows.length + '행)';
        break;
      }

      csvContent += rowContent;
    }

    return csvContent;
  }

  private extractCodeFromResponse(response: string): string {
    // 코드 블록에서 코드 추출
    const codeBlockRegex = /```(?:javascript|jsx|js)?\n?([\s\S]*?)\n?```/;
    const match = response.match(codeBlockRegex);
    
    this.logger.debug(`AI 응답: ${response.substring(0, 100)}...`);
    
    if (match && match[1]) {
      this.logger.debug('코드 블록에서 코드 추출 성공');
      return match[1].trim();
    }
    
    // ComponentToRender를 포함한 부분 찾기
    const componentRegex = /const ComponentToRender[\s\S]*?};/;
    const componentMatch = response.match(componentRegex);
    
    if (componentMatch) {
      this.logger.debug('ComponentToRender 정규식으로 코드 추출 성공');
      return componentMatch[0];
    }
    
    this.logger.warn('응답에서 코드를 추출할 수 없습니다');
    return '';
  }

  private extractExplanationFromResponse(response: string): string {
    this.logger.debug(`데이터 분석 추출 시작: 응답 길이 ${response.length}자`);
    
    // 1. 데이터 분석 결과 섹션을 우선 찾기
    const analysisRegex = /(?:\*\*데이터 분석 결과:\*\*|데이터 분석 결과:|## 데이터 분석|### 데이터 분석|📊 데이터 분석)([\s\S]*?)(?=\n\n|\n```|$)/;
    const analysisMatch = response.match(analysisRegex);
    
    if (analysisMatch && analysisMatch[1]) {
      const analysis = analysisMatch[1].trim();
      if (analysis.length > 20) {
        this.logger.debug('데이터 분석 결과 섹션 추출 성공');
        return analysis;
      }
    }
    
    // 2. 코드 블록 이후의 분석 추출
    const parts = response.split('```');
    
    if (parts.length > 2) {
      const afterCode = parts[2].trim();
      if (afterCode.length > 10) { // 최소 10자 이상의 의미있는 분석
        this.logger.debug('코드 블록 분리 후 분석 추출 성공');
        return afterCode;
      }
    }
    
    // 3. 분석, 인사이트, 결과 등의 키워드가 포함된 섹션 찾기
    const insightRegex = /(?:분석[:：]|## 분석|### 분석|인사이트[:：]|## 인사이트|### 인사이트|결과[:：]|## 결과|### 결과|핵심 인사이트|비즈니스 관점)([\s\S]*?)(?=\n\n|\n```|$)/;
    const insightMatch = response.match(insightRegex);
    
    if (insightMatch && insightMatch[1]) {
      const insight = insightMatch[1].trim();
      if (insight.length > 10) {
        this.logger.debug('인사이트 섹션 정규식 추출 성공');
        return insight;
      }
    }
    
    // 4. 통계나 수치가 포함된 부분 찾기
    const statsRegex = /(평균|총합|최댓값|최솟값|개수|비율|퍼센트|%)[^.]*\.[\s\S]*?(?=\n\n|\n```|$)/;
    const statsMatch = response.match(statsRegex);
    
    if (statsMatch && statsMatch[0]) {
      const stats = statsMatch[0].trim();
      if (stats.length > 20) {
        this.logger.debug('통계 수치 포함 분석 추출 성공');
        return stats;
      }
    }
    
    // 5. 전체 응답에서 의미있는 텍스트 부분 찾기 (코드 제외)
    const codeBlockRegex = /```[\s\S]*?```/g;
    const textWithoutCode = response.replace(codeBlockRegex, '').trim();
    
    if (textWithoutCode.length > 20) {
      this.logger.debug('코드 제외 후 텍스트 추출');
      return textWithoutCode;
    }
    
    this.logger.warn('응답에서 데이터 분석을 추출할 수 없습니다');
    return '';
  }

  private validateGeneratedCode(code: string): void {
    this.logger.debug(`코드 검증 시작: 길이 ${code.length}자`);
    
    // ComponentToRender가 정의되어 있는지 확인
    if (!code.includes('ComponentToRender')) {
      this.logger.error('ComponentToRender 함수가 정의되지 않았습니다');
      throw new InternalServerErrorException('ComponentToRender 함수가 정의되지 않았습니다.');
    }
    
    // 기본적인 구문 검사
    const openBraces = (code.match(/{/g) || []).length;
    const closeBraces = (code.match(/}/g) || []).length;
    
    this.logger.debug(`중괄호 검증: 열기 ${openBraces}개, 닫기 ${closeBraces}개`);
    
    if (openBraces !== closeBraces) {
      this.logger.error(`중괄호 불일치: 열기 ${openBraces}개, 닫기 ${closeBraces}개`);
      throw new InternalServerErrorException('코드의 중괄호가 올바르게 닫히지 않았습니다.');
    }
    
    this.logger.debug('코드 검증 완료: 유효한 코드');
  }

  private generateTitle(userInput: string, artifactType: ArtifactType): string {
    const typeMap = {
      [ArtifactType.CHART]: '차트 분석',
      [ArtifactType.TABLE]: '테이블 분석',
      [ArtifactType.ANALYSIS]: '데이터 분석'
    };
    
    return `${typeMap[artifactType]} - ${userInput.substring(0, 20)}${userInput.length > 20 ? '...' : ''}`;
  }

  // 스프레드시트 메타데이터 업데이트 (양방향 참조)
  private async updateSpreadsheetMetadata(chatId: string, spreadsheetId: string, spreadsheetMetadata: any): Promise<void> {
    try {
      this.logger.log('==================== 스프레드시트 메타데이터 업데이트 시작 ====================');
      
      // Firebase 서비스를 통해 스프레드시트 메타데이터 업데이트
      await this.firebaseService.updateSpreadsheetMetadata(spreadsheetId, spreadsheetMetadata);

      this.logger.log('✅ 스프레드시트 메타데이터 업데이트 완료');
      this.logger.log('==================== 스프레드시트 메타데이터 업데이트 끝 ====================');

    } catch (error) {
      this.logger.error('스프레드시트 메타데이터 업데이트 중 오류:', error);
      // 메타데이터 업데이트 실패는 치명적이지 않으므로 에러를 던지지 않음
    }
  }

  // 스프레드시트 ID로 연결된 채팅들 조회
  async getChatsBySpreadsheetId(spreadsheetId: string, userId: string): Promise<any[]> {
    try {
      this.logger.log(`스프레드시트 연결 채팅 조회: ${spreadsheetId}`);
      
      const chats = await this.firebaseService.getChatsBySpreadsheetId(spreadsheetId, userId);
      
      this.logger.log(`연결된 채팅 수: ${chats.length}`);
      return chats;
    } catch (error) {
      this.logger.error('스프레드시트 연결 채팅 조회 오류:', error);
      throw error;
    }
  }

  // 채팅 ID로 연결된 스프레드시트 ID 조회
  async getSpreadsheetIdByChat(chatId: string): Promise<string | null> {
    try {
      this.logger.log(`채팅 연결 스프레드시트 ID 조회: ${chatId}`);
      
      const spreadsheetId = await this.firebaseService.getSpreadsheetIdByChat(chatId);
      
      this.logger.log(`연결된 스프레드시트 ID: ${spreadsheetId || '없음'}`);
      return spreadsheetId;
    } catch (error) {
      this.logger.error('채팅 연결 스프레드시트 ID 조회 오류:', error);
      throw error;
    }
  }
}