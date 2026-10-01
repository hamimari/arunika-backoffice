import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AccessCell from '../../components/AccessCell';

describe('AccessCell', () => {
  it('shows a free item, with its old price when it still has a product', () => {
    render(<AccessCell item={{ access: 'FREE', price_idr: 15000 }} />);
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText('was Rp 15.000')).toBeInTheDocument();
  });

  it('shows a free item that has no product', () => {
    render(<AccessCell item={{ access: 'FREE_NO_PRODUCT' }} />);
    expect(screen.getByText('Free (no product)')).toBeInTheDocument();
  });

  it('shows a paid item with its price', () => {
    render(<AccessCell item={{ access: 'PAID', price_idr: 29000 }} />);
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('Rp 29.000')).toBeInTheDocument();
  });

  it('shows a withdrawn paid item', () => {
    render(<AccessCell item={{ access: 'PAID_INACTIVE', price_idr: 29000 }} />);
    expect(screen.getByText('Paid (withdrawn)')).toBeInTheDocument();
  });

  it('shows a dash when the backend sent no access value', () => {
    render(<AccessCell item={{}} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
