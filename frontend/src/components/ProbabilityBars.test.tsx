import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ProbabilityBars } from './ProbabilityBars';
import type { ProbabilityItem } from '../types';

const PROBS: ProbabilityItem[] = [
  { label: 'Outro', probability: 0.1 },
  { label: 'ICMS Declarado', probability: 0.7 },
  { label: 'IPVA', probability: 0.2 },
];

describe('ProbabilityBars', () => {
  it('renders one bar per label', () => {
    render(<ProbabilityBars probabilities={PROBS} />);
    expect(screen.getAllByTestId('prob-bar')).toHaveLength(3);
  });

  it('renders bars sorted descending by probability', () => {
    render(<ProbabilityBars probabilities={PROBS} />);
    const bars = screen.getAllByTestId('prob-bar');
    const labels = bars.map(
      (bar) => within(bar).getByTitle(/.*/).textContent,
    );
    expect(labels).toEqual(['ICMS Declarado', 'IPVA', 'Outro']);
  });

  it('shows percentages', () => {
    render(<ProbabilityBars probabilities={PROBS} />);
    expect(screen.getByText('70,0%')).toBeInTheDocument();
    expect(screen.getByText('20,0%')).toBeInTheDocument();
    expect(screen.getByText('10,0%')).toBeInTheDocument();
  });

  it('highlights the top bar with the bar--top class', () => {
    render(<ProbabilityBars probabilities={PROBS} />);
    const bars = screen.getAllByTestId('prob-bar');
    expect(bars[0].className).toContain('bar--top');
    expect(bars[1].className).not.toContain('bar--top');
  });
});
