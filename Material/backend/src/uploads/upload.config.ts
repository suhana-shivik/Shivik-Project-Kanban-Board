import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { randomBytes } from 'crypto';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join, resolve } from 'path';

/** Both upload fields on the "Add New User" form. */
export const UPLOAD_FIELDS = [
  { name: 'profileImage', maxCount: 1 },
  { name: 'signature', maxCount: 1 },
];

const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];

export function uploadRoot(): string {
  return resolve(process.env.UPLOAD_DIR ?? 'uploads');
}

/** Bytes. 2 MB by default — a signature scan, not a photo library. */
export function maxUploadBytes(): number {
  const configured = Number(process.env.UPLOAD_MAX_BYTES);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : 2 * 1024 * 1024;
}

/** Public URL for a stored path, e.g. `profile-images/ab12….png`. */
export function fileUrl(storedPath: string | null): string | null {
  return storedPath ? `/uploads/${storedPath.replace(/\\/g, '/')}` : null;
}

/**
 * One sub-folder per field, and a random filename so two people uploading
 * `signature.png` cannot overwrite each other — or escape the folder with a
 * crafted name.
 */
export function uploadOptions(): MulterOptions {
  return {
    storage: diskStorage({
      destination: (_req, file, done) => {
        const folder = join(
          uploadRoot(),
          file.fieldname === 'signature' ? 'signatures' : 'profile-images',
        );
        mkdirSync(folder, { recursive: true });
        done(null, folder);
      },
      filename: (_req, file, done) => {
        const extension = extname(file.originalname).toLowerCase();
        done(null, `${randomBytes(16).toString('hex')}${extension}`);
      },
    }),
    limits: { fileSize: maxUploadBytes(), files: UPLOAD_FIELDS.length },
    fileFilter: (_req, file, done) => {
      const extension = extname(file.originalname).toLowerCase();

      if (
        !file.mimetype.startsWith('image/') ||
        !ALLOWED_EXTENSIONS.includes(extension)
      ) {
        // surfaces as the usual { errors: { field: message } } 400
        done(
          new BadRequestException({
            errors: {
              [file.fieldname]: `Only image files are allowed (${ALLOWED_EXTENSIONS.join(', ')})`,
            },
          }),
          false,
        );
        return;
      }
      done(null, true);
    },
  };
}

/** What the controller hands the service after multer has run. */
export interface UploadedFiles {
  profileImage?: Express.Multer.File[];
  signature?: Express.Multer.File[];
}

/** Relative path to store on the row, e.g. `signatures/ab12….png`. */
export function storedPath(file?: Express.Multer.File): string | null {
  if (!file) return null;
  const folder =
    file.fieldname === 'signature' ? 'signatures' : 'profile-images';
  return `${folder}/${file.filename}`;
}
