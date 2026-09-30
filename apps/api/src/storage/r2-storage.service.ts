import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';

const imageFormats = {
  'image/jpeg': {
    extension: 'jpg',
    matches: (buffer: Buffer) => buffer[0] === 0xff && buffer[1] === 0xd8,
  },
  'image/png': {
    extension: 'png',
    matches: (buffer: Buffer) =>
      buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  'image/webp': {
    extension: 'webp',
    matches: (buffer: Buffer) =>
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP',
  },
} as const;

export interface CatalogImageFile {
  mimetype: string;
  buffer: Buffer;
}

@Injectable()
export class R2StorageService implements OnModuleDestroy {
  private client?: S3Client;

  async onModuleDestroy(): Promise<void> {
    await this.client?.destroy();
  }

  async uploadCatalogImage(
    file: CatalogImageFile,
    tenantId: string,
    unitId: string,
  ): Promise<string> {
    const format = imageFormats[file.mimetype as keyof typeof imageFormats];
    if (!file.buffer?.length || !format || !format.matches(file.buffer)) {
      throw new BadRequestException(
        'O arquivo precisa ser uma imagem JPEG, PNG ou WebP válida',
      );
    }

    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET_NAME;
    const publicUrl = process.env.R2_PUBLIC_URL?.replace(/\/+$/, '');
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
      throw new ServiceUnavailableException('O armazenamento de imagens R2 não está configurado');
    }

    this.client ??= new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });

    const key = `catalog/${tenantId}/${unitId}/${randomUUID()}.${format.extension}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    return `${publicUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
}