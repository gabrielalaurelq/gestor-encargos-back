import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token entregado en /auth/login.' })
  @IsString()
  @IsNotEmpty()
  refresh_token!: string;
}
