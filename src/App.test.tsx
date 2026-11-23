import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

const KEY = 'nudge-desk:store';

describe('Nudge Desk', () => {
  it('groups follow-ups by urgency', () => {
    window.location.hash = '/today';
    render(<App />);
    const overdue = screen.getByRole('heading', { name: /^Overdue/ }).closest('section')!;
    expect(within(overdue).getByText('Tom Okoye')).toBeInTheDocument();
    expect(screen.getAllByText('Cold').length).toBeGreaterThan(0);
  });

  it('snoozes a person out of the overdue list', async () => {
    window.location.hash = '/today';
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Snooze Tom Okoye for a week' }));
    const overdue = screen.queryByRole('heading', { name: /^Overdue/ })?.closest('section');
    expect(overdue ? within(overdue).queryByText('Tom Okoye') : null).toBeNull();
  });

  it('logs an interaction inline with validation', async () => {
    window.location.hash = '/today';
    const user = userEvent.setup();
    render(<App />);
    const row = screen.getByText('Tom Okoye').closest('li')!;
    await user.click(within(row).getByRole('button', { name: 'Log interaction' }));
    const form = within(row).getByRole('form', { name: 'Log an interaction with Tom Okoye' });
    await user.click(within(form).getByRole('button', { name: 'Save interaction' }));
    expect(within(form).getByText('Write a line about what was said.')).toBeInTheDocument();
    await user.type(within(form).getByLabelText('What happened'), 'Sent the revised quote.');
    await user.click(within(form).getByRole('button', { name: 'Save interaction' }));
    expect(screen.queryByRole('form', { name: 'Log an interaction with Tom Okoye' })).not.toBeInTheDocument();
  });

  it('adds a person who becomes due today', async () => {
    localStorage.setItem(KEY, JSON.stringify({ people: [], log: [] }));
    window.location.hash = '/people';
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Add person' }));
    expect(screen.getByText('Enter a name.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Name'), 'Priya');
    await user.click(screen.getByRole('button', { name: 'Add person' }));
    expect(await screen.findByRole('heading', { name: 'Priya' })).toBeInTheDocument();
    expect(screen.getByTestId('next')).toHaveTextContent('today');
  });

  it('moves someone along the pipeline and shows activity', async () => {
    window.location.hash = '/pipeline';
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.click(screen.getByRole('button', { name: 'Move Mei Chen to Reached out' }));
    const col = screen.getByRole('heading', { name: /Reached out/ }).closest('section')!;
    expect(within(col).getByText('Mei Chen')).toBeInTheDocument();
    unmount();
    window.location.hash = '/activity';
    render(<App />);
    expect(screen.getByRole('img', { name: /Week of/ })).toBeInTheDocument();
  });
});
