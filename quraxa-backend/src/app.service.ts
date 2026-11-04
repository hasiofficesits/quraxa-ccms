import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) { }

  async getHello(): Promise<string> {
    const roleCount = await this.prisma.roles.count();
    const userCount = await this.prisma.users.count();
    return `QuraXa backend connected. Roles: ${roleCount}, Users: ${userCount}`;
  }
}
