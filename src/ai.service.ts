import axios from 'axios';
import { config } from 'dotenv';

config();

interface NurieRequestParams {
  question: string;
  chatId?: string;
}

export async function nurieRequest(prompt: string, chatId?: string): Promise<any> {
  const apiKey = process.env.NURIE_API_KEY;
  if (!apiKey) {
    throw new Error('NURIE_API_KEY is not set in the environment variables.');
  }

  const requestBody: NurieRequestParams = {
    question: prompt,
  };

  if (chatId) {
    requestBody.chatId = chatId;
  }

  const requestConfig = {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${process.env.NURIE_API_KEY}`,
    },
  };

  try {
    const response = await axios.post(
      process.env.NURIE_API as string,
      requestBody,
      requestConfig,
    );
    return response.data;
  } catch (error: any) {
    console.error(
      'AI 요청 실패:',
      error.response?.status,
      error.response?.data,
    );
    throw new Error(`Request failed with status code ${error.response?.status}`);
  }
} 