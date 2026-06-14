export interface SocketErrorPayload {
  jobId?: string;
  message?: string;
  code: string;
  retryAfter?: number;
  executionTime?: number;
  timestamp: string;
}

export function createSocketErrorPayload(
  payload: Omit<SocketErrorPayload, 'timestamp'> & { timestamp?: string },
): SocketErrorPayload {
  return {
    ...payload,
    timestamp: payload.timestamp ?? new Date().toISOString(),
  };
}
