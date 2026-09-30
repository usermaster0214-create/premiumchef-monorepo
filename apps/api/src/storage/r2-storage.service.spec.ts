import { BadRequestException } from '@nestjs/common';
import { R2StorageService } from './r2-storage.service';

describe('R2StorageService', () => {
  it('rejects content that does not match the declared image MIME type', async () => {
    const service = new R2StorageService();

    await expect(
      service.uploadCatalogImage(
        { mimetype: 'image/png', buffer: Buffer.from('not a png') },
        'tenant-1',
        'unit-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});