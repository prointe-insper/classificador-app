import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThresholdControl } from './ThresholdControl';

describe('ThresholdControl', () => {
  it('renders the slider with the current value', () => {
    render(<ThresholdControl value={0.5} onChange={() => {}} />);
    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider.value).toBe('0.5');
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('1');
    expect(slider.step).toBe('0.01');
  });

  it('calls onChange with the new numeric value on change', () => {
    const onChange = vi.fn();
    render(<ThresholdControl value={0.5} onChange={onChange} />);
    const slider = screen.getByRole('slider');

    fireEvent.change(slider, { target: { value: '0.73' } });

    expect(onChange).toHaveBeenCalledWith(0.73);
  });

  it('shows the value as a percentage', () => {
    render(<ThresholdControl value={0.6} onChange={() => {}} />);
    expect(screen.getByText('60%')).toBeInTheDocument();
  });
});
