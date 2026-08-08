import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { uuid7 } from '../../common/ids/uuid7';
import { DomainErrors } from '../../common/errors/domain-error';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<{ accessToken: string }> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw DomainErrors.emailAlreadyRegistered();
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const userId = uuid7();

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { id: userId, email: dto.email, passwordHash, role: 'user' },
      });
      await tx.profile.create({
        data: { id: uuid7(), userId: created.id },
      });
      return created;
    });

    return { accessToken: this.signToken(user.id, user.email, user.role) };
  }

  async login(dto: LoginDto): Promise<{ accessToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw DomainErrors.invalidCredentials();
    }
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw DomainErrors.invalidCredentials();
    }
    return { accessToken: this.signToken(user.id, user.email, user.role) };
  }

  private signToken(sub: string, email: string, role: string): string {
    return this.jwtService.sign({ sub, email, role });
  }
}
