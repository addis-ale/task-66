import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProgramsTab from '../../src/components/ProgramsTab';
import StaffingTab from '../../src/components/StaffingTab';

describe('Programs and staffing retry behavior', () => {
  it('retries failed program creation and succeeds on second attempt', async () => {
    const user = userEvent.setup();
    const setError = vi.fn();
    const setMessage = vi.fn();
    const apiRequest = vi
      .fn()
      .mockRejectedValueOnce(new Error('Transient failure'))
      .mockResolvedValueOnce({ data: { id: 'prog_1', title: 'Docent Basics', type: 'DOCENT_TRAINING', capacity: 2 } });

    render(<ProgramsTab apiRequest={apiRequest} csrfToken="csrf" setMessage={setMessage} setError={setError} />);

    await user.click(screen.getByRole('button', { name: 'Create Program' }));
    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith('Transient failure');
    });

    await user.click(screen.getByRole('button', { name: 'Create Program' }));
    await waitFor(() => {
      expect(setMessage).toHaveBeenCalledWith('Program created: Docent Basics');
    });
  }, 15000);

  it('retries step-up protected staffing approval after failure', async () => {
    const user = userEvent.setup();
    const setError = vi.fn();
    const setMessage = vi.fn();
    const acquireStepUpTokenFor = vi
      .fn()
      .mockRejectedValueOnce(new Error('Step-up denied'))
      .mockResolvedValueOnce({ stepUpToken: 'stp_ok' });

    const apiRequest = vi.fn(async (request) => {
      if (request.path === '/jobs') {
        return { data: { jobId: 'job_1', state: 'DRAFT' } };
      }
      if (request.path === '/jobs/job_1/submit') {
        return { data: { jobId: 'job_1', state: 'PENDING_APPROVAL' } };
      }
      if (request.path === '/jobs/job_1/approve') {
        return { data: { jobId: 'job_1', state: 'PUBLISHED' } };
      }
      return { data: {} };
    });

    render(
      <StaffingTab
        apiRequest={apiRequest}
        csrfToken="csrf"
        roles={['Administrator']}
        acquireStepUpTokenFor={acquireStepUpTokenFor}
        setMessage={setMessage}
        setError={setError}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Create Draft' }));
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'job_1');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await user.click(screen.getByRole('button', { name: 'Approve (Step-Up)' }));
    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith('Step-up denied');
    });

    await user.click(screen.getByRole('button', { name: 'Approve (Step-Up)' }));
    await waitFor(() => {
      expect(setMessage).toHaveBeenCalledWith('Job approved and published');
    });
  }, 15000);
});
