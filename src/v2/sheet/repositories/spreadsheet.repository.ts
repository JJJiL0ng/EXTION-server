import { Injectable } from '@nestjs/common';
import { SpreadSheetStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type PrismaExecutor = PrismaService | any;

@Injectable()
export class SpreadsheetRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(callback);
  }

  findActiveByIdAndUser(
    spreadSheetId: string,
    userId: string,
    client: PrismaExecutor = this.prisma,
  ) {
    return client.spreadSheet.findFirst({
      where: {
        id: spreadSheetId,
        userId,
        status: SpreadSheetStatus.ACTIVE,
      },
    });
  }

  createSpreadSheet(
    data: {
      id: string;
      fileName: string;
      userId: string;
      editLockVersion: number;
    },
    client: PrismaExecutor = this.prisma,
  ) {
    return client.spreadSheet.create({
      data: {
        ...data,
        status: SpreadSheetStatus.ACTIVE,
      },
    });
  }

  createVersion(
    data: {
      spreadSheetId: string;
      parentId: string | null;
      authorId: string;
      name: string | null;
      data: Record<string, any>;
    },
    client: PrismaExecutor = this.prisma,
  ) {
    return client.spreadSheetVersionData.create({
      data: {
        ...data,
        data: data.data as any,
      },
    });
  }

  updateHeadVersion(
    spreadSheetId: string,
    headVersionId: string,
    client: PrismaExecutor = this.prisma,
  ) {
    return client.spreadSheet.update({
      where: { id: spreadSheetId },
      data: { headVersionId },
    });
  }

  updateHeadWithOptimisticLock(
    input: {
      spreadSheetId: string;
      headVersionId: string;
      editLockVersion: number;
    },
    client: PrismaExecutor = this.prisma,
  ) {
    return client.spreadSheet.update({
      where: {
        id: input.spreadSheetId,
        editLockVersion: input.editLockVersion,
      },
      data: {
        headVersionId: input.headVersionId,
        editLockVersion: {
          increment: 1,
        },
      },
    });
  }

  createChat(
    data: {
      id: string;
      spreadSheetId: string;
      userId: string;
    },
    client: PrismaExecutor = this.prisma,
  ) {
    return client.chat.create({ data });
  }

  findVersionData(versionId: string, client: PrismaExecutor = this.prisma) {
    return client.spreadSheetVersionData.findUnique({
      where: {
        id: versionId,
      },
      select: {
        data: true,
      },
    });
  }

  findVersionsBySpreadSheet(spreadSheetId: string, client: PrismaExecutor = this.prisma) {
    return client.spreadSheetVersionData.findMany({
      where: {
        spreadSheetId,
      },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
      orderBy: {
        savedAt: 'desc',
      },
    });
  }

  updateFileName(
    spreadSheetId: string,
    fileName: string,
    client: PrismaExecutor = this.prisma,
  ) {
    return client.spreadSheet.update({
      where: {
        id: spreadSheetId,
      },
      data: {
        fileName,
        updatedAt: new Date(),
      },
    });
  }
}
