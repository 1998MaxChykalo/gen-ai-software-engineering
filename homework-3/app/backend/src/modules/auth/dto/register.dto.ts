import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'demo@horizon.app' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'HorizonDemo1!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}
