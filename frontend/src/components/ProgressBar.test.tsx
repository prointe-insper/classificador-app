import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  it('shows the done/total count and the current document', () => {
    render(<ProgressBar done={2} total={5} current="peticao3.pdf" />);
    expect(screen.getByTestId('progress-count')).toHaveTextContent('2 de 5');
    expect(screen.getByText('peticao3.pdf')).toBeInTheDocument();
  });

  it('reflects progress in the progressbar aria attributes', () => {
    render(<ProgressBar done={3} total={4} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuemax', '4');
    expect(bar.style.width).toBe('75%');
  });

  it('does not divide by zero when total is 0', () => {
    render(<ProgressBar done={0} total={0} />);
    expect(screen.getByRole('progressbar').style.width).toBe('0%');
  });
});
