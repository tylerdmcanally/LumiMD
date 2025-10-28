import providerService from '../../../src/services/providerService';
import { NotFoundError } from '../../../src/utils/errors';
import logger from '../../../src/utils/logger';

jest.mock('@prisma/client', () => {
  const providerModel = {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const visitModel = {
    count: jest.fn(),
  };

  return {
    PrismaClient: jest.fn(() => ({
      provider: providerModel,
      visit: visitModel,
    })),
    __mock: {
      providerModel,
      visitModel,
    },
  };
});

const { __mock } = jest.requireMock('@prisma/client') as any;
const providerModel = __mock.providerModel as jest.Mocked<any>;
const visitModel = __mock.visitModel as jest.Mocked<any>;

jest.mock('../../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

const resetMocks = () => {
  jest.clearAllMocks();
  providerModel.create.mockReset();
  providerModel.findFirst.mockReset();
  providerModel.findMany.mockReset();
  providerModel.update.mockReset();
  providerModel.delete.mockReset();
  visitModel.count.mockReset();
};

describe('ProviderService', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('createProvider', () => {
    it('persists provider linked to user', async () => {
      const provider = { id: 'prov-1', name: 'Dr Smith' };
      providerModel.create.mockResolvedValue(provider);

      const result = await providerService.createProvider('user-1', {
        name: 'Dr Smith',
        specialty: 'Cardiology',
      } as any);

      expect(providerModel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          name: 'Dr Smith',
          specialty: 'Cardiology',
        }),
      });
      expect(result).toEqual(provider);
    });
  });

  describe('getProviderById', () => {
    it('returns provider with visits when owned by user', async () => {
      const provider = { id: 'prov-1', userId: 'user-1', visits: [] };
      providerModel.findFirst.mockResolvedValue(provider);

      const result = await providerService.getProviderById('prov-1', 'user-1');

      expect(providerModel.findFirst).toHaveBeenCalledWith({
        where: { id: 'prov-1', userId: 'user-1' },
        include: {
          visits: {
            orderBy: { visitDate: 'desc' },
            take: 5,
          },
        },
      });
      expect(result).toEqual(provider);
    });

    it('throws when provider not found', async () => {
      providerModel.findFirst.mockResolvedValue(null);

      await expect(providerService.getProviderById('missing', 'user-1')).rejects.toBeInstanceOf(
        NotFoundError
      );
    });
  });

  describe('listProviders', () => {
    it('returns providers ordered by name', async () => {
      const providers = [{ id: 'prov-1' }];
      providerModel.findMany.mockResolvedValue(providers);

      const result = await providerService.listProviders('user-1');

      expect(providerModel.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        include: {
          _count: { select: { visits: true } },
        },
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual(providers);
    });
  });

  describe('updateProvider', () => {
    it('updates provider when owned by user', async () => {
      providerModel.findFirst.mockResolvedValue({ id: 'prov-1' });
      providerModel.update.mockResolvedValue({ id: 'prov-1', name: 'Updated' });

      const result = await providerService.updateProvider(
        'prov-1',
        'user-1',
        { name: 'Updated' }
      );

      expect(providerModel.findFirst).toHaveBeenCalledWith({
        where: { id: 'prov-1', userId: 'user-1' },
      });
      expect(providerModel.update).toHaveBeenCalledWith({
        where: { id: 'prov-1' },
        data: { name: 'Updated' },
      });
      expect(result).toEqual({ id: 'prov-1', name: 'Updated' });
    });

    it('throws when provider not owned by user', async () => {
      providerModel.findFirst.mockResolvedValue(null);

      await expect(
        providerService.updateProvider('prov-1', 'user-1', { name: 'Updated' })
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('deleteProvider', () => {
    it('throws when provider not found', async () => {
      providerModel.findFirst.mockResolvedValue(null);

      await expect(providerService.deleteProvider('prov-1', 'user-1')).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it('prevents deletion when visits exist', async () => {
      providerModel.findFirst.mockResolvedValue({ id: 'prov-1' });
      visitModel.count.mockResolvedValue(2);

      await expect(providerService.deleteProvider('prov-1', 'user-1')).rejects.toThrow(
        /Cannot delete provider/
      );
      expect(providerModel.delete).not.toHaveBeenCalled();
    });

    it('deletes provider with no visits', async () => {
      providerModel.findFirst.mockResolvedValue({ id: 'prov-1' });
      visitModel.count.mockResolvedValue(0);

      await providerService.deleteProvider('prov-1', 'user-1');

      expect(providerModel.delete).toHaveBeenCalledWith({ where: { id: 'prov-1' } });
    });
  });
});
