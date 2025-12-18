import { Body, Controller, Headers, Post, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HandshakeRequestDto } from './dto/handshake-request.dto';
import { SecureRequestDto } from './dto/secure-request.dto';
import { HandshakeService } from './handshake.service';
import { Phase2AuthGuard } from './guards/phase2-auth.guard';
import { Phase2EncryptInterceptor } from './interceptors/phase2-encrypt.interceptor';

@ApiTags('Handshake')
@Controller('handshake')
export class HandshakeController {
  constructor(private readonly handshakeService: HandshakeService) {}

  @Post()
  @ApiOperation({ summary: 'Initial handshake (First Req)' })
  @ApiResponse({ status: 200, description: 'Handshake response' })
  async first(
    @Headers('x-app-auth') appAuth: string | undefined,
    @Body() body: HandshakeRequestDto,
  ) {
    return this.handshakeService.handleFirstHandshake(appAuth, body.payload);
  }

  @Post('secure-echo')
  @UseGuards(Phase2AuthGuard)
  @UseInterceptors(Phase2EncryptInterceptor)
  @ApiOperation({ summary: 'Phase 2 test endpoint (Second Req) - echoes decrypted body' })
  @ApiResponse({ status: 200, description: 'Encrypted response using phase 2 algorithm' })
  async secureEcho(@Body() _body: SecureRequestDto, @Req() req: any) {
    return req.decodedBody;
  }
}
