import { Body, Controller, Get, Headers, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { ROLES, Role } from './auth.types';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import type { Request, Response } from 'express';

type LoginBody = {
  username?: string;
  identifier?: string;
  password?: string;
  role?: string;
};

type RegisterBody = {
  role?: string;
  username?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  email?: string;
  address?: string;
};

type YoungsterRegistrationBody = {
  youngsterFirstName?: string;
  youngsterLastName?: string;
  youngsterGender?: string;
  youngsterDateOfBirth?: string;
  youngsterSchoolId?: string;
  youngsterGrade?: string;
  youngsterPhone?: string;
  youngsterEmail?: string;
  parentFirstName?: string;
  parentLastName?: string;
  parentMobileNumber?: string;
  parentEmail?: string;
  parentAddress?: string;
};

type RefreshBody = {
  refreshToken?: string;
};

type GoogleDevBody = {
  googleEmail: string;
  role: string;
};

type UsernameBody = {
  base: string;
};

type OnboardingBody = {
  completed: boolean;
};

type RoleCheckBody = {
  allowedRoles: Role[];
};

type ChangePasswordBody = {
  currentPassword?: string;
  newPassword?: string;
};

@Controller('api/v1/auth')
export class AuthController {
  private readonly refreshCookieName = 'blossom_refresh_token';
  private readonly refreshTtlMs = 7 * 24 * 60 * 60 * 1000;

  constructor(private readonly authService: AuthService) {}

  private isSecureCookie(req: Request) {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const isHttpsForwarded = typeof forwardedProto === 'string'
      ? forwardedProto.includes('https')
      : Array.isArray(forwardedProto) && forwardedProto.some((p) => p.includes('https'));
    return req.secure || isHttpsForwarded || process.env.AUTH_COOKIE_SECURE === 'true';
  }

  private getCookie(req: Request, key: string) {
    const raw = req.headers.cookie;
    if (!raw) return '';
    for (const part of raw.split(';')) {
      const [k, ...rest] = part.trim().split('=');
      if (k === key) return decodeURIComponent(rest.join('='));
    }
    return '';
  }

  private setRefreshCookie(req: Request, res: Response, refreshToken: string) {
    res.cookie(this.refreshCookieName, refreshToken, {
      httpOnly: true,
      secure: this.isSecureCookie(req),
      sameSite: 'strict',
      path: '/',
      maxAge: this.refreshTtlMs,
    });
  }

  private clearRefreshCookie(req: Request, res: Response) {
    res.clearCookie(this.refreshCookieName, {
      httpOnly: true,
      secure: this.isSecureCookie(req),
      sameSite: 'strict',
      path: '/',
    });
  }

  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: LoginBody,
  ) {
    const username = body.username ?? body.identifier;
    const password = body.password;
    const role = body.role;
    if (!username || !password) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const result = await this.authService.login(username, password, role);
    this.setRefreshCookie(req, res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async register(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: RegisterBody,
  ) {
    const role = body.role;
    const username = body.username;
    const password = body.password;
    const firstName = body.firstName;
    const lastName = body.lastName;
    const phoneNumber = body.phoneNumber;
    const email = body.email;
    const address = body.address;
    if (!role || !username || !password || !firstName || !lastName || !phoneNumber || !email) {
      throw new UnauthorizedException('Missing required fields');
    }
    const result = await this.authService.register({
      role: role as Role,
      username,
      password,
      firstName,
      lastName,
      phoneNumber,
      email,
      address,
    });
    this.setRefreshCookie(req, res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Get('register/schools')
  async registrationSchools() {
    return this.authService.getRegistrationSchools();
  }

  @Post('register/youngsters')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async registerYoungsterWithParent(@Body() body: YoungsterRegistrationBody) {
    return this.authService.registerYoungsterWithParent({
      youngsterFirstName: body.youngsterFirstName || '',
      youngsterLastName: body.youngsterLastName || '',
      youngsterGender: body.youngsterGender || '',
      youngsterDateOfBirth: body.youngsterDateOfBirth || '',
      youngsterSchoolId: body.youngsterSchoolId || '',
      youngsterGrade: body.youngsterGrade || '',
      youngsterPhone: body.youngsterPhone || '',
      youngsterEmail: body.youngsterEmail || '',
      parentFirstName: body.parentFirstName || '',
      parentLastName: body.parentLastName || '',
      parentMobileNumber: body.parentMobileNumber || '',
      parentEmail: body.parentEmail || '',
      parentAddress: body.parentAddress || '',
    });
  }

  @Post('google/dev')
  async loginWithGoogleDev(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: GoogleDevBody,
  ) {
    const result = await this.authService.loginWithGoogleDev(body.googleEmail, body.role);
    this.setRefreshCookie(req, res, result.refreshToken);
    return {
      accessToken: result.accessToken,
      user: result.user,
      provider: result.provider,
    };
  }

  @Post('google/verify')
  async loginWithGoogleVerified(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: { idToken: string; role: string },
  ) {
    const result = await this.authService.loginWithGoogleVerified(body.idToken, body.role);
    this.setRefreshCookie(req, res, result.refreshToken);
    return {
      accessToken: result.accessToken,
      user: result.user,
      provider: result.provider,
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Headers('authorization') authorization?: string) {
    const token = this.extractBearerToken(authorization);
    return this.authService.me(token);
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: RefreshBody,
  ) {
    const refreshToken = this.getCookie(req, this.refreshCookieName) || body?.refreshToken;
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token');
    const tokens = await this.authService.refresh(refreshToken);
    this.setRefreshCookie(req, res, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @Post('username/generate')
  generateUsername(@Body() body: UsernameBody) {
    return this.authService.generateUsername(body.base);
  }

  @Get('onboarding')
  onboardingState(@Headers('authorization') authorization?: string) {
    const token = this.extractBearerToken(authorization);
    return this.authService.getOnboardingState(token);
  }

  @Post('onboarding')
  @UseGuards(JwtAuthGuard)
  setOnboardingState(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: OnboardingBody,
  ) {
    const token = this.extractBearerToken(authorization);
    return this.authService.setOnboardingState(token, body.completed);
  }

  @Post('role-check')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PARENT', 'YOUNGSTER', 'ADMIN', 'KITCHEN', 'DELIVERY')
  roleCheck(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: RoleCheckBody,
  ) {
    const token = this.extractBearerToken(authorization);
    const allowed = body.allowedRoles?.length ? body.allowedRoles : ROLES;
    return this.authService.assertRole(token, allowed);
  }

  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: RefreshBody,
  ) {
    const refreshToken = this.getCookie(req, this.refreshCookieName) || body?.refreshToken;
    const out = await this.authService.logout(refreshToken);
    this.clearRefreshCookie(req, res);
    return out;
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  changePassword(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: ChangePasswordBody,
  ) {
    const token = this.extractBearerToken(authorization);
    if (!body.currentPassword || !body.newPassword) {
      throw new UnauthorizedException('Missing password fields');
    }
    return this.authService.changePassword(token, body.currentPassword, body.newPassword);
  }

  @Get('admin-ping')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  adminPing() {
    return { ok: true };
  }

  private extractBearerToken(authorization?: string) {
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    return authorization.replace('Bearer ', '').trim();
  }
}
