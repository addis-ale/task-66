import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RouteBuilderTab from '../../src/components/RouteBuilderTab';

describe('RouteBuilderTab integration', () => {
  it('shows validation feedback and generates itinerary after valid setup', async () => {
    const user = userEvent.setup();
    let caseCounter = 0;

    const apiRequest = vi.fn(async (request) => {
      if (request.path === '/venues') {
        return { data: { id: 'venue_1' } };
      }
      if (request.path === '/venues/venue_1/halls') {
        return { data: { id: 'hall_1' } };
      }
      if (request.path === '/halls/hall_1/zones') {
        return { data: { id: 'zone_1' } };
      }
      if (request.path === '/routes') {
        return { data: { routeId: 'rte_1' } };
      }
      if (request.path === '/zones/zone_1/display-cases') {
        caseCounter += 1;
        return { data: { id: `case_${caseCounter}`, name: `Case ${caseCounter}` } };
      }
      if (request.path === '/routes/rte_1/segments') {
        return { data: { ok: true } };
      }
      if (request.path === '/routes/rte_1/itineraries') {
        return {
          data: {
            estimatedWalkMinutes: 10.5,
            printable: {
              estimatedWalkMinutes: 10.5,
              steps: [
                {
                  step: 1,
                  segmentType: 'REQUIRED_NEXT',
                  fromCaseId: 'case_1',
                  toCaseId: 'case_2',
                  distanceMeters: 40,
                  dwellMinutes: 4
                }
              ]
            }
          }
        };
      }
      return { data: {} };
    });

    render(
      <RouteBuilderTab
        apiRequest={apiRequest}
        csrfToken="csrf"
        setMessage={vi.fn()}
        setError={vi.fn()}
        acquireStepUpTokenFor={vi.fn().mockResolvedValue({ stepUpToken: 'stp' })}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Use Node Picks' }));
    expect(screen.getByText('Pick two nodes on the canvas first.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Create Hierarchy + Route' }));
    await user.click(screen.getByRole('button', { name: 'Add Case Node' }));
    await user.click(screen.getByRole('button', { name: 'Add Case Node' }));

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[0], 'case_1');
    await user.selectOptions(selects[1], 'case_2');

    await user.click(screen.getByRole('button', { name: 'Add Segment' }));
    await user.click(screen.getByRole('button', { name: 'Commit Segments To API' }));
    await user.click(screen.getByRole('button', { name: 'Generate Itinerary' }));

    await waitFor(() => {
      expect(screen.getByText(/Estimated walk time: 10.5 minutes/)).toBeTruthy();
      expect(screen.getAllByText(/REQUIRED_NEXT/).length).toBeGreaterThan(0);
    });
  }, 15000);
});
