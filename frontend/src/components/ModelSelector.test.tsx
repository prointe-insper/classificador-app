import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModelSelector } from './ModelSelector';
import type { ModelOption } from '../types';

const ONE: ModelOption[] = [
  { id: 'm1', name: 'Modelo 1', description: 'desc 1', is_default: true },
];

const TWO: ModelOption[] = [
  ...ONE,
  { id: 'm2', name: 'Modelo 2', description: 'desc 2', is_default: false },
];

describe('ModelSelector', () => {
  it('renders the options and shows the selected description', () => {
    render(<ModelSelector models={ONE} value="m1" onChange={() => {}} />);
    const select = screen.getByTestId('model-select') as HTMLSelectElement;
    expect(select.value).toBe('m1');
    expect(screen.getByText('desc 1')).toBeInTheDocument();
  });

  it('disables the select and shows a hint when there is a single model', () => {
    render(<ModelSelector models={ONE} value="m1" onChange={() => {}} />);
    expect((screen.getByTestId('model-select') as HTMLSelectElement).disabled).toBe(
      true,
    );
    expect(screen.getByText(/Mais modelos/i)).toBeInTheDocument();
  });

  it('lets the user pick another model when several exist', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ModelSelector models={TWO} value="m1" onChange={onChange} />);
    const select = screen.getByTestId('model-select') as HTMLSelectElement;
    expect(select.disabled).toBe(false);
    await user.selectOptions(select, 'm2');
    expect(onChange).toHaveBeenCalledWith('m2');
  });
});
