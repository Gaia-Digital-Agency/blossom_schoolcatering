import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CoreService } from './core.service';
import { AccessUser, CartItemInput } from './core.types';

type AuthRequest = Request & { user: AccessUser };

@Controller('api/v1')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CoreController {
  constructor(private readonly coreService: CoreService) {}

  @Get('schools')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN', 'KITCHEN', 'DELIVERY')
  getSchools(@Query('active') active?: string) {
    return this.coreService.getSchools(active !== 'false');
  }

  @Patch('admin/schools/:schoolId')
  @Roles('ADMIN')
  updateSchoolActive(@Req() req: AuthRequest, @Param('schoolId') schoolId: string, @Body() body: { isActive?: boolean }) {
    return this.coreService.updateSchoolActive(req.user, schoolId, body.isActive);
  }

  @Get('admin/session-settings')
  @Roles('ADMIN')
  getAdminSessionSettings() {
    return this.coreService.getSessionSettings();
  }

  @Patch('admin/session-settings/:session')
  @Roles('ADMIN')
  updateAdminSessionSetting(
    @Req() req: AuthRequest,
    @Param('session') session: string,
    @Body() body: { isActive?: boolean },
  ) {
    return this.coreService.updateSessionSetting(req.user, session, body.isActive);
  }

  @Post('children/register')
  @Roles('PARENT', 'ADMIN')
  registerYoungster(@Req() req: AuthRequest, @Body() body: Record<string, string>) {
    return this.coreService.registerYoungster(req.user, {
      firstName: body.firstName,
      lastName: body.lastName,
      phoneNumber: body.phoneNumber,
      email: body.email,
      dateOfBirth: body.dateOfBirth,
      gender: body.gender,
      schoolId: body.schoolId,
      schoolGrade: body.schoolGrade,
      parentId: body.parentId,
      allergies: body.allergies,
    });
  }

  @Get('admin/parents')
  @Roles('ADMIN')
  getAdminParents() {
    return this.coreService.getAdminParents();
  }

  @Get('admin/children')
  @Roles('ADMIN')
  getAdminChildren() {
    return this.coreService.getAdminChildren();
  }

  @Get('admin/dashboard')
  @Roles('ADMIN')
  getAdminDashboard(@Query('date') date?: string) {
    return this.coreService.getAdminDashboard(date);
  }

  @Get('admin/revenue')
  @Roles('ADMIN')
  getAdminRevenue(@Query('from') from?: string, @Query('to') to?: string) {
    return this.coreService.getAdminRevenueDashboard(from, to);
  }

  @Get('admin/reports')
  @Roles('ADMIN')
  getAdminReports(@Query('date') date?: string) {
    return this.coreService.getAdminPrintReport(date);
  }

  @Get('blackout-days')
  @Roles('ADMIN', 'PARENT', 'KITCHEN')
  getBlackoutDays(@Query('from_date') fromDate?: string, @Query('to_date') toDate?: string) {
    return this.coreService.getBlackoutDays({ fromDate, toDate });
  }

  @Post('blackout-days')
  @Roles('ADMIN')
  createBlackoutDay(
    @Req() req: AuthRequest,
    @Body() body: { blackoutDate?: string; blackout_date?: string; type?: string; reason?: string },
  ) {
    return this.coreService.createBlackoutDay(req.user, {
      blackoutDate: body.blackoutDate ?? body.blackout_date,
      type: body.type,
      reason: body.reason,
    });
  }

  @Delete('blackout-days/:id')
  @Roles('ADMIN')
  deleteBlackoutDay(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.coreService.deleteBlackoutDay(req.user, id);
  }

  @Get('admin/ingredients')
  @Roles('ADMIN')
  getAdminIngredients() {
    return this.coreService.getAdminIngredients();
  }

  @Get('admin/menus')
  @Roles('ADMIN')
  getAdminMenus(@Query('service_date') serviceDate?: string, @Query('session') session?: string) {
    return this.coreService.getAdminMenus({ serviceDate, session });
  }

  @Post('admin/menus/sample-seed')
  @Roles('ADMIN')
  seedAdminMenus(@Body() body: { serviceDate?: string }) {
    return this.coreService.seedAdminMenuSample(body.serviceDate);
  }

  @Post('admin/menu-items')
  @Roles('ADMIN')
  createAdminMenuItem(@Body() body: {
    serviceDate?: string;
    session?: string;
    name?: string;
    description?: string;
    nutritionFactsText?: string;
    caloriesKcal?: number;
    price?: number;
    imageUrl?: string;
    ingredientIds?: string[];
    isAvailable?: boolean;
    displayOrder?: number;
    cutleryRequired?: boolean;
    packingRequirement?: string;
  }) {
    return this.coreService.createAdminMenuItem(body);
  }

  @Patch('admin/menu-items/:itemId')
  @Roles('ADMIN')
  updateAdminMenuItem(
    @Param('itemId') itemId: string,
    @Body() body: {
      serviceDate?: string;
      session?: string;
      name?: string;
      description?: string;
      nutritionFactsText?: string;
      caloriesKcal?: number;
      price?: number;
      imageUrl?: string;
      ingredientIds?: string[];
      isAvailable?: boolean;
      displayOrder?: number;
      cutleryRequired?: boolean;
      packingRequirement?: string;
    },
  ) {
    return this.coreService.updateAdminMenuItem(itemId, body);
  }

  @Get('children/me')
  @Roles('YOUNGSTER')
  getYoungsterMe(@Req() req: AuthRequest) {
    return this.coreService.getYoungsterMe(req.user);
  }

  @Get('youngsters/me/insights')
  @Roles('YOUNGSTER')
  getYoungsterInsights(@Req() req: AuthRequest, @Query('date') date?: string) {
    return this.coreService.getYoungsterInsights(req.user, date);
  }

  @Get('parents/me/children/pages')
  @Roles('PARENT')
  getParentChildrenPages(@Req() req: AuthRequest) {
    return this.coreService.getParentChildrenPages(req.user);
  }

  @Post('parents/:parentId/children/:childId/link')
  @Roles('PARENT', 'ADMIN')
  linkParentChild(@Req() req: AuthRequest, @Param('parentId') parentId: string, @Param('childId') childId: string) {
    return this.coreService.linkParentChild(req.user, parentId, childId);
  }

  @Get('menus')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN', 'KITCHEN')
  getMenus(
    @Req() req: AuthRequest,
    @Query('service_date') serviceDate?: string,
    @Query('session') session?: string,
    @Query('search') search?: string,
    @Query('price_min') priceMin?: string,
    @Query('price_max') priceMax?: string,
    @Query('allergen_exclude') allergenExclude?: string,
    @Query('favourites_only') favouritesOnly?: string,
  ) {
    return this.coreService.getMenus(req.user, {
      serviceDate,
      session,
      search,
      priceMin,
      priceMax,
      allergenExclude,
      favouritesOnly,
    });
  }

  @Get('favourites')
  @Roles('PARENT', 'YOUNGSTER')
  getFavourites(@Req() req: AuthRequest, @Query('child_id') childId?: string, @Query('session') session?: string) {
    return this.coreService.getFavourites(req.user, { childId, session });
  }

  @Post('favourites')
  @Roles('PARENT', 'YOUNGSTER')
  createFavourite(
    @Req() req: AuthRequest,
    @Body() body: { childId?: string; label?: string; session?: string; items?: CartItemInput[] },
  ) {
    return this.coreService.createFavourite(req.user, body);
  }

  @Post('carts/quick-reorder')
  @Roles('PARENT', 'YOUNGSTER')
  quickReorder(@Req() req: AuthRequest, @Body() body: { sourceOrderId?: string; serviceDate?: string }) {
    return this.coreService.quickReorder(req.user, body);
  }

  @Post('meal-plans/wizard')
  @Roles('PARENT', 'YOUNGSTER')
  mealPlanWizard(
    @Req() req: AuthRequest,
    @Body() body: { childId?: string; sourceOrderId?: string; dates?: string[] },
  ) {
    return this.coreService.mealPlanWizard(req.user, body);
  }

  @Post('favourites/:favouriteId/apply')
  @Roles('PARENT', 'YOUNGSTER')
  applyFavouriteToCart(
    @Req() req: AuthRequest,
    @Param('favouriteId') favouriteId: string,
    @Body() body: { serviceDate?: string },
  ) {
    return this.coreService.applyFavouriteToCart(req.user, { favouriteId, serviceDate: body.serviceDate });
  }

  @Get('billing/parent/consolidated')
  @Roles('PARENT')
  getParentConsolidatedBilling(@Req() req: AuthRequest) {
    return this.coreService.getParentConsolidatedBilling(req.user);
  }

  @Post('billing/:billingId/proof-upload')
  @Roles('PARENT')
  uploadBillingProof(
    @Req() req: AuthRequest,
    @Param('billingId') billingId: string,
    @Body() body: { proofImageData?: string },
  ) {
    return this.coreService.uploadBillingProof(req.user, billingId, body.proofImageData);
  }

  @Get('billing/:billingId/receipt')
  @Roles('PARENT', 'ADMIN')
  getBillingReceipt(@Req() req: AuthRequest, @Param('billingId') billingId: string) {
    return this.coreService.getBillingReceipt(req.user, billingId);
  }

  @Get('admin/billing')
  @Roles('ADMIN')
  getAdminBilling(@Query('status') status?: string) {
    return this.coreService.getAdminBilling(status);
  }

  @Post('admin/billing/:billingId/verify')
  @Roles('ADMIN')
  verifyBilling(
    @Req() req: AuthRequest,
    @Param('billingId') billingId: string,
    @Body() body: { decision?: 'VERIFIED' | 'REJECTED' },
  ) {
    return this.coreService.verifyBilling(req.user, billingId, body.decision || 'VERIFIED');
  }

  @Post('admin/billing/:billingId/receipt')
  @Roles('ADMIN')
  generateBillingReceipt(@Req() req: AuthRequest, @Param('billingId') billingId: string) {
    return this.coreService.generateReceipt(req.user, billingId);
  }

  @Get('delivery/users')
  @Roles('ADMIN')
  getDeliveryUsers() {
    return this.coreService.getDeliveryUsers();
  }

  @Get('delivery/school-assignments')
  @Roles('ADMIN')
  getDeliverySchoolAssignments() {
    return this.coreService.getDeliverySchoolAssignments();
  }

  @Post('delivery/school-assignments')
  @Roles('ADMIN')
  upsertDeliverySchoolAssignment(
    @Req() req: AuthRequest,
    @Body() body: { deliveryUserId?: string; schoolId?: string; isActive?: boolean },
  ) {
    return this.coreService.upsertDeliverySchoolAssignment(req.user, body);
  }

  @Post('delivery/auto-assign')
  @Roles('ADMIN')
  autoAssignDelivery(@Req() req: AuthRequest, @Body() body: { date?: string }) {
    return this.coreService.autoAssignDeliveries(req.user, body.date);
  }

  @Post('delivery/assign')
  @Roles('ADMIN')
  assignDelivery(
    @Req() req: AuthRequest,
    @Body() body: { orderIds?: string[]; deliveryUserId?: string },
  ) {
    return this.coreService.assignDelivery(req.user, body);
  }

  @Get('delivery/assignments')
  @Roles('ADMIN', 'DELIVERY')
  getDeliveryAssignments(@Req() req: AuthRequest, @Query('date') date?: string) {
    return this.coreService.getDeliveryAssignments(req.user, date);
  }

  @Post('delivery/assignments/:assignmentId/confirm')
  @Roles('DELIVERY')
  confirmDelivery(
    @Req() req: AuthRequest,
    @Param('assignmentId') assignmentId: string,
    @Body() body: { note?: string },
  ) {
    return this.coreService.confirmDelivery(req.user, assignmentId, body.note);
  }

  @Get('carts')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  getCarts(
    @Req() req: AuthRequest,
    @Query('child_id') childId?: string,
    @Query('service_date') serviceDate?: string,
    @Query('session') session?: string,
  ) {
    return this.coreService.getCarts(req.user, { childId, serviceDate, session });
  }

  @Post('carts')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  createCart(@Req() req: AuthRequest, @Body() body: Record<string, string>) {
    return this.coreService.createCart(req.user, {
      childId: body.childId,
      serviceDate: body.serviceDate,
      session: body.session,
    });
  }

  @Get('carts/:cartId')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  getCartById(@Req() req: AuthRequest, @Param('cartId') cartId: string) {
    return this.coreService.getCartById(req.user, cartId);
  }

  @Patch('carts/:cartId/items')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  replaceCartItems(@Req() req: AuthRequest, @Param('cartId') cartId: string, @Body() body: { items?: CartItemInput[] }) {
    return this.coreService.replaceCartItems(req.user, cartId, body.items || []);
  }

  @Delete('carts/:cartId')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  discardCart(@Req() req: AuthRequest, @Param('cartId') cartId: string) {
    return this.coreService.discardCart(req.user, cartId);
  }

  @Post('carts/:cartId/submit')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  submitCart(@Req() req: AuthRequest, @Param('cartId') cartId: string) {
    return this.coreService.submitCart(req.user, cartId);
  }

  @Get('orders/:orderId')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  getOrderDetail(@Req() req: AuthRequest, @Param('orderId') orderId: string) {
    return this.coreService.getOrderDetail(req.user, orderId);
  }

  @Get('parents/me/orders/consolidated')
  @Roles('PARENT')
  getParentConsolidatedOrders(@Req() req: AuthRequest) {
    return this.coreService.getParentConsolidatedOrders(req.user);
  }

  @Get('parents/me/spending-dashboard')
  @Roles('PARENT')
  getParentSpendingDashboard(@Req() req: AuthRequest, @Query('month') month?: string) {
    return this.coreService.getParentSpendingDashboard(req.user, month);
  }

  @Patch('orders/:orderId')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  updateOrder(
    @Req() req: AuthRequest,
    @Param('orderId') orderId: string,
    @Body() body: { serviceDate?: string; session?: string; items?: CartItemInput[] },
  ) {
    return this.coreService.updateOrder(req.user, orderId, body);
  }

  @Delete('orders/:orderId')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  deleteOrder(@Req() req: AuthRequest, @Param('orderId') orderId: string) {
    return this.coreService.deleteOrder(req.user, orderId);
  }

  @Get('kitchen/daily-summary')
  @Roles('KITCHEN', 'ADMIN')
  getKitchenDailySummary(@Req() req: AuthRequest, @Query('date') date?: string) {
    return this.coreService.getKitchenDailySummary(req.user, date);
  }
}
