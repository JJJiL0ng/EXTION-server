import { AiChatJobRegistryService } from './ai-chat-job-registry.service';

describe('AiChatJobRegistryService', () => {
  let service: AiChatJobRegistryService;

  beforeEach(() => {
    service = new AiChatJobRegistryService();
  });

  it('stores and deletes jobs by id', () => {
    const job = {
      aiReq: { jobId: 'job-1' },
      plan: { tasks: [] },
      clientId: 'client-1',
      createdAt: 1000,
      previousMessages: [],
    } as any;

    service.set('job-1', job);

    expect(service.get('job-1')).toBe(job);
    expect(service.delete('job-1')).toBe(true);
    expect(service.get('job-1')).toBeUndefined();
  });

  it('deletes jobs by client id', () => {
    service.set('job-1', { clientId: 'client-1' } as any);
    service.set('job-2', { clientId: 'client-2' } as any);

    expect(service.deleteByClientId('client-1')).toEqual(['job-1']);
    expect(service.get('job-1')).toBeUndefined();
    expect(service.get('job-2')).toBeDefined();
  });

  it('returns expired jobs before deleting them', () => {
    service.set('old-job', { clientId: 'client-1', createdAt: 1000 } as any);
    service.set('new-job', { clientId: 'client-1', createdAt: 2000 } as any);

    expect(service.deleteExpiredJobs(500, 1601)).toEqual([
      expect.objectContaining({ jobId: 'old-job', clientId: 'client-1' }),
    ]);
    expect(service.get('old-job')).toBeUndefined();
    expect(service.get('new-job')).toBeDefined();
  });
});
