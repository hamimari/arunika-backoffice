import { Button, Tabs, Typography, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { angkaApi } from '../../api/angka';
import LevelsTab from './LevelsTab';
import ObjectsTab from './ObjectsTab';
import NumbersTab from './NumbersTab';

const { Text, Paragraph } = Typography;

type TabKey = 'levels' | 'objects' | 'numbers';
const TABS: TabKey[] = ['levels', 'objects', 'numbers'];

/** "Konten Belajar › Angka": Hitung Benda levels, the object library and the
 *  Kenal Angka numbers. The tab lives in the URL (?tab=). */
export default function AngkaPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as TabKey | null;
  const tab: TabKey = raw && TABS.includes(raw) ? raw : 'levels';

  const levels = useQuery({ queryKey: ['angka-levels'], queryFn: angkaApi.levels.list });
  const objects = useQuery({ queryKey: ['angka-objects'], queryFn: angkaApi.objects.list });
  const numbers = useQuery({ queryKey: ['angka-numbers'], queryFn: angkaApi.numbers.list });
  const shownNumbers = (numbers.data ?? []).filter((n) => n.status === 'published').length;

  const create = useMutation({
    mutationFn: angkaApi.levels.create,
    onSuccess: (level) => {
      queryClient.invalidateQueries({ queryKey: ['angka-levels'] });
      navigate(`/angka/levels/${level.id}`);
    },
    onError: () => message.error('Gagal menambah level'),
  });

  const setTab = (key: TabKey) => setParams(key === 'levels' ? {} : { tab: key });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <Text type="secondary">Konten Belajar / Angka</Text>
          <h2 style={{ margin: '4px 0' }}>Belajar Angka</h2>
          <Paragraph type="secondary">
            Atur level Hitung Benda, pustaka benda, dan kartu Kenal Angka yang tampil di aplikasi.
          </Paragraph>
        </div>
        {tab === 'levels' && (
          <Button type="primary" icon={<PlusOutlined />} loading={create.isPending} onClick={() => create.mutate()}>
            Tambah level
          </Button>
        )}
      </div>
      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as TabKey)}
        items={[
          {
            key: 'levels',
            label: `Level Hitung Benda · ${levels.data?.length ?? 0}`,
            children: (
              <LevelsTab
                levels={levels.data ?? []}
                objects={objects.data ?? []}
                loading={levels.isLoading}
                onManageObjects={() => setTab('objects')}
              />
            ),
          },
          {
            key: 'objects',
            label: `Pustaka benda · ${objects.data?.length ?? 0}`,
            children: <ObjectsTab objects={objects.data ?? []} loading={objects.isLoading} />,
          },
          {
            key: 'numbers',
            label: `Kenal Angka · ${shownNumbers}`,
            children: (
              <NumbersTab numbers={numbers.data ?? []} objects={objects.data ?? []} loading={numbers.isLoading} />
            ),
          },
        ]}
      />
    </>
  );
}
