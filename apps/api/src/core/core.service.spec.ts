import { CoreService } from './core.service';
import { runSql } from '../auth/db.util';

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
});
