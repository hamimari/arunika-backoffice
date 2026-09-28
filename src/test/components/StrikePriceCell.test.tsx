import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StrikePriceCell from '../../components/StrikePriceCell';

const none = { strike_price_idr: null, discount_percent: null, promo_ends_at: null };

describe('StrikePriceCell', () => {
  it('shows the effective strike price, badge and end date of an item promo', () => {
    render(
      <StrikePriceCell
        item={{
          strike_mode: 'FIXED',
          strike_price_idr: 20000,
          discount_percent: 25,
          promo_ends_at: '2026-10-31T16:59:00Z',
        }}
      />,
    );
    expect(screen.getByText('Rp 20.000')).toBeInTheDocument();
    expect(screen.getByText('-25%')).toBeInTheDocument();
    expect(screen.getByText(/s\/d 31 Okt 2026/)).toBeInTheDocument();
    expect(screen.getByText('Own promo')).toBeInTheDocument();
  });

  it('marks an item that inherits the global rule', () => {
    render(<StrikePriceCell item={{ strike_mode: null, ...none }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Global')).toBeInTheDocument();
  });

  it('marks an item opted out of every promo', () => {
    render(<StrikePriceCell item={{ strike_mode: 'NONE', ...none }} />);
    expect(screen.getByText('Off for this item')).toBeInTheDocument();
  });
});
