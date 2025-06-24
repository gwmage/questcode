import { Module } from '@nestjs/common';
import { GptService } from './gpt.service';
import { GptRepository } from './gpt.repository';
import { HttpModule } from '@nestjs/axios';

@Module({
  exports: [GptService],
  imports: [HttpModule],
  providers: [GptService, GptRepository],
})
export class GptModule {}
