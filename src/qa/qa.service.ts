import { Injectable, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQaDto } from './dto/create-qa.dto';
import { AuthToken, User } from '@prisma/client';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class QaService {
  constructor(private prisma: PrismaService) {}

  async startNewJob(user: User, authToken: AuthToken, createQaDto: CreateQaDto) {
    const runningJob = await this.prisma.qAJob.findFirst({
      where: {
        authTokenId: authToken.id,
        status: 'running',
      },
    });

    if (runningJob) {
      throw new ConflictException('An existing QA job is already in progress for this token.');
    }
    
    const newJob = await this.prisma.qAJob.create({
      data: {
        authTokenId: authToken.id,
        status: 'queued',
        target_url: createQaDto.url,
      },
    });

    this.runQaProcessInBackground(newJob.id, createQaDto);

    return {
      message: 'QA job started successfully.',
      jobId: newJob.id,
    };
  }

  private runQaProcessInBackground(jobId: number, createQaDto: CreateQaDto) {
    this.prisma.qAJob.update({
        where: { id: jobId },
        data: { status: 'running' },
    }).then(() => {
        console.log(`[Job ${jobId}] QA 프로세스를 시작합니다...`);

        const args = [
            path.join(__dirname, '..', 'cli.ts'),
            `--url=${createQaDto.url}`,
            `--model=nurie`, // or from DTO
        ];
        if (createQaDto.ragUrl) {
            args.push(`--rag-url=${createQaDto.ragUrl}`);
        }

        // We need to write testCase and spec to a file for the CLI to read
        // For simplicity, we assume test-context.md is used for now.
        // A more robust solution would use a unique file per job.

        const child = spawn('ts-node', args, {
            stdio: 'pipe', 
            shell: true
        });

        child.stdout.on('data', (data) => {
            console.log(`[Job ${jobId} STDOUT]: ${data}`);
        });

        child.stderr.on('data', (data) => {
            console.error(`[Job ${jobId} STDERR]: ${data}`);
        });

        child.on('close', (code) => {
            console.log(`[Job ${jobId}] QA 프로세스가 코드 ${code}(으)로 종료되었습니다.`);
            const finalStatus = code === 0 ? 'completed' : 'failed';
            this.prisma.qAJob.update({
                where: { id: jobId },
                data: { 
                    status: finalStatus,
                    completed_at: new Date()
                },
            }).catch(console.error);
        });
    }).catch(console.error);
  }
} 