import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class FcmTokenDto {
  @ApiProperty({
    description:
      'Token de registro que entrega Firebase Cloud Messaging en este dispositivo. Se envía ' +
      'justo después de /auth/login y cada vez que Firebase lo rota.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  fcm_token!: string;
}
