import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Explanation } from './Explanation';
import type { ExplanationItem } from '../types';

const TOKENS: ExplanationItem[] = [
  { token: 'icms declarado', weight: 1.23 },
  { token: 'isento', weight: -0.8 },
  { token: 'tributo', weight: 0.4 },
];

describe('Explanation', () => {
  it('renders one chip per token', () => {
    render(<Explanation explanation={TOKENS} />);
    expect(screen.getAllByTestId('explanation-chip')).toHaveLength(3);
  });

  it('applies distinct classes to positive and negative weights', () => {
    render(<Explanation explanation={TOKENS} />);
    const positive = screen.getByText('icms declarado').closest('.chip');
    const negative = screen.getByText('isento').closest('.chip');

    expect(positive?.className).toContain('chip--positive');
    expect(positive?.getAttribute('data-sign')).toBe('positive');

    expect(negative?.className).toContain('chip--negative');
    expect(negative?.getAttribute('data-sign')).toBe('negative');
  });

  it('mentions TreeSHAP in the caption', () => {
    render(<Explanation explanation={TOKENS} />);
    expect(screen.getByText(/TreeSHAP/i)).toBeInTheDocument();
  });

  it('renders nothing when there are no tokens', () => {
    const { container } = render(<Explanation explanation={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
