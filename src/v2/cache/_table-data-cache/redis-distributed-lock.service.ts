// import { Injectable, Logger } from '@nestjs/common';
// import { InjectRedis } from '@nestjs-modules/ioredis';
// import Redis from 'ioredis';

// @Injectable()
// export class RedisDistributedLockService {
//   private readonly logger = new Logger(RedisDistributedLockService.name);
  
//   constructor(
//     @InjectRedis() private readonly redis: Redis,
//   ) {}

//   /**
//    * Redis 기반 분산 락 획득
//    * @param lockKey 락 키
//    * @param ttlMs 락 유지 시간 (밀리초)
//    * @param timeoutMs 락 획득 대기 시간 (밀리초)
//    * @returns 락 획득 성공 시 unlock 함수, 실패 시 null
//    */
//   async acquireLock(
//     lockKey: string,
//     ttlMs: number = 30000,
//     timeoutMs: number = 5000
//   ): Promise<(() => Promise<void>) | null> {
//     const lockValue = `${Date.now()}-${Math.random()}`;
//     const lockFullKey = `lock:${lockKey}`;
//     const startTime = Date.now();

//     while (Date.now() - startTime < timeoutMs) {
//       try {
//         // SET key value PX milliseconds NX
//         const result = await this.redis.set(lockFullKey, lockValue, 'PX', ttlMs, 'NX');
        
//         if (result === 'OK') {
//           this.logger.debug(`Lock acquired: ${lockKey}`);
          
//           // unlock 함수 반환
//           return async () => {
//             await this.releaseLock(lockFullKey, lockValue);
//           };
//         }
        
//         // 짧은 대기 후 재시도
//         await this.sleep(50 + Math.random() * 50); // 50-100ms 랜덤 지연
        
//       } catch (error) {
//         this.logger.error(`Lock acquisition error: ${error.message}`);
//         break;
//       }
//     }

//     this.logger.warn(`Failed to acquire lock: ${lockKey} after ${timeoutMs}ms`);
//     return null;
//   }

//   /**
//    * Redis 락 해제
//    */
//   private async releaseLock(lockKey: string, lockValue: string): Promise<void> {
//     try {
//       // Lua 스크립트로 원자적 락 해제
//       const luaScript = `
//         if redis.call("get", KEYS[1]) == ARGV[1] then
//           return redis.call("del", KEYS[1])
//         else
//           return 0
//         end
//       `;
      
//       const result = await this.redis.eval(luaScript, 1, lockKey, lockValue);
      
//       if (result === 1) {
//         this.logger.debug(`Lock released: ${lockKey}`);
//       } else {
//         this.logger.warn(`Lock was already released or expired: ${lockKey}`);
//       }
//     } catch (error) {
//       this.logger.error(`Lock release error: ${error.message}`);
//     }
//   }

//   /**
//    * 대기 유틸리티
//    */
//   private sleep(ms: number): Promise<void> {
//     return new Promise(resolve => setTimeout(resolve, ms));
//   }

//   /**
//    * 락 상태 확인
//    */
//   async isLocked(lockKey: string): Promise<boolean> {
//     try {
//       const result = await this.redis.exists(`lock:${lockKey}`);
//       return result === 1;
//     } catch (error) {
//       this.logger.error(`Lock status check error: ${error.message}`);
//       return false;
//     }
//   }

//   /**
//    * 강제 락 해제 (관리자용)
//    */
//   async forceReleaseLock(lockKey: string): Promise<void> {
//     try {
//       await this.redis.del(`lock:${lockKey}`);
//       this.logger.warn(`Force released lock: ${lockKey}`);
//     } catch (error) {
//       this.logger.error(`Force lock release error: ${error.message}`);
//     }
//   }
// }