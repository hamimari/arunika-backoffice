import { Tag } from 'antd';
import type { HurufLetterRow } from '../../api/huruf';
import { statusGroup } from './hurufUtils';

/** Terbit / Ada perubahan / Draft / Disembunyikan. */
export default function StatusTag({ letter }: { letter: HurufLetterRow }) {
  switch (statusGroup(letter)) {
    case 'hidden':
      return <Tag>Disembunyikan</Tag>;
    case 'draft':
      return <Tag color="gold">Draft</Tag>;
    default:
      return letter.has_unpublished_changes ? (
        <Tag color="orange">Ada perubahan</Tag>
      ) : (
        <Tag color="green">Terbit</Tag>
      );
  }
}
