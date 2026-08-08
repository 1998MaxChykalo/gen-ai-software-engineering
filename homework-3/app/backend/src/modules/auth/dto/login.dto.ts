import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'demo@horizon.app' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'HorizonDemo1!' })
  @IsString()
  password!: string;
}
