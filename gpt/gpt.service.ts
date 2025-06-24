import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import OpenAIApi from 'openai';
import { ChatCompletion, ChatCompletionMessageParam } from 'openai/resources';
import { GptRepository } from './gpt.repository';
import { gptLog } from 'prisma/prisma-generated/master';
import { HttpService } from '@nestjs/axios';
import { catchError, lastValueFrom, Observable, of } from 'rxjs';
import { AxiosError, AxiosResponse } from 'axios';

type Message = {
  text: string;
  ai?: boolean; // Indicate if the message is from the AI
};

@Injectable()
export class GptService {
  constructor(
    private gptRepo: GptRepository,
    private httpService: HttpService
  ) {
  }

  async nurieRequest(
    question: string,
    options?: {
      chatId?: string,
      chatMessageId?: string,
      sessionId?: string
    }
  ) {
    
    const requestConfig = {
      headers: {
        'Content-Type': 'application/json; charset=utf-8 ',
        'Authorization': `Bearer ${process.env.NURIE_API_KEY}`
      },
    };

    const requestBody = {
      question,
      ...options
    };

    const responseNurie = this.httpService
      .post(
        process.env.NURIE_API,
        requestBody,
        requestConfig,
      )
      .pipe(
        catchError(
          (
            error: AxiosError,
            caught$: Observable<AxiosResponse<any, any>>,
          ) => {
            console.log(error);
            // throw new BadRequestException(4005);
            // return caught$;
            return of(1);
          },
        ),
      );
    const response: number | any = await lastValueFrom(responseNurie);
    // console.log(response.data);
    return response.data;
  }

}
