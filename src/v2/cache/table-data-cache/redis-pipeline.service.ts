import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

export interface PipelineOperation {
  command: string;
  args: any[];
  key?: string; // 로깅용
}

export interface PipelineResult {
  success: boolean;
  results: any[];
  errors: Array<{ index: number; error: Error; operation: PipelineOperation }>;
  totalOperations: number;
  successCount: number;
  failureCount: number;
}

@Injectable()
export class RedisPipelineService {
  private readonly logger = new Logger(RedisPipelineService.name);

  constructor(
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /**
   * 안전한 Pipeline 실행 with 에러 처리
   */
  async executePipeline(operations: PipelineOperation[]): Promise<PipelineResult> {
    if (operations.length === 0) {
      return {
        success: true,
        results: [],
        errors: [],
        totalOperations: 0,
        successCount: 0,
        failureCount: 0
      };
    }

    const pipeline = this.redis.pipeline();
    const result: PipelineResult = {
      success: false,
      results: [],
      errors: [],
      totalOperations: operations.length,
      successCount: 0,
      failureCount: 0
    };

    try {
      // Pipeline에 작업들 추가
      for (const operation of operations) {
        if (this.isValidOperation(operation)) {
          (pipeline as any)[operation.command](...operation.args);
        } else {
          result.errors.push({
            index: operations.indexOf(operation),
            error: new Error(`Invalid operation: ${operation.command}`),
            operation
          });
        }
      }

      // Pipeline 실행
      const pipelineResults = await pipeline.exec();
      
      if (!pipelineResults) {
        throw new Error('Pipeline execution returned null');
      }

      // 결과 처리
      for (let i = 0; i < pipelineResults.length; i++) {
        const [error, data] = pipelineResults[i];
        
        if (error) {
          result.errors.push({
            index: i,
            error: error as Error,
            operation: operations[i]
          });
          result.failureCount++;
        } else {
          result.results[i] = data;
          result.successCount++;
        }
      }

      result.success = result.failureCount === 0;

      // 로깅
      if (result.failureCount > 0) {
        this.logger.warn(
          `Pipeline completed with ${result.failureCount} failures out of ${result.totalOperations} operations`
        );
        
        for (const error of result.errors) {
          this.logger.error(
            `Pipeline operation ${error.index} failed: ${error.operation.command} ${error.operation.key || ''} - ${error.error.message}`
          );
        }
      } else {
        this.logger.debug(`Pipeline completed successfully: ${result.totalOperations} operations`);
      }

    } catch (error) {
      this.logger.error(`Pipeline execution failed: ${error.message}`);
      
      // 전체 실패로 처리
      result.success = false;
      result.failureCount = operations.length;
      
      for (let i = 0; i < operations.length; i++) {
        result.errors.push({
          index: i,
          error: error as Error,
          operation: operations[i]
        });
      }
    }

    return result;
  }

  /**
   * 배치 삭제 with 에러 처리
   */
  async batchDelete(keys: string[]): Promise<PipelineResult> {
    const operations: PipelineOperation[] = keys.map(key => ({
      command: 'del',
      args: [key],
      key
    }));

    return this.executePipeline(operations);
  }

  /**
   * 배치 설정 with 에러 처리
   */
  async batchSet(
    entries: Array<{ key: string; value: string; ttl?: number }>
  ): Promise<PipelineResult> {
    const operations: PipelineOperation[] = entries.map(entry => {
      const operation: PipelineOperation = {
        command: entry.ttl ? 'setex' : 'set',
        args: entry.ttl ? [entry.key, entry.ttl, entry.value] : [entry.key, entry.value],
        key: entry.key
      };
      return operation;
    });

    return this.executePipeline(operations);
  }

  /**
   * 배치 만료 시간 설정
   */
  async batchExpire(entries: Array<{ key: string; ttl: number }>): Promise<PipelineResult> {
    const operations: PipelineOperation[] = entries.map(entry => ({
      command: 'expire',
      args: [entry.key, entry.ttl],
      key: entry.key
    }));

    return this.executePipeline(operations);
  }

  /**
   * 안전한 단일 작업 실행
   */
  async safeExecute<T>(
    command: string,
    args: any[],
    retries: number = 3,
    retryDelayMs: number = 100
  ): Promise<{ success: boolean; data?: T; error?: Error }> {
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const data = await (this.redis as any)[command](...args);
        
        return {
          success: true,
          data
        };
        
      } catch (error) {
        this.logger.warn(
          `Redis ${command} attempt ${attempt}/${retries} failed: ${error.message}`
        );
        
        if (attempt === retries) {
          return {
            success: false,
            error: error as Error
          };
        }
        
        // 재시도 전 대기
        await this.sleep(retryDelayMs * attempt);
      }
    }

    return {
      success: false,
      error: new Error('Max retries exceeded')
    };
  }

  /**
   * Redis 연결 상태 확인
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    latency?: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      await this.redis.ping();
      const latency = Date.now() - startTime;
      
      return {
        healthy: true,
        latency
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * 대량 키 존재 확인
   */
  async batchExists(keys: string[]): Promise<PipelineResult> {
    const operations: PipelineOperation[] = keys.map(key => ({
      command: 'exists',
      args: [key],
      key
    }));

    return this.executePipeline(operations);
  }

  /**
   * 대량 TTL 조회
   */
  async batchTTL(keys: string[]): Promise<PipelineResult> {
    const operations: PipelineOperation[] = keys.map(key => ({
      command: 'ttl',
      args: [key],
      key
    }));

    return this.executePipeline(operations);
  }

  /**
   * 작업 유효성 검증
   */
  private isValidOperation(operation: PipelineOperation): boolean {
    if (!operation.command || typeof operation.command !== 'string') {
      return false;
    }

    if (!Array.isArray(operation.args)) {
      return false;
    }

    // Redis 명령어 화이트리스트 확인
    const allowedCommands = [
      'get', 'set', 'del', 'exists', 'expire', 'ttl', 'setex', 'setnx',
      'incr', 'decr', 'hget', 'hset', 'hdel', 'sadd', 'srem', 'zadd', 'zrem'
    ];

    return allowedCommands.includes(operation.command.toLowerCase());
  }

  /**
   * 대기 유틸리티
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Pipeline 통계 조회
   */
  getConnectionInfo(): {
    status: string;
    lazyConnect: boolean;
    commandQueue: number;
  } {
    return {
      status: this.redis.status,
      lazyConnect: this.redis.options.lazyConnect || false,
      commandQueue: (this.redis as any).commandQueue?.length || 0
    };
  }
}