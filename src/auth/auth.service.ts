import { Injectable, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async signup(createUserDto: CreateUserDto) {
    const { username, password } = createUserDto;

    const existingUser = await this.prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      throw new ConflictException('Username already exists.');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    const authToken = uuidv4();

    try {
      const user = await this.prisma.user.create({
        data: {
          username,
          password_hash: passwordHash,
          auth_token: authToken,
        },
      });

      return {
        message: 'User created successfully.',
        token: user.auth_token,
      };
    } catch (error) {
      throw new InternalServerErrorException('Could not create user.');
    }
  }

  async login(loginUserDto: CreateUserDto) {
    const { username, password } = loginUserDto;

    const user = await this.prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      throw new ConflictException('Invalid credentials.');
    }

    const isPasswordMatching = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordMatching) {
      throw new ConflictException('Invalid credentials.');
    }

    return {
      message: 'Login successful.',
      token: user.auth_token,
    };
  }
} 