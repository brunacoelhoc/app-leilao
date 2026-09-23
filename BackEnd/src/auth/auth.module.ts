import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuditModule } from '../audit/audit.module';
import { UsersController } from '../users/users.controller';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  // UsersController mora aqui (nao no UsersModule) para evitar dependencia
  // circular: o AuthModule ja importa o UsersModule pelo UsersService, e o
  // controller precisa do JwtAuthGuard/RolesGuard, que so existem depois
  // que o PassportModule.register roda aqui embaixo
  controllers: [AuthController, UsersController],
  imports: [
    UsersModule,
    AuditModule,
    // O ".register" e obrigatorio: sem ele, o JwtAuthGuard nao funciona em nenhum modulo
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        // Fixa o algoritmo explicitamente (defesa em profundidade contra
        // ataques de confusao de algoritmo em JWT) em vez de depender do
        // padrao inferido pela biblioteca a partir do tipo da chave
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.getOrThrow<string>('JWT_EXPIRES_IN') as `${number}${'s' | 'm' | 'h' | 'd'}`,
        },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy],
  // PassportModule precisa ser reexportado: qualquer modulo que use o
  // JwtAuthGuard vai precisar importar o AuthModule por causa disso
  exports: [AuthService, PassportModule],
})
export class AuthModule {}
