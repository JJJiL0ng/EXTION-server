import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class GeminiApiService {
  private readonly logger = new Logger(GeminiApiService.name);
  private genAI: GoogleGenerativeAI;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    this.genAI = new GoogleGenerativeAI(apiKey || '');
  }

  async generateContent(prompt: string): Promise<string> {
    const model = this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.0-flash';
    
    try {
      const genModel = this.genAI.getGenerativeModel({ model });
      const result = await genModel.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      this.logger.log(`Gemini API 응답: ${text}`);
      return text.trim().toLowerCase();
    } catch (error) {
      this.logger.error('Gemini API 호출 중 오류 발생', error);
      throw error;
    }
  }
}