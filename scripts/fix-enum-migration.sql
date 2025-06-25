-- Railway 운영 환경에서 enum 마이그레이션 오류 해결을 위한 SQL 스크립트
-- P3009 오류: DATAFIX -> DATA_FIX, DATAGENERATION -> DATA_GENERATION 변환

-- 기존 enum 값들을 새로운 형식으로 변환 (안전한 방식)
-- MessageMode 변환
UPDATE "Message" SET "mode" = 'DATA_FIX' WHERE "mode" = 'DATAFIX';
UPDATE "Message" SET "mode" = 'DATA_GENERATION' WHERE "mode" = 'DATAGENERATION'; 
UPDATE "Message" SET "mode" = 'FUNCTION' WHERE "mode" = 'ARTIFACT';

-- MessageType 변환  
UPDATE "Message" SET "type" = 'DATA_GENERATION' WHERE "type" = 'DATAGENERATION';
UPDATE "Message" SET "type" = 'FUNCTION' WHERE "type" = 'ARTIFACT';
UPDATE "Message" SET "type" = 'DATA_EDIT' WHERE "type" = 'DATA_FIX'; 