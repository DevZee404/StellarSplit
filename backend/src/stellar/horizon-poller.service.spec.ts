import { HorizonPollerService } from './horizon-poller.service';
import { backoff } from '../utils/backoff';

describe('HorizonPollerService', () => {
  const createService = () => {
    const repository = {
      findOne: jest.fn(),
      save: jest.fn(),
    } as any;

    return new HorizonPollerService(
      {} as any,
      {} as any,
      repository,
      { emit: jest.fn() } as any,
    );
  };

  it('emits a ledger gap event when a stream record jumps past the prior ledger', async () => {
    const service = createService();
    (service as any).lastLedger = 5;
    const eventEmitter = (service as any).eventEmitter;

    await (service as any).handleStreamRecord({ paging_token: '7' });

    expect(eventEmitter.emit).toHaveBeenCalledWith('stellar.ledger.gap', {
      expected: 6,
      received: 7,
      gap: 1,
    });
  });

  it('uses the expected exponential backoff curve with a cap', () => {
    expect(backoff(0, 1000, 60000)).toBe(1000);
    expect(backoff(1, 1000, 60000)).toBe(2000);
    expect(backoff(2, 1000, 60000)).toBe(4000);
    expect(backoff(3, 1000, 60000)).toBe(8000);
    expect(backoff(15, 1000, 60000)).toBe(60000);
  });
});
