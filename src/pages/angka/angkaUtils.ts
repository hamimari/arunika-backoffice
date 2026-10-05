import type { FieldError } from '../../api/huruf';

export const ANGKA_BLUE = '#255C9E';
export const RUST = '#C4581E';

/** Swatch colours for object chips and cards, cycling like the design. */
export const SWATCHES = ['#F8D9CF', '#D6E4F7', '#D3EDE8', '#F8E5BE', '#F6E6B4', '#E5DDF5'];

export const swatch = (i: number) => SWATCHES[i % SWATCHES.length];

/** Indonesian text for an Angka publish validation error. */
export function angkaFieldErrorText(e: FieldError): string {
  switch (e.code) {
    case 'REQUIRED':
      return 'Wajib diisi sebelum terbit';
    case 'TOO_LONG':
      return e.path.startsWith('question_audio') ? 'Suara maksimal 5 detik' : 'Terlalu panjang';
    case 'TOO_LARGE':
      return 'Gambar maksimal 300 KB';
    case 'NOT_TRANSPARENT':
      return 'Gambar harus berlatar transparan';
    case 'NOT_FOUND':
      return 'File tidak ditemukan, unggah ulang';
    case 'WRONG_KIND':
      return 'Jenis file salah';
    case 'INVALID_URL':
      return 'URL harus lengkap dan diawali https://';
    case 'NOT_PUBLISHED':
      return e.path === 'prerequisite_id' ? 'Level syarat harus sudah terbit' : 'Benda harus sudah terbit';
    case 'OUT_OF_RANGE':
      return outOfRange(e.path);
    case 'LESS_THAN_MIN':
      return 'Harus sama atau lebih dari jumlah paling sedikit';
    case 'GREATER_THAN_THREE':
      return '★★ tidak boleh lebih dari ★★★';
    case 'LESS_THAN_TWO':
      return '★★★ tidak boleh kurang dari ★★';
    case 'GREATER_THAN_QUESTIONS':
      return 'Tidak boleh lebih dari jumlah soal';
    case 'INVALID':
      return 'Pilih Tersebar atau Baris';
    case 'CYCLE':
      return 'Syarat level membentuk lingkaran';
    case 'NUMBER_AUDIO_MISSING':
      return e.path.startsWith('numbers.')
        ? `Angka ${e.path.slice('numbers.'.length)} belum punya suara yang terbit`
        : 'Suara angka 1 sampai jumlah ini harus terbit dulu — lihat peringatan di atas';
    default:
      return e.code;
  }
}

function outOfRange(path: string): string {
  switch (path) {
    case 'range.min':
    case 'range.max':
      return 'Antara 1 dan 20';
    case 'question_count':
      return 'Antara 5 dan 20 soal';
    default:
      return 'Di luar batas';
  }
}

/** The backend's 409 refusals, in Indonesian. */
export function conflictText(code: string | undefined): string | null {
  switch (code) {
    case 'OBJECT_IN_USE':
      return 'Benda ini dipakai di level, jadi tidak bisa dihapus. Sembunyikan saja agar tidak dipakai di soal baru.';
    case 'OBJECT_LAST_IN_LEVEL':
      return 'Benda ini satu-satunya benda tampil di level yang terbit. Tambahkan benda lain ke level itu dulu.';
    case 'LEVEL_IN_USE':
      return 'Level ini sudah pernah terbit atau menjadi syarat level lain, jadi tidak bisa dihapus.';
    default:
      return null;
  }
}

/** A fresh 32-bit seed for "Acak ulang". */
export const randomSeed = () => Math.floor(Math.random() * 0xffffffff);
