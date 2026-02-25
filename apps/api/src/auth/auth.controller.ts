import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ROLES, Role } from './auth.types';

type LoginBody = {
  username: string;
  password: string;
  role: string;
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

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() body: LoginBody) {
    return this.authService.login(body.username, body.password, body.role);
  }

  @Post('google/dev')
  loginWithGoogleDev(@Body() body: GoogleDevBody) {
    return this.authService.loginWithGoogleDev(body.googleEmail, body.role);
  }

  @Get('me')
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
  setOnboardingState(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: OnboardingBody,
  ) {
    const token = this.extractBearerToken(authorization);
    return this.authService.setOnboardingState(token, body.completed);
  }

  @Post('role-check')
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

  private extractBearerToken(authorization?: string) {
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    return authorization.replace('Bearer ', '').trim();
  }
}
