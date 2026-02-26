import { Body, Controller, Get, Headers, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { ROLES, Role } from './auth.types';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

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

type RefreshBody = {
  refreshToken: string;
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
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  login(@Body() body: LoginBody) {
    const username = body.username ?? body.identifier;
    const password = body.password;
    const role = body.role;
    if (!username || !password || !role) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.authService.login(username, password, role);
  }

  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  register(@Body() body: RegisterBody) {
    const role = body.role;
    const username = body.username;
    const password = body.password;
    const firstName = body.firstName;
    const lastName = body.lastName;
    const phoneNumber = body.phoneNumber;
    const email = body.email;
    const address = body.address;
    if (!role || !username || !password || !firstName || !lastName || !phoneNumber) {
      throw new UnauthorizedException('Missing required fields');
    }
    return this.authService.register({
      role: role as Role,
      username,
      password,
      firstName,
      lastName,
      phoneNumber,
      email,
      address,
    });
  }

  @Post('google/dev')
  loginWithGoogleDev(@Body() body: GoogleDevBody) {
    return this.authService.loginWithGoogleDev(body.googleEmail, body.role);
  }

  @Post('google/verify')
  loginWithGoogleVerified(@Body() body: { idToken: string; role: string }) {
    return this.authService.loginWithGoogleVerified(body.idToken, body.role);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Headers('authorization') authorization?: string) {
    const token = this.extractBearerToken(authorization);
    return this.authService.me(token);
  }

  @Post('refresh')
  refresh(@Body() body: RefreshBody) {
    return this.authService.refresh(body.refreshToken);
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
  logout(@Body() body: RefreshBody) {
    return this.authService.logout(body?.refreshToken);
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
