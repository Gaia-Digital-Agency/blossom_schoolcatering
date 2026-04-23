import { BadRequestException } from '@nestjs/common';
import { CoreService } from './core.service';
import { HelpersService } from './services/helpers.service';
import { SchemaService } from './services/schema.service';
import { runSql } from '../auth/db.util';

jest.mock('../auth/db.util', () => ({
  runSql: jest.fn(),
  sqlLiteral: (value: string) => `'${String(value).replace(/'/g, "''")}'`,
}));

const mockedRunSql = runSql as jest.MockedFunction<typeof runSql>;

function attachSubServiceStubs(service: CoreService) {
  // helpers + schema get real instances so sync helpers (calculateTotalPrice,
  // etc.) and spied async helpers (getMakassarNowContext) behave correctly.
  // The remaining sub-services are Proxy stubs whose methods resolve to
  // undefined — enough for flow-control tests that don't exercise their
  // real logic.
  const schema = new SchemaService();
  const helpers = new HelpersService(schema);
  (service as unknown as Record<string, unknown>).schema = schema;
  (service as unknown as Record<string, unknown>).helpers = helpers;
  const subServiceNames = [
    'adminReports', 'audit', 'billing', 'delivery', 'gaia',
    'kitchen', 'media', 'menu', 'multiOrder', 'order',
    'schools', 'siteSettings', 'users',
  ] as const;
  const stub: Record<string, unknown> = new Proxy({}, {
    get: () => jest.fn().mockResolvedValue(undefined),
  });
  for (const name of subServiceNames) {
    (service as unknown as Record<string, unknown>)[name] = stub;
  }
}

describe('CoreService rules, pricing, and badge logic', () => {
  let service: CoreService;

  beforeEach(() => {
    service = new CoreService();
    attachSubServiceStubs(service);
    mockedRunSql.mockReset();
  });

  it('calculates total price with 2-decimal normalization', () => {
    const total = (service as any).calculateTotalPrice([
      { price: '12000', quantity: 2 },
      { price: '5000.255', quantity: 1 },
    ]);
    expect(total).toBe(29000.26);
  });

  it('blocks weekend ordering', async () => {
    mockedRunSql.mockResolvedValueOnce('6');
    await expect((service as any).validateOrderDayRules('2026-03-07')).rejects.toThrow(
      'ORDER_WEEKEND_SERVICE_BLOCKED',
    );
  });

  it('blocks ORDER_BLOCK blackout', async () => {
    mockedRunSql
      .mockResolvedValueOnce('3')
      .mockResolvedValueOnce(JSON.stringify({ blackout_date: '2026-03-18', type: 'ORDER_BLOCK', reason: 'ops' }));
    await expect((service as any).validateOrderDayRules('2026-03-18')).rejects.toThrow(
      'ORDER_BLACKOUT_BLOCKED',
    );
  });

  it('blocks only the targeted session when blackout is session-specific', async () => {
    mockedRunSql
      .mockResolvedValueOnce('3')
      .mockResolvedValueOnce(JSON.stringify({
        blackout_date: '2026-03-18',
        type: 'ORDER_BLOCK',
        reason: 'snack only',
        session: 'SNACK',
      }));
    await expect((service as any).validateOrderDayRules('2026-03-18', 'SNACK')).rejects.toThrow(
      'ORDER_BLACKOUT_BLOCKED',
    );
  });

  it('does not block other sessions when the blackout is for a different session', async () => {
    mockedRunSql
      .mockResolvedValueOnce('3')
      .mockResolvedValueOnce(null);
    await expect((service as any).validateOrderDayRules('2026-03-18', 'LUNCH')).resolves.toBeUndefined();
  });

  it('enforces parent/youngster ordering window', async () => {
    // HelpersService.enforceParentYoungsterOrderingWindow calls its own
    // this.getMakassarNowContext — spy on the helpers instance, not the
    // CoreService delegation stub.
    jest.spyOn((service as any).helpers, 'getMakassarNowContext').mockReturnValue({ dateIso: '2026-03-02', hour: 7, minute: 0 });
    await expect(
      (service as any).enforceParentYoungsterOrderingWindow(
        { uid: 'u', role: 'PARENT', sub: 'x' },
        '2026-03-03',
      ),
    ).rejects.toThrow('ORDERING_AVAILABLE_FROM_0800_WITA');

    jest.spyOn((service as any).helpers, 'getMakassarNowContext').mockReturnValue({ dateIso: '2026-03-02', hour: 9, minute: 0 });
    await expect(
      (service as any).enforceParentYoungsterOrderingWindow(
        { uid: 'u', role: 'YOUNGSTER', sub: 'x' },
        '2026-03-02',
      ),
    ).rejects.toThrow('ORDER_TOMORROW_ONWARDS_ONLY');
  });

  it('computes badge levels from history', () => {
    const bronze = (service as any).resolveBadgeLevel({
      maxConsecutiveOrderDays: 5,
      currentMonthOrders: 2,
      currentMonthConsecutiveWeeks: 1,
      previousMonthOrders: 2,
      previousMonthConsecutiveWeeks: 1,
    });
    expect(bronze.level).toBe('BRONZE');

    const silver = (service as any).resolveBadgeLevel({
      maxConsecutiveOrderDays: 2,
      currentMonthOrders: 10,
      currentMonthConsecutiveWeeks: 2,
      previousMonthOrders: 0,
      previousMonthConsecutiveWeeks: 0,
    });
    expect(silver.level).toBe('SILVER');

    const gold = (service as any).resolveBadgeLevel({
      maxConsecutiveOrderDays: 2,
      currentMonthOrders: 21,
      currentMonthConsecutiveWeeks: 2,
      previousMonthOrders: 1,
      previousMonthConsecutiveWeeks: 1,
    });
    expect(gold.level).toBe('GOLD');

    const platinum = (service as any).resolveBadgeLevel({
      maxConsecutiveOrderDays: 2,
      currentMonthOrders: 12,
      currentMonthConsecutiveWeeks: 2,
      previousMonthOrders: 11,
      previousMonthConsecutiveWeeks: 2,
    });
    expect(platinum.level).toBe('PLATINUM');
  });

  it('rejects invalid UUID values for guarded paths', () => {
    expect(() => (service as any).assertValidUuid('not-a-uuid', 'billingId')).toThrow(BadRequestException);
  });

  it('normalizes multi-order repeat days from mixed labels', () => {
    expect((service as any).normalizeMultiOrderRepeatDays(['mon', 'WEDNESDAY', '5', 'mon'])).toEqual([1, 3, 5]);
  });

  it('classifies immutable multi-order statuses', () => {
    expect((service as any).isImmutableMultiOrderStatus('DELIVERED')).toBe(true);
    expect((service as any).isImmutableMultiOrderStatus('IN_DELIVERY')).toBe(true);
    expect((service as any).isImmutableMultiOrderStatus('PLACED')).toBe(false);
  });

  it('rejects multi-order plans beyond the 3 month horizon', async () => {
    await expect(
      service.createMultiOrder(
        { uid: 'admin-1', role: 'ADMIN', sub: 'admin_user' },
        {
          childId: '11111111-1111-1111-1111-111111111111',
          session: 'LUNCH',
          startDate: '2026-03-01',
          endDate: '2026-07-15',
          repeatDays: ['MONDAY'],
          items: [{ menuItemId: '22222222-2222-2222-2222-222222222222', quantity: 1 }],
        },
      ),
    ).rejects.toThrow('MULTI_ORDER_RANGE_EXCEEDED');
  });
});
