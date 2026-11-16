import { FirebaseError } from 'firebase/app';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../config/firebase';
import { AppError } from '../lib/errors';
import { compressImage, FLYER_OPTIONS, IMAGE_OPTIONS, type CompressOptions } from '../lib/imageCompress';

/**
 * 画像の保存（Cloud Storage for Firebase）
 *
 * 保存先: users/{uid}/events/{eventId}/{時刻}_{連番}.jpg（storage.rules で、登録した本人と管理者だけが書き込める）
 * アップロード前に JPEG へ変換・圧縮する。戻り値はダウンロード URL。
 */

let uploadCount = 0;

export const eventImageFolder = (ownerUid: string, eventId: string): string => `users/${ownerUid}/events/${eventId}`;

async function upload(folder: string, file: Blob, options: CompressOptions): Promise<string> {
  try {
    const compressed = await compressImage(file, options);
    const fileRef = ref(storage, `${folder}/${Date.now()}_${uploadCount++}.jpg`);
    await uploadBytes(fileRef, compressed, {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000',
    });
    return await getDownloadURL(fileRef);
  } catch (e) {
    if (e instanceof AppError) throw e;
    console.error('[ImageStorage] 画像のアップロードに失敗', e);
    if (e instanceof FirebaseError && e.code === 'storage/unauthorized') {
      throw new AppError('画像をアップロードする権限がありません（イベントを登録した本人だけが画像を登録できます）', e.code);
    }
    throw new AppError('画像のアップロードに失敗しました');
  }
}

export const uploadEventImage = (ownerUid: string, eventId: string, file: Blob) =>
  upload(eventImageFolder(ownerUid, eventId), file, IMAGE_OPTIONS);

export const uploadEventFlyerImage = (ownerUid: string, eventId: string, file: Blob) =>
  upload(eventImageFolder(ownerUid, eventId), file, FLYER_OPTIONS);

/** Firebase Storage のダウンロード URL か */
export const isStorageUrl = (url: string): boolean =>
  url.startsWith('gs://') ||
  url.includes('firebasestorage.googleapis.com') ||
  url.includes('.firebasestorage.app') ||
  url.includes('/v0/b/'); // エミュレーター

/** 画像を削除する。Storage 以外の URL は何もしない。失敗しても例外は投げない */
export async function deleteImageByUrl(url: string): Promise<void> {
  if (!isStorageUrl(url)) return;
  try {
    await deleteObject(ref(storage, url));
  } catch (e) {
    console.warn('[ImageStorage] 画像の削除に失敗', e);
  }
}
