import { nativeImage } from 'electron';
import fs from 'fs';
import path from 'path';

const DEFAULT_THUMB_SIZE = 384;

export function generateThumbnail(
  sourcePath: string,
  thumbDir: string,
  uuid: string,
  size: number = DEFAULT_THUMB_SIZE
): string {
  const thumbName = `${uuid}.jpg`;
  const thumbPath = path.join(thumbDir, thumbName);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source not found: ${sourcePath}`);
  }

  const sourceBuf = fs.readFileSync(sourcePath);
  if (sourceBuf.length === 0) {
    throw new Error(`Empty source file: ${sourcePath}`);
  }

  const img = nativeImage.createFromBuffer(sourceBuf);

  if (img.isEmpty()) {
    throw new Error(`Cannot decode image: ${sourcePath}`);
  }

  const origSize = img.getSize();

  // Target: max dimension = size, keep aspect ratio
  let targetWidth: number;
  let targetHeight: number;

  if (origSize.width >= origSize.height) {
    targetWidth = size;
    targetHeight = Math.max(1, Math.round((origSize.height / origSize.width) * size));
  } else {
    targetHeight = size;
    targetWidth = Math.max(1, Math.round((origSize.width / origSize.height) * size));
  }

  let resized: Electron.NativeImage;
  if (origSize.width <= targetWidth && origSize.height <= targetHeight) {
    resized = img;
  } else {
    resized = img.resize({ width: targetWidth, height: targetHeight, quality: 'best' });
    if (resized.isEmpty()) {
      resized = img;
    }
  }

  // Higher quality JPEG for sharper thumbnails
  const jpegBuffer = resized.toJPEG(92);
  fs.writeFileSync(thumbPath, jpegBuffer);

  return `thumbnails/${thumbName}`;
}

export function getImageDimensions(filePath: string): { width: number; height: number } {
  try {
    if (!fs.existsSync(filePath)) return { width: 0, height: 0 };
    const buf = fs.readFileSync(filePath);
    const img = nativeImage.createFromBuffer(buf);
    if (img.isEmpty()) return { width: 0, height: 0 };
    return img.getSize();
  } catch {
    return { width: 0, height: 0 };
  }
}
