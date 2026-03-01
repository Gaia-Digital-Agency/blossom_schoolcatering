import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  ApplyFavouriteDto,
  AssignDeliveryDto,
  AutoAssignDto,
  CreateBlackoutDayDto,
  CreateCartDto,
  CreateDeliveryUserDto,
  CreateFavouriteDto,
  CreateIngredientDto,
  CreateMenuItemDto,
  CreateMenuRatingDto,
  CreateSchoolDto,
  MealPlanWizardDto,
  NoteDto,
  QuickReorderDto,
  RegisterYoungsterDto,
  ReplaceCartItemsDto,
  ResetPasswordDto,
  SeedMenuDto,
  SeedOrdersDto,
  UpdateDeliveryUserDto,
  UpdateIngredientDto,
  UpdateMenuItemDto,
  UpdateOrderDto,
  UpdateParentDto,
  UpdateSchoolDto,
  UpdateSessionSettingDto,
  UpdateYoungsterDto,
  UploadBillingProofDto,
  UploadBillingProofBatchDto,
  UpsertDeliveryAssignmentDto,
  VerifyBillingDto,
} from './dto';
import { CoreService } from './core.service';
import { AccessUser } from './core.types';

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

  @Post('admin/schools')
  @Roles('ADMIN')
  createSchool(@Req() req: AuthRequest, @Body() body: CreateSchoolDto) {
    return this.coreService.createSchool(req.user, body);
  }

  @Patch('admin/schools/:schoolId')
  @Roles('ADMIN')
  updateSchoolActive(@Req() req: AuthRequest, @Param('schoolId', ParseUUIDPipe) schoolId: string, @Body() body: UpdateSchoolDto) {
    return this.coreService.updateSchoolActive(req.user, schoolId, body.isActive);
  }

  @Delete('admin/schools/:schoolId')
  @Roles('ADMIN')
  deleteSchool(@Req() req: AuthRequest, @Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.coreService.deleteSchool(req.user, schoolId);
  }

  @Get('admin/session-settings')
  @Roles('ADMIN')
  getAdminSessionSettings() {
    return this.coreService.getSessionSettings();
  }

  @Get('session-settings')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN', 'KITCHEN', 'DELIVERY')
  getSessionSettings() {
    return this.coreService.getSessionSettings();
  }

  @Patch('admin/session-settings/:session')
  @Roles('ADMIN')
  updateAdminSessionSetting(
    @Req() req: AuthRequest,
    @Param('session') session: string,
    @Body() body: UpdateSessionSettingDto,
  ) {
    return this.coreService.updateSessionSetting(req.user, session, body.isActive);
  }

  @Post('children/register')
  @Roles('PARENT', 'ADMIN')
  registerYoungster(@Req() req: AuthRequest, @Body() body: RegisterYoungsterDto) {
    return this.coreService.registerYoungster(req.user, body);
  }

  @Get('admin/parents')
  @Roles('ADMIN')
  getAdminParents() {
    return this.coreService.getAdminParents();
  }

  @Patch('admin/parents/:parentId')
  @Roles('ADMIN')
  updateParentProfile(
    @Req() req: AuthRequest,
    @Param('parentId', ParseUUIDPipe) parentId: string,
    @Body() body: UpdateParentDto,
  ) {
    return this.coreService.updateParentProfile(req.user, parentId, body);
  }

  @Delete('admin/parents/:parentId')
  @Roles('ADMIN')
  deleteParent(@Req() req: AuthRequest, @Param('parentId', ParseUUIDPipe) parentId: string) {
    return this.coreService.deleteParent(req.user, parentId);
  }

  @Get('admin/children')
  @Roles('ADMIN')
  getAdminChildren() {
    return this.coreService.getAdminChildren();
  }

  @Patch('admin/youngsters/:youngsterId')
  @Roles('ADMIN')
  updateYoungsterProfile(
    @Req() req: AuthRequest,
    @Param('youngsterId', ParseUUIDPipe) youngsterId: string,
    @Body() body: UpdateYoungsterDto,
  ) {
    return this.coreService.updateYoungsterProfile(req.user, youngsterId, body);
  }

  @Delete('admin/youngsters/:youngsterId')
  @Roles('ADMIN')
  deleteYoungster(@Req() req: AuthRequest, @Param('youngsterId', ParseUUIDPipe) youngsterId: string) {
    return this.coreService.deleteYoungster(req.user, youngsterId);
  }

  @Patch('admin/users/:userId/reset-password')
  @Roles('ADMIN')
  adminResetUserPassword(
    @Req() req: AuthRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: ResetPasswordDto,
  ) {
    return this.coreService.adminResetUserPassword(req.user, userId, body.newPassword);
  }

  @Get('admin/dashboard')
  @Roles('ADMIN')
  getAdminDashboard(@Query('date') date?: string) {
    return this.coreService.getAdminDashboard(date);
  }

  @Get('admin/revenue')
  @Roles('ADMIN')
  getAdminRevenue(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('day') day?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('school_id') schoolId?: string,
    @Query('delivery_user_id') deliveryUserId?: string,
    @Query('parent_id') parentId?: string,
    @Query('session') session?: string,
    @Query('dish') dish?: string,
    @Query('order_status') orderStatus?: string,
    @Query('billing_status') billingStatus?: string,
  ) {
    return this.coreService.getAdminRevenueDashboard({
      fromDateRaw: from,
      toDateRaw: to,
      day,
      month,
      year,
      schoolId,
      deliveryUserId,
      parentId,
      session,
      dish,
      orderStatus,
      billingStatus,
    });
  }

  @Get('admin/reports')
  @Roles('ADMIN')
  getAdminReports(@Query('date') date?: string) {
    return this.coreService.getAdminPrintReport(date);
  }

  @Get('blackout-days')
  @Roles('ADMIN', 'PARENT', 'YOUNGSTER', 'KITCHEN')
  getBlackoutDays(@Query('from_date') fromDate?: string, @Query('to_date') toDate?: string) {
    return this.coreService.getBlackoutDays({ fromDate, toDate });
  }

  @Post('blackout-days')
  @Roles('ADMIN')
  createBlackoutDay(
    @Req() req: AuthRequest,
    @Body() body: CreateBlackoutDayDto,
  ) {
    return this.coreService.createBlackoutDay(req.user, body);
  }

  @Delete('blackout-days/:id')
  @Roles('ADMIN')
  deleteBlackoutDay(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.coreService.deleteBlackoutDay(req.user, id);
  }

  @Get('admin/ingredients')
  @Roles('ADMIN')
  getAdminIngredients() {
    return this.coreService.getAdminIngredients();
  }

  @Post('admin/ingredients')
  @Roles('ADMIN')
  createIngredient(@Req() req: AuthRequest, @Body() body: CreateIngredientDto) {
    return this.coreService.createIngredient(req.user, body);
  }

  @Patch('admin/ingredients/:ingredientId')
  @Roles('ADMIN')
  updateIngredient(
    @Req() req: AuthRequest,
    @Param('ingredientId', ParseUUIDPipe) ingredientId: string,
    @Body() body: UpdateIngredientDto,
  ) {
    return this.coreService.updateIngredient(req.user, ingredientId, body);
  }

  @Delete('admin/ingredients/:ingredientId')
  @Roles('ADMIN')
  deleteIngredient(@Req() req: AuthRequest, @Param('ingredientId', ParseUUIDPipe) ingredientId: string) {
    return this.coreService.deleteIngredient(req.user, ingredientId);
  }

  @Get('admin/menus')
  @Roles('ADMIN')
  getAdminMenus(@Query('service_date') serviceDate?: string, @Query('session') session?: string) {
    return this.coreService.getAdminMenus({ serviceDate, session });
  }

  @Get('admin/menu-ratings')
  @Roles('ADMIN')
  getAdminMenuRatings(@Query('service_date') serviceDate?: string, @Query('session') session?: string) {
    return this.coreService.getAdminMenuRatings({ serviceDate, session });
  }

  @Post('admin/menus/sample-seed')
  @Roles('ADMIN')
  seedAdminMenus(@Body() body: SeedMenuDto) {
    return this.coreService.seedAdminMenuSample(body.serviceDate);
  }

  @Post('admin/orders/sample-seed')
  @Roles('ADMIN')
  seedAdminOrders(@Req() req: AuthRequest, @Body() body: SeedOrdersDto) {
    return this.coreService.seedAdminOrdersSample(req.user, body);
  }

  @Post('admin/menu-items')
  @Roles('ADMIN')
  createAdminMenuItem(@Body() body: CreateMenuItemDto) {
    return this.coreService.createAdminMenuItem(body);
  }

  @Patch('admin/menu-items/:itemId')
  @Roles('ADMIN')
  updateAdminMenuItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: UpdateMenuItemDto,
  ) {
    return this.coreService.updateAdminMenuItem(itemId, body);
  }

  @Post('admin/menu-images/upload')
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 10 * 1024 * 1024 } }))
  uploadMenuImage(@UploadedFile() file: any) {
    return this.coreService.uploadMenuImage(file?.buffer, file?.mimetype);
  }

  @Post('ratings')
  @Roles('PARENT', 'YOUNGSTER')
  createOrUpdateMenuRating(@Req() req: AuthRequest, @Body() body: CreateMenuRatingDto) {
    return this.coreService.createOrUpdateMenuRating(req.user, body);
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

  @Get('youngsters/me/orders/consolidated')
  @Roles('YOUNGSTER')
  getYoungsterConsolidatedOrders(@Req() req: AuthRequest) {
    return this.coreService.getYoungsterConsolidatedOrders(req.user);
  }

  @Get('parents/me/children/pages')
  @Roles('PARENT')
  getParentChildrenPages(@Req() req: AuthRequest) {
    return this.coreService.getParentChildrenPages(req.user);
  }

  @Post('parents/:parentId/children/:childId/link')
  @Roles('PARENT', 'ADMIN')
  linkParentChild(@Req() req: AuthRequest, @Param('parentId', ParseUUIDPipe) parentId: string, @Param('childId', ParseUUIDPipe) childId: string) {
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
    @Body() body: CreateFavouriteDto,
  ) {
    return this.coreService.createFavourite(req.user, body);
  }

  @Delete('favourites/:favouriteId')
  @Roles('PARENT', 'YOUNGSTER')
  deleteFavourite(@Req() req: AuthRequest, @Param('favouriteId', ParseUUIDPipe) favouriteId: string) {
    return this.coreService.deleteFavourite(req.user, favouriteId);
  }

  @Post('carts/quick-reorder')
  @Roles('PARENT', 'YOUNGSTER')
  quickReorder(@Req() req: AuthRequest, @Body() body: QuickReorderDto) {
    return this.coreService.quickReorder(req.user, body);
  }

  @Post('meal-plans/wizard')
  @Roles('PARENT', 'YOUNGSTER')
  mealPlanWizard(
    @Req() req: AuthRequest,
    @Body() body: MealPlanWizardDto,
  ) {
    return this.coreService.mealPlanWizard(req.user, body);
  }

  @Post('favourites/:favouriteId/apply')
  @Roles('PARENT', 'YOUNGSTER')
  applyFavouriteToCart(
    @Req() req: AuthRequest,
    @Param('favouriteId', ParseUUIDPipe) favouriteId: string,
    @Body() body: ApplyFavouriteDto,
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
    @Param('billingId', ParseUUIDPipe) billingId: string,
    @Body() body: UploadBillingProofDto,
  ) {
    return this.coreService.uploadBillingProof(req.user, billingId, body.proofImageData);
  }

  @Post('billing/proof-upload-batch')
  @Roles('PARENT')
  uploadBillingProofBatch(
    @Req() req: AuthRequest,
    @Body() body: UploadBillingProofBatchDto,
  ) {
    return this.coreService.uploadBillingProofBatch(req.user, body.billingIds, body.proofImageData);
  }

  @Get('billing/:billingId/receipt')
  @Roles('PARENT', 'ADMIN')
  getBillingReceipt(@Req() req: AuthRequest, @Param('billingId', ParseUUIDPipe) billingId: string) {
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
    @Param('billingId', ParseUUIDPipe) billingId: string,
    @Body() body: VerifyBillingDto,
  ) {
    return this.coreService.verifyBilling(req.user, billingId, body.decision || 'VERIFIED');
  }

  @Delete('admin/menu-items/:itemId')
  @Roles('ADMIN')
  deleteAdminMenuItem(@Req() req: AuthRequest, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.coreService.deleteMenuItem(req.user, itemId);
  }

  @Post('admin/billing/:billingId/receipt')
  @Roles('ADMIN')
  generateBillingReceipt(@Req() req: AuthRequest, @Param('billingId', ParseUUIDPipe) billingId: string) {
    return this.coreService.generateReceipt(req.user, billingId);
  }

  @Get('delivery/users')
  @Roles('ADMIN')
  getDeliveryUsers(@Query('include_inactive') includeInactive?: string) {
    return this.coreService.getDeliveryUsers(includeInactive === 'true');
  }

  @Post('admin/delivery/users')
  @Roles('ADMIN')
  createDeliveryUser(
    @Req() req: AuthRequest,
    @Body() body: CreateDeliveryUserDto,
  ) {
    return this.coreService.createDeliveryUser(req.user, body);
  }

  @Patch('admin/delivery/users/:userId/deactivate')
  @Roles('ADMIN')
  deactivateDeliveryUser(@Req() req: AuthRequest, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.coreService.deactivateDeliveryUser(req.user, userId);
  }

  @Patch('admin/delivery/users/:userId')
  @Roles('ADMIN')
  updateDeliveryUser(
    @Req() req: AuthRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: UpdateDeliveryUserDto,
  ) {
    return this.coreService.updateDeliveryUser(req.user, userId, body);
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
    @Body() body: UpsertDeliveryAssignmentDto,
  ) {
    return this.coreService.upsertDeliverySchoolAssignment(req.user, body);
  }

  @Post('delivery/auto-assign')
  @Roles('ADMIN')
  autoAssignDelivery(@Req() req: AuthRequest, @Body() body: AutoAssignDto) {
    return this.coreService.autoAssignDeliveries(req.user, body.date);
  }

  @Post('delivery/assign')
  @Roles('ADMIN')
  assignDelivery(
    @Req() req: AuthRequest,
    @Body() body: AssignDeliveryDto,
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
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() body: NoteDto,
  ) {
    return this.coreService.confirmDelivery(req.user, assignmentId, body.note);
  }

  @Patch('delivery/assignments/:assignmentId/toggle')
  @Roles('DELIVERY')
  toggleDeliveryCompletion(
    @Req() req: AuthRequest,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() body: NoteDto,
  ) {
    return this.coreService.toggleDeliveryCompletion(req.user, assignmentId, body.note);
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
  createCart(@Req() req: AuthRequest, @Body() body: CreateCartDto) {
    return this.coreService.createCart(req.user, body);
  }

  @Get('carts/:cartId')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  getCartById(@Req() req: AuthRequest, @Param('cartId', ParseUUIDPipe) cartId: string) {
    return this.coreService.getCartById(req.user, cartId);
  }

  @Patch('carts/:cartId/items')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  replaceCartItems(@Req() req: AuthRequest, @Param('cartId', ParseUUIDPipe) cartId: string, @Body() body: ReplaceCartItemsDto) {
    return this.coreService.replaceCartItems(req.user, cartId, body.items || []);
  }

  @Delete('carts/:cartId')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  discardCart(@Req() req: AuthRequest, @Param('cartId', ParseUUIDPipe) cartId: string) {
    return this.coreService.discardCart(req.user, cartId);
  }

  @Post('carts/:cartId/submit')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  submitCart(@Req() req: AuthRequest, @Param('cartId', ParseUUIDPipe) cartId: string) {
    return this.coreService.submitCart(req.user, cartId);
  }

  @Get('orders/:orderId')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  getOrderDetail(@Req() req: AuthRequest, @Param('orderId', ParseUUIDPipe) orderId: string) {
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
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() body: UpdateOrderDto,
  ) {
    return this.coreService.updateOrder(req.user, orderId, body);
  }

  @Delete('orders/:orderId')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  deleteOrder(@Req() req: AuthRequest, @Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.coreService.deleteOrder(req.user, orderId);
  }

  @Get('kitchen/daily-summary')
  @Roles('KITCHEN', 'ADMIN')
  getKitchenDailySummary(@Req() req: AuthRequest, @Query('date') date?: string) {
    return this.coreService.getKitchenDailySummary(req.user, date);
  }

  @Post('kitchen/orders/:orderId/complete')
  @Roles('KITCHEN', 'ADMIN')
  markKitchenOrderComplete(@Req() req: AuthRequest, @Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.coreService.markKitchenOrderComplete(req.user, orderId);
  }

}
