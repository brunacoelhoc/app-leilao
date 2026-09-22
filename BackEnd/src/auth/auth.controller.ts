import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { UsuarioEntity } from '../users/usuario.entity';
import { AuthService, RespostaLogin } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegistrarUsuarioDto } from './dto/registrar-usuario.dto';

// Rotas publicas: nao passam pelo ApiKeyGuard (esse e global), mas nao exigem JWT
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST devolve 201 por padrao, e faz sentido aqui: um usuario novo foi criado
  @Post('registrar')
  registrar(@Body() dto: RegistrarUsuarioDto): Promise<UsuarioEntity> {
    return this.authService.registrar(dto);
  }

  // Login nao cria nada, entao o correto e 200, nao o 201 padrao do POST
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<RespostaLogin> {
    return this.authService.login(dto);
  }
}
