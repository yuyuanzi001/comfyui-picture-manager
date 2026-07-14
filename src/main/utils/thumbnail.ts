import { nativeImage } from 'electron';
import fs from 'fs';
import path from 'path';

const DEFAULT_THUMB_SIZE = 256;

/**
 * Generate a JPEG thumbnail using Electron's native image handling.
 * Returns the relative path for storage in the database.
 */
export function generateThumbnail(
  sourcePath: string,
  thumbDir: string,
  uuid: string,
  size: number = DEFAULT_THUMB_SIZE
): string {
  const thumbName = `${uuid}.jpg`;
  const thumbPath = path.join(thumbDir, thumbName);

  // Read the original image
  const img = nativeImage.createFromPath(sourcePath);

  if (img.isEmpty()) {
    throw new Error(`Cannot read image: ${sourcePath}`);
  }

  // Get original dimensions
  const origSize = img.getSize();
  const aspectRatio = origSize.width / origSize.height;

  let targetWidth: number;
  let targetHeight: number;

  if (origSize.width > origSize.height) {
    targetWidth = size;
    targetHeight = Math.round(size / aspectRatio);
  } else {
    targetHeight = size;
    targetWidth = Math.round(size * aspectRatio);
  }

  // Resize the image
  const resized = img.resize({
    width: targetWidth,
    height: targetHeight,
    quality: 'good',
  });

  // Convert to JPEG buffer
  const jpegBuffer = resized.toJPEG(80);

  // Write to disk
  fs.writeFileSync(thumbPath, jpegBuffer);

  return `thumbnails/${thumbName}`;
}

/**
 * Get image dimensions from file.
 */
export function getImageDimensions(filePath: string): { width: number; height: number } {
  try {
    const img = nativeImage.createFromPath(filePath);
    if (img.isEmpty()) {
      return { width: 0, height: 0 };
    }
    return img.getSize();
  } catch {
    return { width: 0, height: 0 };
  }
}
