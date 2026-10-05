import api from './client';

export type AssetKind = 'image' | 'audio';

export interface Asset {
  id: string;
  kind: AssetKind;
  url: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  original_name: string;
}

/** Why the backend refused a file (422 INVALID_ASSET). */
export type AssetRejection = 'UNSUPPORTED_TYPE' | 'TOO_LARGE' | 'NOT_SQUARE' | 'TOO_LONG' | 'UNREADABLE';

const rejectionText: Record<AssetRejection, Record<AssetKind, string>> = {
  UNSUPPORTED_TYPE: {
    image: 'Gambar harus PNG atau WebP',
    audio: 'Suara harus MP3 atau AAC',
  },
  TOO_LARGE: {
    image: 'Ukuran gambar maksimal 500 KB',
    audio: 'Ukuran suara maksimal 300 KB',
  },
  NOT_SQUARE: { image: 'Gambar harus persegi (lebar = tinggi)', audio: 'File tidak bisa dibaca' },
  TOO_LONG: { image: 'File tidak bisa dibaca', audio: 'Suara maksimal 10 detik' },
  UNREADABLE: {
    image: 'Gambar tidak bisa dibaca (ukuran sisi 256–2048 px)',
    audio: 'Suara tidak bisa dibaca',
  },
};

/** Indonesian message for a failed upload. */
export function uploadErrorText(err: unknown, kind: AssetKind): string {
  const reason = (err as { response?: { data?: { reason?: AssetRejection } } })?.response?.data
    ?.reason;
  return reason ? rejectionText[reason][kind] : 'Gagal mengunggah file, coba lagi';
}

export const assetsApi = {
  upload: (file: File, kind: AssetKind, onProgress?: (percent: number) => void): Promise<Asset> => {
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', file);
    return api
      .post('/admin/assets', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
        },
      })
      .then((r) => r.data.data);
  },
};
