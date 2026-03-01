import { CoreService } from './core.service';
import { runSql } from '../auth/db.util';
import { BadRequestException } from '@nestjs/common';

jest.mock('../auth/db.util', () => ({
  runSql: jest.fn(),
  sqlLiteral: (value: string) => `'${String(value).replace(/'/g, "''")}'`,
}));

const mockedRunSql = runSql as jest.MockedFunction<typeof runSql>;

describe('CoreService ownership and cutoff rules', () => {
  let service: CoreService;

  beforeEach(() => {
    service = new CoreService();
    mockedRunSql.mockReset();
  });

  it('blocks parent order update when parent-child ownership is missing', async () => {
    mockedRunSql
      .mockResolvedValueOnce(
        JSON.stringify({
          id: 'order-1',
          child_id: 'child-1',
          service_date: '2099-01-10',
          session: 'LUNCH',
          status: 'PLACED',
          total_price: '10000',
          dietary_snapshot: '',
        }),
      )
      .mockResolvedValueOnce('parent-1')
      .mockResolvedValueOnce('f');

    await expect(
      service.updateOrder(
        { uid: 'user-parent', role: 'PARENT', sub: 'parent_user' },
        'order-1',
        {
          serviceDate: '2099-01-10',
          session: 'LUNCH',
          items: [{ menuItemId: 'menu-1', quantity: 1 }],
        },
      ),
    ).rejects.toThrow('ORDER_OWNERSHIP_FORBIDDEN');
  });

  it('blocks parent delete after cutoff', async () => {
    mockedRunSql
      .mockResolvedValueOnce(
        JSON.stringify({
          id: 'order-2',
          child_id: 'child-2',
          service_date: '2020-01-10',
          status: 'PLACED',
        }),
      )
      .mockResolvedValueOnce('parent-1')
      .mockResolvedValueOnce('t');

    await expect(
      service.deleteOrder({ uid: 'user-parent', role: 'PARENT', sub: 'parent_user' }, 'order-2'),
    ).rejects.toThrow('ORDER_CUTOFF_EXCEEDED');
  });

  it('blocks youngster order update after placement', async () => {
    mockedRunSql.mockResolvedValueOnce(
      JSON.stringify({
        id: 'order-3',
        child_id: 'child-3',
        service_date: '2099-01-10',
        session: 'LUNCH',
        status: 'PLACED',
        total_price: '10000',
        dietary_snapshot: '',
      }),
    );

    await expect(
      service.updateOrder(
        { uid: 'user-youngster', role: 'YOUNGSTER', sub: 'youngster_user' },
        'order-3',
        {
          serviceDate: '2099-01-10',
          session: 'LUNCH',
          items: [{ menuItemId: 'menu-1', quantity: 1 }],
        },
      ),
    ).rejects.toThrow('ORDER_CHILD_UPDATE_FORBIDDEN');
  });

  it('returns ORDER_SERVICE_BLOCKED when service blackout type is SERVICE_BLOCK', async () => {
    mockedRunSql
      .mockResolvedValueOnce('2')
      .mockResolvedValueOnce(
        JSON.stringify({
          blackout_date: '2099-01-12',
          type: 'SERVICE_BLOCK',
          reason: 'Kitchen maintenance',
        }),
      );

    await expect(
      (service as any).validateOrderDayRules('2099-01-12'),
    ).rejects.toThrow('ORDER_SERVICE_BLOCKED');
  });

  it('uses blackout guard in createCart flow', async () => {
    jest
      .spyOn(service as any, 'validateOrderDayRules')
      .mockRejectedValue(new BadRequestException('ORDER_SERVICE_BLOCKED'));

    await expect(
      service.createCart(
        { uid: 'admin-1', role: 'ADMIN', sub: 'admin_user' },
        { childId: 'child-1', serviceDate: '2099-01-13', session: 'LUNCH' },
      ),
    ).rejects.toThrow('ORDER_SERVICE_BLOCKED');
  });

  it('blocks parent cart creation before 08:00 Asia/Makassar', async () => {
    jest.spyOn(service as any, 'getMakassarNowContext').mockReturnValue({ dateIso: '2026-03-01', hour: 7 });

    await expect(
      service.createCart(
        { uid: 'parent-1', role: 'PARENT', sub: 'parent_user' },
        { childId: 'child-1', serviceDate: '2026-03-02', session: 'LUNCH' },
      ),
    ).rejects.toThrow('ORDERING_AVAILABLE_FROM_0800_WITA');
  });

  it('blocks youngster cart creation for same-day service date', async () => {
    jest.spyOn(service as any, 'getMakassarNowContext').mockReturnValue({ dateIso: '2026-03-01', hour: 9 });

    await expect(
      service.createCart(
        { uid: 'youngster-1', role: 'YOUNGSTER', sub: 'youngster_user' },
        { childId: 'child-1', serviceDate: '2026-03-01', session: 'LUNCH' },
      ),
    ).rejects.toThrow('ORDER_TOMORROW_ONWARDS_ONLY');
  });

  it('uses blackout guard in submitCart flow', async () => {
    jest.spyOn(service as any, 'ensureCartIsOpenAndOwned').mockResolvedValue({
      id: 'cart-1',
      child_id: 'child-1',
      created_by_user_id: 'admin-1',
      session: 'LUNCH',
      service_date: '2099-01-13',
      status: 'OPEN',
      expires_at: '2099-01-13T00:00:00.000Z',
    });
    mockedRunSql.mockResolvedValueOnce(
      JSON.stringify({
        menu_item_id: 'menu-1',
        quantity: 1,
        name: 'Rice Bowl',
        price: '15000',
      }),
    );
    jest
      .spyOn(service as any, 'validateOrderDayRules')
      .mockRejectedValue(new BadRequestException('ORDER_SERVICE_BLOCKED'));

    await expect(
      service.submitCart({ uid: 'admin-1', role: 'ADMIN', sub: 'admin_user' }, 'cart-1'),
    ).rejects.toThrow('ORDER_SERVICE_BLOCKED');
  });

  it('uses blackout guard in updateOrder flow', async () => {
    mockedRunSql.mockResolvedValueOnce(
      JSON.stringify({
        id: 'order-4',
        child_id: 'child-4',
        service_date: '2099-01-15',
        session: 'LUNCH',
        status: 'PLACED',
        total_price: '10000',
        dietary_snapshot: '',
      }),
    );
    jest.spyOn(service as any, 'getParentIdByUserId').mockResolvedValue('parent-1');
    jest.spyOn(service as any, 'ensureParentOwnsChild').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'isAfterOrAtMakassarCutoff').mockReturnValue(false);
    jest
      .spyOn(service as any, 'validateOrderDayRules')
      .mockRejectedValue(new BadRequestException('ORDER_SERVICE_BLOCKED'));

    await expect(
      service.updateOrder(
        { uid: 'user-parent', role: 'PARENT', sub: 'parent_user' },
        'order-4',
        {
          serviceDate: '2099-01-15',
          session: 'LUNCH',
          items: [{ menuItemId: 'menu-1', quantity: 1 }],
        },
      ),
    ).rejects.toThrow('ORDER_SERVICE_BLOCKED');
  });

  it('uses blackout guard in quickReorder flow', async () => {
    mockedRunSql.mockResolvedValueOnce(
      JSON.stringify({
        id: 'order-5',
        child_id: 'child-5',
        session: 'LUNCH',
        status: 'PLACED',
      }),
    );
    jest.spyOn(service as any, 'getChildIdByUserId').mockResolvedValue('child-5');
    jest
      .spyOn(service as any, 'createCart')
      .mockRejectedValue(new BadRequestException('ORDER_SERVICE_BLOCKED'));

    await expect(
      service.quickReorder(
        { uid: 'user-youngster', role: 'YOUNGSTER', sub: 'youngster_user' },
        { sourceOrderId: 'order-5', serviceDate: '2099-01-20' },
      ),
    ).rejects.toThrow('ORDER_SERVICE_BLOCKED');
  });
});
