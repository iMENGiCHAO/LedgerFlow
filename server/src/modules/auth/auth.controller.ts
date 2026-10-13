import { Body, Controller, Get, HttpCode, Post, UsePipes } from '@nestjs/common';
import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { CurrentUser, OpLog, Public, SessionUser } from '../../common/decorators';

export class LoginDto {
  @IsString()
  username!: string;
  @IsString()
  @MinLength(1)
  password!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

export class SwitchTenantDto {
  @IsInt()
  tenantId!: number;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  oldPassword!: string;
  @IsString()
  @MinLength(6)
  newPassword!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username.trim(), dto.password);
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @HttpCode(200)
  @Post('switch-tenant')
  @OpLog('切换账套')
  switchTenant(@CurrentUser() user: SessionUser, @Body() dto: SwitchTenantDto) {
    return this.auth.switchTenant(user.uid, dto.tenantId);
  }

  @Get('profile')
  profile(@CurrentUser() user: SessionUser) {
    return user;
  }

  @HttpCode(200)
  @Post('password')
  @OpLog('修改本人密码')
  changePassword(@CurrentUser() user: SessionUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.uid, dto.oldPassword, dto.newPassword);
  }

  @HttpCode(200)
  @Post('logout')
  @OpLog('退出登录')
  logout(
    @CurrentUser() user: SessionUser,
    @Body() dto: { jti: string; refreshJti?: string; accessExp?: number; refreshExp?: number },
  ) {
    return this.auth.logout(user.uid, dto.jti, dto.refreshJti || '', dto.accessExp || 0, dto.refreshExp || 0);
  }
}
