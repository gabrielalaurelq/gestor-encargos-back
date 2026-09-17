import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

// Doc 5 usa snake_case en los cuerpos JSON (`servidor_timestamp`, `has_more`).
export class LoginDto {
  @ApiProperty({ description: 'ID token emitido por Firebase Authentication tras Google Sign-In.' })
  @IsString()
  @IsNotEmpty()
  id_token!: string;
}
