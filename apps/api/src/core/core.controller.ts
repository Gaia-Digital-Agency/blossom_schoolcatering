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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import type { Response } from 'express';
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
  CreateMultiOrderDto,
  CreateMultiOrderReplacementDto,
  CreateMultiOrderRequestDto,
  CreateSchoolDto,
  MealPlanWizardDto,
  NoteDto,
  QuickOrderDto,
  QuickReorderDto,
  RegisterYoungsterDto,
  ReplaceCartItemsDto,
  ResolveMultiOrderRequestDto,
  ResetPasswordDto,
  SeedMenuDto,
  SeedOrdersDto,
  UpdateMultiOrderDto,
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
  UploadMultiOrderBillingProofDto,
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
  updateSchool(@Req() req: AuthRequest, @Param('schoolId', ParseUUIDPipe) schoolId: string, @Body() body: UpdateSchoolDto) {
    return this.coreService.updateSchool(req.user, schoolId, body);
  }

  @Delete('admin/schools/:schoolId')
  @Roles('ADMIN')
  deleteSchool(@Req() req: AuthRequest, @Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.coreService.deleteSchool(req.user, schoolId);
  }

  @Get('admin/site-settings')
  @Roles('ADMIN')
  getAdminSiteSettings() {
    return this.coreService.getSiteSettings();
  }

  @Patch('admin/site-settings')
  @Roles('ADMIN')
  updateAdminSiteSettings(
    @Req() req: AuthRequest,
    @Body() body: {
      chef_message?: string;
      hero_image_url?: string;
      hero_image_caption?: string;
      ordering_cutoff_time?: string;
      assistance_message?: string;
      multiorder_future_enabled?: boolean;
      ai_future_enabled?: boolean;
    },
  ) {
    return this.coreService.updateSiteSettings(req.user, body);
  }

  @Post('ai/future/query')
  @Roles('PARENT', 'YOUNGSTER')
  queryGaia(@Req() req: AuthRequest, @Body() body: { question?: string }) {
    return this.coreService.queryGaia(req.user, body);
  }

  @Post('order/quick')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  quickOrder(@Req() req: AuthRequest, @Body() body: QuickOrderDto) {
    return this.coreService.quickOrder(req.user, body);
  }

  @Post('admin/site-settings/hero-image-upload')
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadSiteHeroImage(@UploadedFile() file: any) {
    return this.coreService.uploadSiteHeroImage(file?.buffer, file?.mimetype);
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

  @Post('child/register')
  @Roles('PARENT', 'ADMIN')
  registerYoungsterSingular(@Req() req: AuthRequest, @Body() body: RegisterYoungsterDto) {
    return this.coreService.registerYoungster(req.user, body);
  }

  @Get('admin/parents')
  @Roles('ADMIN')
  getAdminParents() {
    return this.coreService.getAdminParents();
  }

  @Get('admin/parent')
  @Roles('ADMIN')
  getAdminParentsSingular() {
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

  @Patch('admin/parent/:parentId')
  @Roles('ADMIN')
  updateParentProfileSingular(
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

  @Delete('admin/parent/:parentId')
  @Roles('ADMIN')
  deleteParentSingular(@Req() req: AuthRequest, @Param('parentId', ParseUUIDPipe) parentId: string) {
    return this.coreService.deleteParent(req.user, parentId);
  }

  @Get('admin/children')
  @Roles('ADMIN')
  getAdminChildren() {
    return this.coreService.getAdminChildren();
  }

  @Get('admin/youngster')
  @Roles('ADMIN')
  getAdminChildrenSingular() {
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

  @Patch('admin/youngster/:youngsterId')
  @Roles('ADMIN')
  updateYoungsterProfileSingular(
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

  @Delete('admin/youngster/:youngsterId')
  @Roles('ADMIN')
  deleteYoungsterSingular(@Req() req: AuthRequest, @Param('youngsterId', ParseUUIDPipe) youngsterId: string) {
    return this.coreService.deleteYoungster(req.user, youngsterId);
  }

  @Get('admin/users/:userId/password')
  @Roles('ADMIN')
  adminGetUserPassword(
    @Req() req: AuthRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.coreService.adminGetUserPassword(req.user, userId);
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

  @Patch('admin/youngsters/:youngsterId/reset-password')
  @Roles('ADMIN')
  adminResetYoungsterPassword(
    @Req() req: AuthRequest,
    @Param('youngsterId', ParseUUIDPipe) youngsterId: string,
    @Body() body: ResetPasswordDto,
  ) {
    return this.coreService.adminResetYoungsterPassword(req.user, youngsterId, body.newPassword);
  }

  @Get('admin/youngsters/:youngsterId/password')
  @Roles('ADMIN')
  adminGetYoungsterPassword(
    @Req() req: AuthRequest,
    @Param('youngsterId', ParseUUIDPipe) youngsterId: string,
  ) {
    return this.coreService.adminGetYoungsterPassword(req.user, youngsterId);
  }

  @Patch('admin/youngster/:youngsterId/reset-password')
  @Roles('ADMIN')
  adminResetYoungsterPasswordSingular(
    @Req() req: AuthRequest,
    @Param('youngsterId', ParseUUIDPipe) youngsterId: string,
    @Body() body: ResetPasswordDto,
  ) {
    return this.coreService.adminResetYoungsterPassword(req.user, youngsterId, body.newPassword);
  }

  @Get('admin/youngster/:youngsterId/password')
  @Roles('ADMIN')
  adminGetYoungsterPasswordSingular(
    @Req() req: AuthRequest,
    @Param('youngsterId', ParseUUIDPipe) youngsterId: string,
  ) {
    return this.coreService.adminGetYoungsterPassword(req.user, youngsterId);
  }

  @Get('admin/dashboard')
  @Roles('ADMIN')
  getAdminDashboard(@Query('date') date?: string) {
    return this.coreService.getAdminDashboard(date);
  }

  @Get('admin/orders')
  @Roles('ADMIN')
  getAdminOrders(
    @Req() req: AuthRequest,
    @Query('date') date?: string,
    @Query('school_id') schoolId?: string,
    @Query('delivery_user_id') deliveryUserId?: string,
    @Query('session') session?: string,
  ) {
    return this.coreService.getAdminOrders(req.user, {
      dateRaw: date,
      schoolId,
      deliveryUserId,
      session,
    });
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

  // GET admin/reports and GET admin/audit-logs moved to archived.controller.ts

  @Get('blackout-days')
  @Roles('ADMIN', 'PARENT', 'YOUNGSTER', 'KITCHEN')
  getBlackoutDays(
    @Query('from_date') fromDate?: string,
    @Query('to_date') toDate?: string,
    @Query('session') session?: string,
  ) {
    return this.coreService.getBlackoutDays({ fromDate, toDate, session });
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
  createAdminMenuItem(@Req() req: AuthRequest, @Body() body: CreateMenuItemDto) {
    return this.coreService.createAdminMenuItem(req.user, body);
  }

  @Patch('admin/menu-items/:itemId')
  @Roles('ADMIN')
  updateAdminMenuItem(
    @Req() req: AuthRequest,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: UpdateMenuItemDto,
  ) {
    return this.coreService.updateAdminMenuItem(req.user, itemId, body);
  }

  @Post('admin/menu-images/upload')
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 5 * 1024 * 1024 } }))
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

  @Get('youngster/me/insights')
  @Roles('YOUNGSTER')
  getYoungsterInsightsSingular(@Req() req: AuthRequest, @Query('date') date?: string) {
    return this.coreService.getYoungsterInsights(req.user, date);
  }

  @Get('youngsters/me/orders/consolidated')
  @Roles('YOUNGSTER')
  getYoungsterConsolidatedOrders(@Req() req: AuthRequest) {
    return this.coreService.getYoungsterConsolidatedOrders(req.user);
  }

  @Get('youngster/me/orders/consolidated')
  @Roles('YOUNGSTER')
  getYoungsterConsolidatedOrdersSingular(@Req() req: AuthRequest) {
    return this.coreService.getYoungsterConsolidatedOrders(req.user);
  }

  @Get('parents/me/children/pages')
  @Roles('PARENT')
  getParentChildrenPages(@Req() req: AuthRequest) {
    return this.coreService.getParentChildrenPages(req.user);
  }

  @Get('parent/me/children/pages')
  @Roles('PARENT')
  getParentChildrenPagesSingular(@Req() req: AuthRequest) {
    return this.coreService.getParentChildrenPages(req.user);
  }

  @Get('youngster/me/children/pages')
  @Roles('YOUNGSTER')
  getYoungsterChildrenPages(@Req() req: AuthRequest) {
    return this.coreService.getYoungsterChildrenPages(req.user);
  }

  @Get('student/me/children/pages')
  @Roles('YOUNGSTER')
  getYoungsterChildrenPagesStudentAlias(@Req() req: AuthRequest) {
    return this.coreService.getYoungsterChildrenPages(req.user);
  }

  @Post('parents/:parentId/children/:childId/link')
  @Roles('PARENT', 'ADMIN')
  linkParentChild(@Req() req: AuthRequest, @Param('parentId', ParseUUIDPipe) parentId: string, @Param('childId', ParseUUIDPipe) childId: string) {
    return this.coreService.linkParentChild(req.user, parentId, childId);
  }

  @Post('parent/:parentId/children/:childId/link')
  @Roles('PARENT', 'ADMIN')
  linkParentChildSingular(@Req() req: AuthRequest, @Param('parentId', ParseUUIDPipe) parentId: string, @Param('childId', ParseUUIDPipe) childId: string) {
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

  // POST meal-plans/wizard moved to archived.controller.ts

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
  getParentConsolidatedBilling(@Req() req: AuthRequest, @Query('session') session?: string) {
    return this.coreService.getParentConsolidatedBilling(req.user, session);
  }

  @Get('billing/youngster/consolidated')
  @Roles('YOUNGSTER')
  getYoungsterConsolidatedBilling(@Req() req: AuthRequest, @Query('session') session?: string) {
    return this.coreService.getYoungsterConsolidatedBilling(req.user, session);
  }

  @Get('billing/student/consolidated')
  @Roles('YOUNGSTER')
  getStudentConsolidatedBilling(@Req() req: AuthRequest, @Query('session') session?: string) {
    return this.coreService.getYoungsterConsolidatedBilling(req.user, session);
  }

  // POST billing/:billingId/proof-upload moved to archived.controller.ts

  @Post('billing/proof-upload-batch')
  @Roles('PARENT', 'YOUNGSTER')
  uploadBillingProofBatch(
    @Req() req: AuthRequest,
    @Body() body: UploadBillingProofBatchDto,
  ) {
    return this.coreService.uploadBillingProofBatch(req.user, body.billingIds, body.proofImageData);
  }

  @Get('billing/:billingId/proof-image')
  @Roles('PARENT', 'YOUNGSTER')
  async getParentBillingProofImage(
    @Req() req: AuthRequest,
    @Param('billingId', ParseUUIDPipe) billingId: string,
    @Res() res: Response,
  ) {
    const out = await this.coreService.getBillingProofImage(req.user, billingId);
    res.setHeader('Content-Type', out.contentType);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(out.data);
  }

  @Get('billing/:billingId/receipt')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  getBillingReceipt(@Req() req: AuthRequest, @Param('billingId', ParseUUIDPipe) billingId: string) {
    return this.coreService.getBillingReceipt(req.user, billingId);
  }

  @Post('billing/:billingId/revert-proof')
  @Roles('PARENT', 'YOUNGSTER')
  revertBillingProof(@Req() req: AuthRequest, @Param('billingId', ParseUUIDPipe) billingId: string) {
    return this.coreService.revertBillingProof(req.user, billingId);
  }

  @Get('admin/billing')
  @Roles('ADMIN')
  getAdminBilling(@Query('status') status?: string, @Query('session') session?: string) {
    return this.coreService.getAdminBilling(status, session);
  }

  @Get('admin/billing/:billingId/proof-image')
  @Roles('ADMIN')
  async getAdminBillingProofImage(
    @Req() req: AuthRequest,
    @Param('billingId', ParseUUIDPipe) billingId: string,
    @Res() res: Response,
  ) {
    const out = await this.coreService.getBillingProofImage(req.user, billingId);
    res.setHeader('Content-Type', out.contentType);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(out.data);
  }

  @Post('admin/billing/:billingId/verify')
  @Roles('ADMIN')
  verifyBilling(
    @Req() req: AuthRequest,
    @Param('billingId', ParseUUIDPipe) billingId: string,
    @Body() body: VerifyBillingDto,
  ) {
    return this.coreService.verifyBilling(req.user, billingId, body.decision || 'VERIFIED', body.note);
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

  @Delete('admin/billing/:billingId')
  @Roles('ADMIN')
  deleteAdminBilling(@Req() req: AuthRequest, @Param('billingId', ParseUUIDPipe) billingId: string) {
    return this.coreService.deleteBilling(req.user, billingId);
  }

  @Get('admin/billing/:billingId/receipt-file')
  @Roles('ADMIN')
  async getAdminBillingReceiptFile(
    @Req() req: AuthRequest,
    @Param('billingId', ParseUUIDPipe) billingId: string,
    @Res() res: Response,
  ) {
    const out = await this.coreService.getBillingReceiptFile(req.user, billingId);
    res.setHeader('Content-Type', out.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${out.fileName}"`);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(out.data);
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

  @Delete('admin/delivery/users/:userId')
  @Roles('ADMIN')
  deleteDeliveryUser(@Req() req: AuthRequest, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.coreService.deleteDeliveryUser(req.user, userId);
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

  @Delete('delivery/school-assignments/:deliveryUserId/:schoolId')
  @Roles('ADMIN')
  deleteDeliverySchoolAssignment(
    @Req() req: AuthRequest,
    @Param('deliveryUserId', ParseUUIDPipe) deliveryUserId: string,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query('session') session?: string,
  ) {
    return this.coreService.deleteDeliverySchoolAssignment(req.user, deliveryUserId, schoolId, session);
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

  @Get('delivery/daily-note')
  @Roles('ADMIN', 'DELIVERY')
  getDeliveryDailyNote(@Req() req: AuthRequest, @Query('date') date?: string) {
    return this.coreService.getDeliveryDailyNote(req.user, date);
  }

  @Patch('delivery/daily-note')
  @Roles('DELIVERY')
  updateDeliveryDailyNote(@Req() req: AuthRequest, @Query('date') date: string, @Body() body: NoteDto) {
    return this.coreService.updateDeliveryDailyNote(req.user, date, body.note);
  }

  @Post('admin/whatsapp/order-notifications/run-daily')
  @Roles('ADMIN')
  getDailyWhatsappOrderNotifications(@Req() req: AuthRequest) {
    return this.coreService.getDailyWhatsappOrderNotifications(req.user);
  }

  @Post('admin/whatsapp/order-notifications/run')
  @Roles('ADMIN')
  runWhatsappOrderNotificationsForDate(@Req() req: AuthRequest, @Body() body: { date?: string }) {
    return this.coreService.getDailyWhatsappOrderNotifications(req.user, body?.date);
  }

  @Post('admin/whatsapp/order-notifications/:orderId/mark-sent')
  @Roles('ADMIN')
  markWhatsappOrderNotificationSent(
    @Req() req: AuthRequest,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() body: {
      sentTo?: string;
      targetSource?: 'STUDENT' | 'PARENT';
      sentVia?: string;
      provider?: string;
      providerMessageId?: string;
      sentAt?: string;
      messageHash?: string;
    },
  ) {
    return this.coreService.markDailyWhatsappOrderNotificationSent(req.user, orderId, body);
  }

  @Post('admin/whatsapp/order-notifications/:orderId/mark-failed')
  @Roles('ADMIN')
  markWhatsappOrderNotificationFailed(
    @Req() req: AuthRequest,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() body: {
      failedAt?: string;
      targetPhone?: string;
      targetSource?: 'STUDENT' | 'PARENT';
      sentVia?: string;
      provider?: string;
      reason?: string;
    },
  ) {
    return this.coreService.markDailyWhatsappOrderNotificationFailed(req.user, orderId, body);
  }

  @Get('delivery/summary')
  @Roles('ADMIN', 'DELIVERY')
  getDeliverySummary(@Req() req: AuthRequest, @Query('date') date?: string) {
    return this.coreService.getDeliverySummary(req.user, date);
  }

  @Post('admin/delivery/send-notification-email')
  @Roles('ADMIN')
  sendDeliveryNotificationEmail(@Req() req: AuthRequest) {
    return this.coreService.sendDeliveryNotificationEmails(req.user);
  }

  // POST delivery/assignments/:assignmentId/confirm moved to archived.controller.ts

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

  @Get('multi-orders')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  getMultiOrders(@Req() req: AuthRequest) {
    return this.coreService.getMultiOrders(req.user);
  }

  @Get('multi-orders/:groupId')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  getMultiOrderById(@Req() req: AuthRequest, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.coreService.getMultiOrderDetail(req.user, groupId);
  }

  @Post('multi-orders')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  createMultiOrder(@Req() req: AuthRequest, @Body() body: CreateMultiOrderDto) {
    return this.coreService.createMultiOrder(req.user, body);
  }

  @Patch('multi-orders/:groupId')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  updateMultiOrder(@Req() req: AuthRequest, @Param('groupId', ParseUUIDPipe) groupId: string, @Body() body: UpdateMultiOrderDto) {
    return this.coreService.updateMultiOrder(req.user, groupId, body);
  }

  @Delete('multi-orders/:groupId')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  deleteMultiOrder(@Req() req: AuthRequest, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.coreService.deleteMultiOrder(req.user, groupId);
  }

  @Post('multi-orders/:groupId/requests')
  @Roles('PARENT', 'YOUNGSTER')
  createMultiOrderRequest(
    @Req() req: AuthRequest,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() body: CreateMultiOrderRequestDto,
  ) {
    return this.coreService.createMultiOrderRequest(req.user, groupId, body);
  }

  @Get('multi-orders/:groupId/billing')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  getMultiOrderBilling(@Req() req: AuthRequest, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.coreService.getMultiOrderBilling(req.user, groupId);
  }

  @Post('multi-orders/:groupId/billing/proof-upload')
  @Roles('PARENT', 'YOUNGSTER')
  uploadMultiOrderBillingProof(
    @Req() req: AuthRequest,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() body: UploadMultiOrderBillingProofDto,
  ) {
    return this.coreService.uploadMultiOrderBillingProof(req.user, groupId, body.proofImageData);
  }

  @Post('multi-orders/:groupId/billing/revert-proof')
  @Roles('PARENT', 'YOUNGSTER')
  revertMultiOrderBillingProof(@Req() req: AuthRequest, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.coreService.revertMultiOrderBillingProof(req.user, groupId);
  }

  @Get('multi-orders/:groupId/billing/proof-image')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  async getMultiOrderBillingProofImage(
    @Req() req: AuthRequest,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Res() res: Response,
  ) {
    const out = await this.coreService.getMultiOrderProofImage(req.user, groupId);
    res.setHeader('Content-Type', out.contentType);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(out.data);
  }

  @Get('multi-orders/:groupId/receipt')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  getMultiOrderReceipt(@Req() req: AuthRequest, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.coreService.getMultiOrderReceipt(req.user, groupId);
  }

  @Get('multi-orders/:groupId/receipt-file')
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN')
  async getMultiOrderReceiptFile(
    @Req() req: AuthRequest,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Res() res: Response,
  ) {
    const out = await this.coreService.getMultiOrderReceiptFile(req.user, groupId);
    res.setHeader('Content-Type', out.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${out.fileName}"`);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(out.data);
  }

  @Get('parent/me/orders/consolidated')
  @Roles('PARENT')
  getParentConsolidatedOrdersSingular(@Req() req: AuthRequest) {
    return this.coreService.getParentConsolidatedOrders(req.user);
  }

  @Get('parents/me/spending-dashboard')
  @Roles('PARENT')
  getParentSpendingDashboard(@Req() req: AuthRequest, @Query('month') month?: string) {
    return this.coreService.getParentSpendingDashboard(req.user, month);
  }

  @Get('parent/me/spending-dashboard')
  @Roles('PARENT')
  getParentSpendingDashboardSingular(@Req() req: AuthRequest, @Query('month') month?: string) {
    return this.coreService.getParentSpendingDashboard(req.user, month);
  }

  @Get('youngster/me/spending-dashboard')
  @Roles('YOUNGSTER')
  getYoungsterSpendingDashboard(@Req() req: AuthRequest, @Query('month') month?: string) {
    return this.coreService.getYoungsterSpendingDashboard(req.user, month);
  }

  @Get('student/me/spending-dashboard')
  @Roles('YOUNGSTER')
  getStudentSpendingDashboard(@Req() req: AuthRequest, @Query('month') month?: string) {
    return this.coreService.getYoungsterSpendingDashboard(req.user, month);
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

  @Get('admin/multi-orders')
  @Roles('ADMIN')
  getAdminMultiOrders(
    @Req() req: AuthRequest,
    @Query('student') student?: string,
    @Query('parent') parent?: string,
    @Query('session') session?: string,
    @Query('status') status?: string,
    @Query('request_status') requestStatus?: string,
    @Query('from_date') fromDate?: string,
    @Query('to_date') toDate?: string,
  ) {
    return this.coreService.getAdminMultiOrders(req.user, {
      student,
      parent,
      session,
      status,
      requestStatus,
      fromDate,
      toDate,
    });
  }

  @Get('admin/multi-orders/:groupId')
  @Roles('ADMIN')
  getAdminMultiOrderById(@Req() req: AuthRequest, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.coreService.getMultiOrderDetail(req.user, groupId);
  }

  @Post('admin/multi-orders/:groupId/resolve-request')
  @Roles('ADMIN')
  resolveMultiOrderRequest(
    @Req() req: AuthRequest,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() body: ResolveMultiOrderRequestDto,
  ) {
    return this.coreService.resolveMultiOrderRequest(req.user, groupId, body);
  }

  @Patch('admin/multi-orders/:groupId/future-trim')
  @Roles('ADMIN')
  trimMultiOrderFuture(@Req() req: AuthRequest, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.coreService.trimMultiOrderFuture(req.user, groupId);
  }

  @Post('admin/multi-orders/:groupId/replacement')
  @Roles('ADMIN')
  createMultiOrderReplacement(
    @Req() req: AuthRequest,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() body: CreateMultiOrderReplacementDto,
  ) {
    return this.coreService.createMultiOrderReplacement(req.user, groupId, body);
  }

  @Delete('admin/multi-orders/:groupId/future-occurrences/:occurrenceId')
  @Roles('ADMIN')
  deleteMultiOrderOccurrence(
    @Req() req: AuthRequest,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('occurrenceId', ParseUUIDPipe) occurrenceId: string,
  ) {
    return this.coreService.deleteMultiOrderOccurrence(req.user, groupId, occurrenceId);
  }

  @Get('admin/multi-orders/:groupId/billing')
  @Roles('ADMIN')
  getAdminMultiOrderBilling(@Req() req: AuthRequest, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.coreService.getMultiOrderBilling(req.user, groupId);
  }

  @Get('admin/multi-orders/:groupId/billing/proof-image')
  @Roles('ADMIN')
  async getAdminMultiOrderBillingProofImage(
    @Req() req: AuthRequest,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Res() res: Response,
  ) {
    const out = await this.coreService.getMultiOrderProofImage(req.user, groupId);
    res.setHeader('Content-Type', out.contentType);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(out.data);
  }

  @Post('admin/multi-orders/:groupId/billing/verify')
  @Roles('ADMIN')
  verifyAdminMultiOrderBilling(
    @Req() req: AuthRequest,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() body: VerifyBillingDto,
  ) {
    return this.coreService.verifyMultiOrderBilling(req.user, groupId, body.decision || 'VERIFIED', body.note);
  }

  @Post('admin/multi-orders/:groupId/receipt')
  @Roles('ADMIN')
  generateAdminMultiOrderReceipt(@Req() req: AuthRequest, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.coreService.generateMultiOrderReceipt(req.user, groupId);
  }

  @Get('admin/multi-orders/:groupId/receipt')
  @Roles('ADMIN')
  getAdminMultiOrderReceipt(@Req() req: AuthRequest, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.coreService.getMultiOrderReceipt(req.user, groupId);
  }

  @Get('admin/multi-orders/:groupId/receipt-file')
  @Roles('ADMIN')
  async getAdminMultiOrderReceiptFile(
    @Req() req: AuthRequest,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Res() res: Response,
  ) {
    const out = await this.coreService.getMultiOrderReceiptFile(req.user, groupId);
    res.setHeader('Content-Type', out.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${out.fileName}"`);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(out.data);
  }

  @Post('kitchen/orders/:orderId/complete')
  @Roles('KITCHEN', 'ADMIN')
  markKitchenOrderComplete(@Req() req: AuthRequest, @Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.coreService.markKitchenOrderComplete(req.user, orderId);
  }

}
