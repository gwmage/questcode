import axios, { AxiosError } from 'axios';

// .env 파일의 환경 변수를 로드합니다.
// 이 파일의 최상단에서 호출되어야 합니다.
import * as dotenv from 'dotenv';
dotenv.config();

/**
 * AI 서비스에 요청을 보내는 함수
 * @param question AI에게 보낼 질문 (테스트 생성을 위한 프롬프트)
 * @returns AI의 응답 데이터
 */
export async function nurieRequest(
  question: string,
  options?: {
    chatId?: string;
    chatMessageId?: string;
    sessionId?: string;
  }
) {
  const requestConfig = {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': `Bearer ${process.env.NURIE_API_KEY}`,
    },
  };

  const requestBody = {
    question,
    ...options,
  };

  try {
    const response = await axios.post(
      process.env.NURIE_API as string,
      requestBody,
      requestConfig
    );
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('AI 서비스 요청에 실패했습니다:', axiosError.message);
    // 실제 프로덕션에서는 좀 더 정교한 에러 처리가 필요할 수 있습니다.
    // 예를 들어, 특정 에러 코드에 따라 재시도를 하거나 사용자에게 명확한 오류를 알릴 수 있습니다.
    if (axiosError.response) {
      console.error('응답 상태:', axiosError.response.status);
      console.error('응답 데이터:', axiosError.response.data);
    }
    throw new Error('AI 서비스 호출 중 오류가 발생했습니다.');
  }
} 