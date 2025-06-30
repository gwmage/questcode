import { IsString, IsUrl, IsOptional } from 'class-validator';

export class CreateQaDto {
  @IsUrl()
  url: string;

  @IsUrl()
  @IsOptional()
  ragUrl?: string;

  @IsString()
  testCase: string;

  @IsString()
  spec: string;
} 