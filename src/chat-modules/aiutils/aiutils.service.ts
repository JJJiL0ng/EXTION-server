import { Injectable } from '@nestjs/common';
import { MarkdownProcessDto, ProcessedResponseDto } from './dto/markdown-process.dto';

@Injectable()
export class AiutilsService {


  remove(id: number) {
    return `This action removes a #${id} aiutil`;
  }

  /**
   * 마크다운 텍스트를 플레인 텍스트로 변환하는 메서드
   * @param markdownProcessDto - 변환할 마크다운 텍스트를 포함한 DTO
   * @returns ProcessedResponseDto - 변환된 플레인 텍스트와 원본 텍스트
   */
  processMarkdownToPlainText(markdownProcessDto: MarkdownProcessDto): ProcessedResponseDto {
    const { response } = markdownProcessDto;
    
    let plainText = response;

    // 마크다운 문법 제거
    plainText = this.removeMarkdownSyntax(plainText);

    return {
      plainText: plainText.trim(),
      originalText: response
    };
  }

  /**
   * 마크다운 문법을 제거하는 private 메서드
   * @param text - 처리할 텍스트
   * @returns 마크다운 문법이 제거된 플레인 텍스트
   */
  private removeMarkdownSyntax(text: string): string {
    let processed = text;

    // 1. 헤더 제거 (# ## ### #### ##### ######)
    processed = processed.replace(/^#{1,6}\s+/gm, '');

    // 2. 굵은 글씨 제거 (**text** 또는 __text__)
    processed = processed.replace(/\*\*(.*?)\*\*/g, '$1');
    processed = processed.replace(/__(.*?)__/g, '$1');

    // 3. 기울임 글씨 제거 (*text* 또는 _text_)
    processed = processed.replace(/\*(.*?)\*/g, '$1');
    processed = processed.replace(/_(.*?)_/g, '$1');

    // 4. 취소선 제거 (~~text~~)
    processed = processed.replace(/~~(.*?)~~/g, '$1');

    // 5. 인라인 코드 제거 (`code`)
    processed = processed.replace(/`([^`]+)`/g, '$1');

    // 6. 코드 블록 제거 (```code``` 또는 ~~~code~~~)
    processed = processed.replace(/```[\s\S]*?```/g, '');
    processed = processed.replace(/~~~[\s\S]*?~~~/g, '');

    // 7. 링크 제거 [text](url) -> text
    processed = processed.replace(/\[([^\]]+)]\([^)]+\)/g, '$1');

    // 8. 이미지 제거 ![alt](url)
    processed = processed.replace(/!\[[^\]]*]\([^)]+\)/g, '');

    // 9. 인용문 제거 (> text)
    processed = processed.replace(/^>\s*/gm, '');

    // 10. 리스트 마커 제거 (- * +)
    processed = processed.replace(/^[\s]*[-*+]\s+/gm, '');

    // 11. 숫자 리스트 마커 제거 (1. 2. 3.)
    processed = processed.replace(/^[\s]*\d+\.\s+/gm, '');

    // 12. 수평선 제거 (--- *** ___)
    processed = processed.replace(/^[\s]*[-*_]{3,}[\s]*$/gm, '');

    // 13. 테이블 구분자 제거 (|)
    processed = processed.replace(/\|/g, ' ');

    // 14. 불필요한 공백과 줄바꿈 정리
    processed = processed.replace(/\n{3,}/g, '\n\n'); // 3개 이상의 연속 줄바꿈을 2개로
    processed = processed.replace(/[ \t]+/g, ' '); // 연속된 공백을 하나로

    return processed;
  }

  /**
   * 단순히 마크다운 텍스트를 플레인 텍스트로 변환하는 유틸리티 메서드
   * 다른 서비스에서 쉽게 사용할 수 있도록 제공
   * @param markdownText - 변환할 마크다운 텍스트
   * @returns 플레인 텍스트
   */
  convertMarkdownToPlainText(markdownText: string): string {
    return this.removeMarkdownSyntax(markdownText).trim();
  }
}
