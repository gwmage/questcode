import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { QaService } from './qa.service';
import { CreateQaDto } from './dto/create-qa.dto';
import { AuthGuard } from '../auth/auth.guard';
import { User, AuthToken } from '@prisma/client';

@Controller('qa')
export class QaController {
  constructor(private readonly qaService: QaService) {}

  @UseGuards(AuthGuard)
  @Post()
  startQa(@Req() req: any, @Body() createQaDto: CreateQaDto) {
    const user = req.user as User;
    const authToken = req.authToken as AuthToken;
    return this.qaService.startNewJob(user, authToken, createQaDto);
  }
} 