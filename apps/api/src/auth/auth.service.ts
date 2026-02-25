import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';

type Role = 'PARENT' | 'YOUNGSTER' | 'ADMIN' | 'KITCHEN' | 'DELIVERY';

type Session = {
  username: string;
  role: Role;
};

const DEV_USERNAME = 'teameditor';
const DEV_PASSWORD = 'admin123';
const ROLES: Role[] = ['PARENT', 'YOUNGSTER', 'ADMIN', 'KITCHEN', 'DELIVERY'];

@Injectable()
export class AuthService {
  private readonly accessSessions = new Map<string, Session>();
  private readonly refreshSessions = new Map<string, Session>();

  private normalizeRole(role: string): Role {
    const normalized = role?.toUpperCase() as Role;
    if (!ROLES.includes(normalized)) {
      throw new UnauthorizedException('Invalid role');
    }
    return normalized;
  }

  login(username: string, password: string, role: string) {
    if (username !== DEV_USERNAME || password !== DEV_PASSWORD) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const normalizedRole = this.normalizeRole(role);
    const session = { username: DEV_USERNAME, role: normalizedRole };
    const accessToken = randomUUID();
    const refreshToken = randomUUID();

    this.accessSessions.set(accessToken, session);
    this.refreshSessions.set(refreshToken, session);

    return {
      accessToken,
      refreshToken,
      user: {
        username: DEV_USERNAME,
        displayName: 'Team Editor',
        role: normalizedRole,
      },
    };
  }

  me(accessToken: string) {
    const session = this.accessSessions.get(accessToken);
    if (!session) {
      throw new UnauthorizedException('Invalid access token');
    }
    return {
      username: session.username,
      displayName: 'Team Editor',
      role: session.role,
    };
  }

  refresh(refreshToken: string) {
    const session = this.refreshSessions.get(refreshToken);
    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const newAccessToken = randomUUID();
    const newRefreshToken = randomUUID();
    this.accessSessions.set(newAccessToken, session);
    this.refreshSessions.set(newRefreshToken, session);
    this.refreshSessions.delete(refreshToken);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  logout(accessToken: string) {
    this.accessSessions.delete(accessToken);
  }
}
