import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchService } from './search.service';
import { Split } from '../entities/split.entity';
import { Item } from '../entities/item.entity';
import { Participant } from '../entities/participant.entity';

describe('SearchService', () => {
  let service: SearchService;
  let splitRepository: Repository<Split>;

  const mockRepository = {
    query: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: getRepositoryToken(Split),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(Item),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(Participant),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
    splitRepository = module.get<Repository<Split>>(getRepositoryToken(Split));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sanitiseHighlight', () => {
    it('strips unsafe tags while preserving <em> tags', () => {
      const input = '<strong>bad</strong> <em>dinner</em> <script>alert(1)</script>';
      const result = (service as any).sanitiseHighlight(input);
      expect(result).toBe('bad <em>dinner</em> alert(1)');
    });
  });

  describe('searchSplits', () => {
    it('falls back to trigram similarity when FTS returns no results for a misspelled query', async () => {
      const fakeSplit = {
        id: 'split-1',
        description: 'Dinner at home',
        items: [],
        participants: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        totalAmount: 0,
        amountPaid: 0,
        status: 'active',
        deletedAt: null,
        preferredCurrency: 'XLM',
      } as any;

      const queryBuilder: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        getMany: jest.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([fakeSplit]),
        getCount: jest.fn().mockResolvedValue(1),
      };

      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder);
      service['features'] = { fts: true, trgm: true, materializedView: false };

      const result = await service.searchSplits({
        query: 'dinnerr',
        limit: 10,
        sort: 'createdAt_desc',
      } as any);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.data[0].split).toBe(fakeSplit);
      expect(queryBuilder.getMany).toHaveBeenCalledTimes(2);
      expect(queryBuilder.getCount).toHaveBeenCalledTimes(1);
      expect(queryBuilder.andWhere.mock.calls.some((call: any) =>
        String(call[0]).includes('similarity(COALESCE(split.description, \'\'), :rawQuery) > :threshold')
      )).toBe(true);
    });
  });
});
