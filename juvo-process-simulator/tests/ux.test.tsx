import { act, render, screen, within } from '@testing-library/react';
import App from '../src/App';
import { useStore } from '../src/store/store';

describe('first load', () => {
  it('shows a working flowsheet with results and no user input', async () => {
    render(<App />);
    const strip = screen.getByTestId('result-strip');
    expect(within(strip).getByText('1,050')).toBeTruthy();
    expect(within(strip).getByText('Cup chest freezers')).toBeTruthy();
    expect(within(strip).getByText('A$3.21')).toBeTruthy();
    expect(within(strip).getByText('20 min of 30')).toBeTruthy();
    expect(screen.getByLabelText('Fleet size')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Flowsheet' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Results' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Floor plan' })).toBeTruthy();
  });

  it('Simple mode shows exactly 6 fields per equipment', async () => {
    render(<App />);
    for (const id of ['n2', 'n8']) {
      act(() => useStore.setState({ selectedNodeId: id, editorOpen: true, mode: 'simple' }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getAllByTestId('field')).toHaveLength(6);
    }
    act(() => useStore.setState({ mode: 'advanced' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByTestId('field').length).toBeGreaterThan(6);
  });
});
