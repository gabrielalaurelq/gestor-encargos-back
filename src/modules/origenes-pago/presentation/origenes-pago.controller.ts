import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListarOrigenesPagoUseCase } from '../application/use-cases/listar-origenes-pago.use-case';
import { OrigenPagoResponse, aOrigenPagoResponse } from './origen-pago.response';

// Doc 5 v1.6 — "Orígenes de pago". Sin paginar: es un catálogo semilla de
// cuatro filas. Requiere sesión como todo lo demás (AuthGuard global).
@ApiTags('origenes-pago')
@ApiBearerAuth()
@Controller('origenes-pago')
export class OrigenesPagoController {
  constructor(private readonly listar: ListarOrigenesPagoUseCase) {}

  @Get()
  @ApiOperation({
    summary: 'Catálogo de orígenes de pago (Efectivo, Transferencia, Yape, Plin).',
    description: 'Incluye los desactivados, marcados con `activo: false`.',
  })
  @ApiOkResponse({ type: OrigenPagoResponse, isArray: true })
  async listarOrigenes(): Promise<OrigenPagoResponse[]> {
    return (await this.listar.execute()).map(aOrigenPagoResponse);
  }
}
