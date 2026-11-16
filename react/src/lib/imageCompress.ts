import { AppError } from './errors';

/**
 * 画像を JPEG に変換して圧縮する（ブラウザの canvas を使う）
 *
 * Flutter 版の compressImageForUpload と同じ手順:
 * 1. 最大幅まで縮小  2. 品質 85 から 10 ずつ下げる（20 まで）  3. まだ大きければ 0.8 倍ずつ縮小（品質 60）
 */
export interface CompressOptions {
  maxWidth: number;
  maxSizeKB: number;
}

export const IMAGE_OPTIONS: CompressOptions = { maxWidth: 1200, maxSizeKB: 1024 };
/** フライヤー（A4 チラシ）は文字を読めるよう大きめ（storage.rules の上限 2MB 未満） */
export const FLYER_OPTIONS: CompressOptions = { maxWidth: 1600, maxSizeKB: 1536 };

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file);
  } catch {
    // createImageBitmap が使えない・失敗したブラウザ向け
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } catch {
      throw new AppError('画像を読み込めませんでした。JPEG / PNG などの画像を選んでください');
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function toJpeg(source: CanvasImageSource, width: number, height: number, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new AppError('画像の変換に失敗しました');
  // 透過 PNG の透明部分が黒くならないよう白で塗る
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new AppError('画像の変換に失敗しました'))),
      'image/jpeg',
      quality / 100,
    ),
  );
}

export async function compressImage(file: Blob, options: CompressOptions): Promise<Blob> {
  const image = await decode(file);
  const srcW = image.width;
  const srcH = image.height;
  if (!srcW || !srcH) throw new AppError('画像を読み込めませんでした。JPEG / PNG などの画像を選んでください');

  const maxBytes = options.maxSizeKB * 1024;
  let width = Math.min(srcW, options.maxWidth);
  let height = Math.round((srcH * width) / srcW);

  let quality = 85;
  let blob = await toJpeg(image, width, height, quality);
  while (blob.size > maxBytes && quality > 20) {
    quality -= 10;
    blob = await toJpeg(image, width, height, quality);
  }
  while (blob.size > maxBytes && width > 200) {
    width = Math.round(width * 0.8);
    height = Math.round((srcH * width) / srcW);
    blob = await toJpeg(image, width, height, 60);
  }
  if ('close' in image) image.close();
  return blob;
}

/** 1.2 KB / 3.4 MB */
export function formatSize(bytes: number): string {
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}
