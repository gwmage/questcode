import { InjectTransactionHost, TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { Injectable } from '@nestjs/common';
import { orderBy } from 'lodash';
import { gptLog } from 'prisma/prisma-generated/master';
import { currentDate } from 'src/utils/date';

@Injectable()
export class GptRepository {

    constructor(
      @InjectTransactionHost('master')
      private readonly txm: TransactionHost<TransactionalAdapterPrisma>,
      @InjectTransactionHost('slave')
      private readonly txs: TransactionHost<TransactionalAdapterPrisma>,
    ) {}

    async insertStoryResult(gpt: {
      genMemberIdx: number,
      prompt: string,
      requestCode: string,
      type: string,
      result: string
    }) {
      return await this.txm.tx.gptLog.create({
        data: {
          prompt: gpt.prompt,
          requestCode: gpt.requestCode,
          genMemberIdx: gpt.genMemberIdx,
          result: gpt.result,
          regdate: currentDate(),
          type: gpt.type
        }
      });
    }

    async getConvResult(data: {
      prompt: string;
      type: string;
    }) {
      return await this.txm.tx.gptLog.findMany({
        where: {
          prompt: data.prompt,
          type: data.type,
        },
        orderBy: {
          regdate: 'desc'
        }
      })
    }

}
