import { Tag } from 'antd';
import { statusGroup, type StatusItem } from './contentUtils';

/** Terbit / Ada perubahan / Draft / Disembunyikan. */
export default function StatusTag({ item }: { item: StatusItem }) {
  switch (statusGroup(item)) {
    case 'hidden':
      return <Tag>Disembunyikan</Tag>;
    case 'draft':
      return <Tag color="gold">Draft</Tag>;
    default:
      return item.has_unpublished_changes ? (
        <Tag color="orange">Ada perubahan</Tag>
      ) : (
        <Tag color="green">Terbit</Tag>
      );
  }
}
