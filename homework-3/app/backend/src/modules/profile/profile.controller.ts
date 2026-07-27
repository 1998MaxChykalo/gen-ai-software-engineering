import { Body, Controller, Get, Put, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-auth.guard';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { ProfileService } from './profile.service';
import { ProfileUpsertDto } from './dto/profile.dto';

@ApiTags('profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @ApiOperation({ summary: "Get the current user's full financial profile document" })
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.profileService.getProfile(user.id);
  }

  @Put()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Replace the whole profile document (optimistic locking via version)' })
  @ApiResponse({ status: 200, description: 'Updated profile.' })
  @ApiResponse({ status: 409, description: 'PROFILE_VERSION_CONFLICT' })
  @ApiResponse({ status: 422, description: 'CURRENCY_NOT_SUPPORTED' })
  putProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: ProfileUpsertDto) {
    return this.profileService.replaceProfile(user.id, dto);
  }
}
