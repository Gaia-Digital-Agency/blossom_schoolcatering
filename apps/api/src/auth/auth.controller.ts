import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

type LoginBody = {
  username: string;
  password: string;
  role: string;
};

type RefreshBody = {
  refreshToken: string;
};

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() body: LoginBody) {
    return this.authService.login(body.username, body.password, body.role);
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

  @Post('logout')
  logout(@Headers('authorization') authorization?: string) {
    const token = this.extractBearerToken(authorization);
    this.authService.logout(token);
    return { ok: true };
  }

  private extractBearerToken(authorization?: string) {
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    return authorization.replace('Bearer ', '').trim();
  }
}
