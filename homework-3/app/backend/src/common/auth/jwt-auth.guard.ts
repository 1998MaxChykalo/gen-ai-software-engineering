import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { DomainErrors } from '../errors/domain-error';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw DomainErrors.unauthorized();
    }
    const token = header.slice('Bearer '.length);
    try {
      const payload = this.jwtService.verify<{ sub: string; email: string; role: string }>(token);
      request.user = { id: payload.sub, email: payload.email, role: payload.role };
      return true;
    } catch {
      throw DomainErrors.unauthorized('Invalid or expired token.');
    }
  }
}
