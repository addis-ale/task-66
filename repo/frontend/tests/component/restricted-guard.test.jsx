import { render, screen } from '@testing-library/react';
import FeatureGuard from '../../src/components/FeatureGuard';

describe('FeatureGuard', () => {
  it('renders forbidden state when user lacks access', () => {
    render(
      <FeatureGuard canAccess={false} tabId="curator">
        <div>Restricted Content</div>
      </FeatureGuard>
    );

    expect(screen.getByText('Curator Administration')).toBeTruthy();
    expect(screen.getByText(/Forbidden: insufficient permission/i)).toBeTruthy();
    expect(screen.queryByText('Restricted Content')).toBeNull();
  });

  it('renders content when access is granted', () => {
    render(
      <FeatureGuard canAccess tabId="curator">
        <div>Restricted Content</div>
      </FeatureGuard>
    );
    expect(screen.getByText('Restricted Content')).toBeTruthy();
  });
});
