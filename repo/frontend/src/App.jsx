import { useEffect, useMemo, useState } from 'react';
import AuthPanel from './components/AuthPanel';
import CuratorTab from './components/CuratorTab';
import FeatureGuard from './components/FeatureGuard';
import GuidedNavigationTab from './components/GuidedNavigationTab';
import ProgramsTab from './components/ProgramsTab';
import RouteBuilderTab from './components/RouteBuilderTab';
import SearchDiscoveryTab from './components/SearchDiscoveryTab';
import StaffingTab from './components/StaffingTab';
import { useFormState } from './hooks/useFormState';
import { getInitialLoginForm } from './lib/auth-defaults';
import {
  apiBase,
  apiRequest,
  clearSecuritySensitiveClientState,
  setApiAuthContext,
  syncOfflineQueue
} from './lib/api';
import { clearQueuedWrites, getQueueSize } from './lib/offline';
import { tabs, hasTabAccess } from './lib/tabs';

const defaultAnalyticsForm = {
  metricKey: 'weekly_bookings',
  ruleKey: 'bookings_drop_wow_30',
  dashboardName: 'Operations Dashboard',
  reportName: 'Daily Program Reconciliation',
  reportDataset: 'program_registrations',
  reportFormat: 'CSV',
  reportTime: '02:00',
  reportTimezone: 'America/New_York'
};

const defaultAnalyticsState = {
  metric: null,
  anomalyRule: null,
  dashboard: null,
  reportDefinition: null,
  reportRuns: [],
  lastRun: null
};
const defaultExportForm = {
  resource: 'participants',
  format: 'CSV',
  fieldsText: 'name,phone,email,notes'
};
const defaultExportState = { exportJobId: '', exportResult: null, artifacts: [] };
const defaultInboxFilters = { unread: 'false', type: '' };
const defaultAuditFilters = {
  action: '',
  actorId: '',
  entityType: '',
  from: '',
  to: '',
  page: '1',
  pageSize: '20',
  sort: 'newest'
};
const defaultInboxState = { messages: [], selectedMessageId: '', printable: null };
const defaultAuditState = { events: [], pagination: null };

const getInitialTabFromHash = () => {
  const hash = window.location.hash.replace('#', '').trim();
  return tabs.some((tab) => tab.id === hash) ? hash : 'search';
};

function App() {
  const [activeTab, setActiveTab] = useState(getInitialTabFromHash());
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [auth, setAuth] = useState({
    user: null,
    csrfToken: '',
    stepUpToken: ''
  });
  const [queueSize, setQueueSize] = useState(getQueueSize());
  const [sessionNonce, setSessionNonce] = useState(0);

  const [loginForm, updateLogin, setLoginForm] = useFormState(getInitialLoginForm());
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [verifyAction, setVerifyAction] = useState('GRAPH_PUBLISH');
  const [pending, setPending] = useState({
    login: false,
    logout: false,
    refresh: false,
    stepUpVerify: false,
    queueSync: false,
    analytics: false,
    exports: false,
    inbox: false,
    audit: false
  });

  const [analyticsForm, updateAnalytics] = useFormState(defaultAnalyticsForm);
  const [exportForm, updateExportForm] = useFormState(defaultExportForm);
  const [inboxFilters, updateInboxFilters] = useFormState(defaultInboxFilters);
  const [auditFilters, updateAuditFilters] = useFormState(defaultAuditFilters);
  const [analyticsState, setAnalyticsState] = useState(defaultAnalyticsState);
  const [exportState, setExportState] = useState(defaultExportState);
  const [inboxState, setInboxState] = useState(defaultInboxState);
  const [auditState, setAuditState] = useState(defaultAuditState);

  const roles = auth.user?.roles || [];
  const allowedTabs = useMemo(() => tabs.filter((tab) => hasTabAccess(roles, tab.id)), [roles]);

  const hasAccess = (tabId) => hasTabAccess(roles, tabId);

  const setPendingState = (key, value) => setPending((prev) => ({ ...prev, [key]: value }));

  const resetSessionScopedState = () => {
    setSessionNonce((prev) => prev + 1);
    setAnalyticsState(defaultAnalyticsState);
    setExportState(defaultExportState);
    setInboxState(defaultInboxState);
    setAuditState(defaultAuditState);
    updateExportForm('resource', defaultExportForm.resource);
    updateExportForm('format', defaultExportForm.format);
    updateExportForm('fieldsText', defaultExportForm.fieldsText);
    updateInboxFilters('unread', defaultInboxFilters.unread);
    updateInboxFilters('type', defaultInboxFilters.type);
    updateAuditFilters('action', defaultAuditFilters.action);
    updateAuditFilters('actorId', defaultAuditFilters.actorId);
    updateAuditFilters('entityType', defaultAuditFilters.entityType);
    updateAuditFilters('from', defaultAuditFilters.from);
    updateAuditFilters('to', defaultAuditFilters.to);
    updateAuditFilters('page', defaultAuditFilters.page);
    updateAuditFilters('pageSize', defaultAuditFilters.pageSize);
    updateAuditFilters('sort', defaultAuditFilters.sort);
    setStepUpPassword('');
    setMessage('');
    setError('');
    setActiveTab('search');
    window.history.replaceState(null, '', '#search');
  };

  const runAction = async (key, fn) => {
    if (pending[key]) {
      return;
    }
    setPendingState(key, true);
    setError('');
    setMessage('');
    try {
      await fn();
      setQueueSize(getQueueSize());
    } catch (err) {
      setError(err.message || 'Request failed');
    } finally {
      setPendingState(key, false);
    }
  };

  useEffect(() => {
    const onOnline = async () => {
      const result = await syncOfflineQueue();
      setQueueSize(result.remaining);
      if (result.synced > 0) {
        setMessage(`Synced ${result.synced} queued write(s)`);
      }
    };
    const onStorage = () => setQueueSize(getQueueSize());
    const onHashChange = () => {
      const nextTab = getInitialTabFromHash();
      setActiveTab(nextTab);
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('storage', onStorage);
    window.addEventListener('hashchange', onHashChange);
    const interval = setInterval(() => setQueueSize(getQueueSize()), 4000);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('hashchange', onHashChange);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    setApiAuthContext({
      userId: auth.user?.id,
      csrfToken: auth.csrfToken,
      stepUpToken: auth.stepUpToken
    });
  }, [auth.user?.id, auth.csrfToken, auth.stepUpToken]);

  const navigateToTab = (tabId) => {
    setActiveTab(tabId);
    window.history.replaceState(null, '', `#${tabId}`);
  };

  const login = () =>
    runAction('login', async () => {
      const response = await apiRequest({ path: '/auth/login', method: 'POST', body: loginForm, allowQueue: false });
      const csrf = response.data?.csrfToken || '';
      const nextUser = response.data?.user || null;
      if (auth.user?.id && auth.user.id !== nextUser?.id) {
        clearQueuedWrites();
        await clearSecuritySensitiveClientState();
        resetSessionScopedState();
      }
      setAuth({ csrfToken: csrf, stepUpToken: '', user: nextUser });
      setLoginForm(getInitialLoginForm());
      setMessage(`Signed in as ${response.data.user.username}`);
    });

  const logout = () =>
    runAction('logout', async () => {
      await apiRequest({ path: '/auth/logout', method: 'POST', csrfToken: auth.csrfToken, allowQueue: false });
      clearQueuedWrites();
      await clearSecuritySensitiveClientState();
      resetSessionScopedState();
      setAuth({ user: null, csrfToken: '', stepUpToken: '' });
      setMessage('Signed out');
    });

  const refreshMe = () =>
    runAction('refresh', async () => {
      const response = await apiRequest({ path: '/auth/me', method: 'GET', allowQueue: false });
      setAuth((prev) => ({ ...prev, user: response.data.user }));
      setMessage('Session refreshed');
    });

  const acquireStepUpTokenFor = async (action) => {
    if (!stepUpPassword) {
      throw new Error('Enter step-up password before sensitive actions');
    }
    const response = await apiRequest({
      path: '/auth/step-up',
      method: 'POST',
      body: { password: stepUpPassword, action },
      csrfToken: auth.csrfToken,
      allowQueue: false
    });
    setAuth((prev) => ({ ...prev, stepUpToken: response.data.stepUpToken }));
    return response.data;
  };

  const verifyStepUp = () =>
    runAction('stepUpVerify', async () => {
      const result = await acquireStepUpTokenFor(verifyAction);
      setMessage(`Step-up token for ${result.action} valid until ${result.validUntil}`);
    });

  const syncQueueNow = () =>
    runAction('queueSync', async () => {
      const result = await syncOfflineQueue();
      setQueueSize(result.remaining);
      setMessage(`Synced ${result.synced}, remaining ${result.remaining}`);
    });

  const saveMetricAndRule = () =>
    runAction('analytics', async () => {
      const metric = await apiRequest({
        path: '/analytics/metrics',
        method: 'POST',
        csrfToken: auth.csrfToken,
        body: {
          key: analyticsForm.metricKey,
          name: 'Weekly Bookings',
          dataset: 'registrations',
          aggregation: 'count'
        }
      });
      const rule = await apiRequest({
        path: '/analytics/anomaly-rules',
        method: 'POST',
        csrfToken: auth.csrfToken,
        body: {
          ruleKey: analyticsForm.ruleKey,
          metricKey: analyticsForm.metricKey,
          thresholdPercent: 30,
          minBaselineCount: 20
        }
      });
      setAnalyticsState((prev) => ({ ...prev, metric: metric.data, anomalyRule: rule.data }));
      setMessage('Metric and anomaly rule saved');
    });

  const createDashboard = () =>
    runAction('analytics', async () => {
      const dash = await apiRequest({
        path: '/analytics/dashboards',
        method: 'POST',
        csrfToken: auth.csrfToken,
        body: {
          name: analyticsForm.dashboardName,
          tiles: [{ metric: analyticsForm.metricKey }],
          anomalyRules: [analyticsForm.ruleKey]
        }
      });
      const dashData = await apiRequest({
        path: `/analytics/dashboards/${dash.data.dashboardId}`,
        method: 'GET',
        allowQueue: false
      });
      setAnalyticsState((prev) => ({ ...prev, dashboard: dashData.data }));
      setMessage(`Dashboard created: ${dash.data.dashboardId}`);
    });

  const createReportDefinition = () =>
    runAction('analytics', async () => {
      const report = await apiRequest({
        path: '/analytics/reports',
        method: 'POST',
        csrfToken: auth.csrfToken,
        body: {
          name: analyticsForm.reportName,
          dataset: analyticsForm.reportDataset,
          format: analyticsForm.reportFormat,
          schedule: { time: analyticsForm.reportTime, timezone: analyticsForm.reportTimezone }
        }
      });
      setAnalyticsState((prev) => ({ ...prev, reportDefinition: report.data }));
      setMessage(`Report definition saved: ${report.data.reportId}`);
    });

  const runReportNow = () =>
    runAction('analytics', async () => {
      const reportId = analyticsState.reportDefinition?.reportId;
      if (!reportId) {
        throw new Error('Create report definition before running report');
      }
      const run = await apiRequest({
        path: `/analytics/reports/${reportId}/run`,
        method: 'POST',
        csrfToken: auth.csrfToken,
        allowQueue: false
      });
      const runs = await apiRequest({ path: `/analytics/reports/${reportId}/runs`, method: 'GET', allowQueue: false });
      setAnalyticsState((prev) => ({ ...prev, lastRun: run.data, reportRuns: runs.data || [] }));
      setMessage(`Report run completed: ${run.data.runId}`);
    });

  const requestExport = () =>
    runAction('exports', async () => {
      const fields = exportForm.fieldsText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      if (fields.length === 0) {
        throw new Error('At least one export field is required');
      }

      const stepUpData = await acquireStepUpTokenFor('EXPORT_CREATE');
      const created = await apiRequest({
        path: '/exports',
        method: 'POST',
        csrfToken: auth.csrfToken,
        stepUpToken: stepUpData.stepUpToken,
        body: {
          resource: exportForm.resource,
          format: exportForm.format,
          filters: {},
          fields
        },
        allowQueue: false
      });
      setExportState((prev) => ({
        ...prev,
        exportJobId: created.data.exportJobId,
        exportResult: { exportJobId: created.data.exportJobId, status: created.data.status }
      }));
      setMessage(`Export requested: ${created.data.exportJobId}`);
    });

  const refreshExportStatus = () =>
    runAction('exports', async () => {
      if (!exportState.exportJobId) {
        throw new Error('Request an export first');
      }
      const fetched = await apiRequest({ path: `/exports/${exportState.exportJobId}`, method: 'GET', allowQueue: false });
      setExportState((prev) => ({ ...prev, exportResult: fetched.data }));
      setMessage(`Export status: ${fetched.data.status}`);
    });

  const loadReconciliationArtifacts = () =>
    runAction('exports', async () => {
      const artifacts = await apiRequest({ path: '/admin/reconciliation/artifacts', method: 'GET', allowQueue: false });
      setExportState((prev) => ({ ...prev, artifacts: artifacts.data || [] }));
      setMessage(`Loaded ${artifacts.data?.length || 0} reconciliation artifacts`);
    });

  const loadInbox = () =>
    runAction('inbox', async () => {
      const query = {
        'filter[unread]': inboxFilters.unread
      };
      if (inboxFilters.type) {
        query['filter[type]'] = inboxFilters.type;
      }
      const response = await apiRequest({ path: '/inbox/messages', method: 'GET', query, allowQueue: false });
      setInboxState((prev) => ({ ...prev, messages: response.data || [] }));
      setMessage(`Loaded ${response.data?.length || 0} inbox messages`);
    });

  const readAndPrintMessage = () =>
    runAction('inbox', async () => {
      if (!inboxState.selectedMessageId) {
        throw new Error('Select a message id first');
      }
      const readResponse = await apiRequest({
        path: `/inbox/messages/${inboxState.selectedMessageId}/read`,
        method: 'POST',
        csrfToken: auth.csrfToken
      });
      const printable = await apiRequest({ path: `/inbox/messages/${inboxState.selectedMessageId}/print`, method: 'POST', csrfToken: auth.csrfToken, allowQueue: false });
      setInboxState((prev) => ({
        ...prev,
        messages: (prev.messages || []).map((item) =>
          item.id === inboxState.selectedMessageId ? { ...item, readAt: readResponse.data.readAt } : item
        ),
        printable: printable.data
      }));
      setMessage('Message marked read and printable payload fetched');
    });

  const loadAudit = () =>
    runAction('audit', async () => {
      const query = {
        page: auditFilters.page,
        pageSize: auditFilters.pageSize
      };
      if (auditFilters.action) query['filter[action]'] = auditFilters.action;
      if (auditFilters.actorId) query['filter[actorId]'] = auditFilters.actorId;
      if (auditFilters.entityType) query['filter[entityType]'] = auditFilters.entityType;
      if (auditFilters.from) query['filter[from]'] = auditFilters.from;
      if (auditFilters.to) query['filter[to]'] = auditFilters.to;

      const response = await apiRequest({ path: '/audit/events', method: 'GET', query, allowQueue: false });
      const events = [...(response.data || [])];
      if (auditFilters.sort === 'oldest') {
        events.sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
      }
      setAuditState({
        events,
        pagination: response.pagination
      });
      setMessage('Audit events loaded');
    });

  const statusClass = (value) => {
    const status = String(value || '').toUpperCase();
    if (['SUCCESS', 'COMPLETED', 'VALID', 'ACTIVE', 'TRIGGERED', 'READ'].includes(status)) {
      return 'status-badge status-success';
    }
    if (['FAILED', 'ERROR', 'INVALID', 'REJECTED'].includes(status)) {
      return 'status-badge status-error';
    }
    return 'status-badge status-pending';
  };

  const formatDateTime = (value) => {
    if (!value) {
      return '-';
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return String(value);
    }
    return parsed.toLocaleString();
  };

  const summarizeMetadata = (metadata) => {
    const entries = Object.entries(metadata || {});
    if (entries.length === 0) {
      return 'none';
    }
    return entries
      .slice(0, 3)
      .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
      .join(' | ');
  };

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <p className="product">Philatelic Museum Operations Suite</p>
          <h1>Operations Console</h1>
          <p className="hint">Backend API: {apiBase}</p>
        </div>
        <div className="status-grid">
          <span className={navigator.onLine ? 'pill online' : 'pill offline'}>{navigator.onLine ? 'Online' : 'Offline'}</span>
          <span className="pill">Queued writes: {queueSize}</span>
          <button className="ghost" onClick={syncQueueNow} disabled={pending.queueSync}>
            {pending.queueSync ? 'Syncing...' : 'Sync Queue'}
          </button>
        </div>
      </header>

      <AuthPanel
        loginForm={loginForm}
        updateLogin={updateLogin}
        login={login}
        refreshMe={refreshMe}
        logout={logout}
        pending={pending}
        stepUpPassword={stepUpPassword}
        setStepUpPassword={setStepUpPassword}
        verifyAction={verifyAction}
        setVerifyAction={setVerifyAction}
        verifyStepUp={verifyStepUp}
        user={auth.user}
      />

      <nav className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? 'tab active' : 'tab'}
            onClick={() => navigateToTab(tab.id)}
            disabled={!hasAccess(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {message ? <p className="notice ok">{message}</p> : null}
      {error ? <p className="notice err">{error}</p> : null}

      <section className="content-grid">
        {activeTab === 'search' ? (
          <FeatureGuard canAccess={hasAccess('search')} tabId="search">
            <SearchDiscoveryTab
              key={`search-${sessionNonce}`}
              apiRequest={apiRequest}
              csrfToken={auth.csrfToken}
              canCurateKeywords={hasAccess('curator')}
              setMessage={setMessage}
              setError={setError}
            />
          </FeatureGuard>
        ) : null}

        {activeTab === 'curator' ? (
          <FeatureGuard canAccess={hasAccess('curator')} tabId="curator">
            <CuratorTab
              key={`curator-${sessionNonce}`}
              apiRequest={apiRequest}
              csrfToken={auth.csrfToken}
              acquireStepUpTokenFor={acquireStepUpTokenFor}
              setMessage={setMessage}
              setError={setError}
            />
          </FeatureGuard>
        ) : null}

        {activeTab === 'routes' ? (
          <FeatureGuard canAccess={hasAccess('routes')} tabId="routes">
            <RouteBuilderTab
              key={`routes-${sessionNonce}`}
              apiRequest={apiRequest}
              csrfToken={auth.csrfToken}
              setMessage={setMessage}
              setError={setError}
              acquireStepUpTokenFor={acquireStepUpTokenFor}
            />
          </FeatureGuard>
        ) : null}

        {activeTab === 'navigation' ? (
          <FeatureGuard canAccess={hasAccess('navigation')} tabId="navigation">
            <GuidedNavigationTab
              key={`navigation-${sessionNonce}`}
              apiRequest={apiRequest}
              setMessage={setMessage}
              setError={setError}
            />
          </FeatureGuard>
        ) : null}

        {activeTab === 'programs' ? (
          <FeatureGuard canAccess={hasAccess('programs')} tabId="programs">
            <ProgramsTab
              key={`programs-${sessionNonce}`}
              apiRequest={apiRequest}
              csrfToken={auth.csrfToken}
              setMessage={setMessage}
              setError={setError}
            />
          </FeatureGuard>
        ) : null}

        {activeTab === 'staffing' ? (
          <FeatureGuard canAccess={hasAccess('staffing')} tabId="staffing">
            <StaffingTab
              key={`staffing-${sessionNonce}`}
              apiRequest={apiRequest}
              csrfToken={auth.csrfToken}
              roles={roles}
              acquireStepUpTokenFor={acquireStepUpTokenFor}
              setMessage={setMessage}
              setError={setError}
            />
          </FeatureGuard>
        ) : null}

        {activeTab === 'analytics' ? (
          <FeatureGuard canAccess={hasAccess('analytics')} tabId="analytics">
            <article className="card" key={`analytics-${sessionNonce}`}>
              <h2>Analytics Dashboards</h2>

              <section className="route-block">
                <h3>Step 1) Metric and Anomaly Rule</h3>
                <div className="row wrap">
                  <input value={analyticsForm.metricKey} onChange={(e) => updateAnalytics('metricKey', e.target.value)} placeholder="metric key" />
                  <input value={analyticsForm.ruleKey} onChange={(e) => updateAnalytics('ruleKey', e.target.value)} placeholder="anomaly rule key" />
                  <button onClick={saveMetricAndRule} disabled={pending.analytics}>{pending.analytics ? 'Saving...' : 'Save Metric + Rule'}</button>
                </div>
                <div className="summary-grid">
                  <div className="summary-card">
                    <p className="small">Metric</p>
                    <p>{analyticsState.metric?.key || 'not created'}</p>
                  </div>
                  <div className="summary-card">
                    <p className="small">Anomaly rule</p>
                    <p>{analyticsState.anomalyRule?.ruleKey || 'not created'}</p>
                  </div>
                </div>
              </section>

              <section className="route-block">
                <h3>Step 2) Dashboard</h3>
                <div className="row wrap">
                  <input value={analyticsForm.dashboardName} onChange={(e) => updateAnalytics('dashboardName', e.target.value)} placeholder="dashboard name" />
                  <button onClick={createDashboard} disabled={pending.analytics}>{pending.analytics ? 'Creating...' : 'Create Dashboard'}</button>
                </div>
                <p className="small">Dashboard ID: {analyticsState.dashboard?.dashboardId || 'none'}</p>
                {(analyticsState.dashboard?.tiles || []).length > 0 ? (
                  <table className="segment-table">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Current Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsState.dashboard.tiles.map((tile, index) => (
                        <tr key={`${tile.metric}-${index}`}>
                          <td>{tile.metric}</td>
                          <td>{tile.value ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="small">No dashboard tile data loaded yet.</p>
                )}
                {(analyticsState.dashboard?.anomalies || []).length > 0 ? (
                  <table className="segment-table">
                    <thead>
                      <tr>
                        <th>Rule</th>
                        <th>Status</th>
                        <th>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsState.dashboard.anomalies.map((item) => (
                        <tr key={item.rule}>
                          <td>{item.rule}</td>
                          <td><span className={statusClass(item.status)}>{item.status}</span></td>
                          <td>{item.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </section>

              <section className="route-block">
                <h3>Step 3) Report Definition and Runs</h3>
                <div className="row wrap">
                  <input value={analyticsForm.reportName} onChange={(e) => updateAnalytics('reportName', e.target.value)} placeholder="report name" />
                  <input value={analyticsForm.reportDataset} onChange={(e) => updateAnalytics('reportDataset', e.target.value)} placeholder="dataset" />
                  <select value={analyticsForm.reportFormat} onChange={(e) => updateAnalytics('reportFormat', e.target.value)}>
                    <option value="CSV">CSV</option>
                    <option value="JSON">JSON</option>
                  </select>
                  <input value={analyticsForm.reportTime} onChange={(e) => updateAnalytics('reportTime', e.target.value)} placeholder="02:00" />
                  <input value={analyticsForm.reportTimezone} onChange={(e) => updateAnalytics('reportTimezone', e.target.value)} placeholder="timezone" />
                  <button onClick={createReportDefinition} disabled={pending.analytics}>{pending.analytics ? 'Saving...' : 'Save Report Definition'}</button>
                  <button onClick={runReportNow} disabled={pending.analytics || !analyticsState.reportDefinition?.reportId}>{pending.analytics ? 'Running...' : 'Run Report Now'}</button>
                </div>

                <p className="small">Report ID: {analyticsState.reportDefinition?.reportId || 'none'}</p>
                {analyticsState.lastRun ? (
                  <div className="summary-grid">
                    <div className="summary-card"><p className="small">Last run</p><p>{analyticsState.lastRun.runId}</p></div>
                    <div className="summary-card"><p className="small">Status</p><p><span className={statusClass(analyticsState.lastRun.status)}>{analyticsState.lastRun.status}</span></p></div>
                    <div className="summary-card"><p className="small">Checksum</p><p>{analyticsState.lastRun.checksumSha256 || '-'}</p></div>
                  </div>
                ) : null}

                {analyticsState.reportRuns.length > 0 ? (
                  <table className="segment-table">
                    <thead>
                      <tr>
                        <th>Run ID</th>
                        <th>Status</th>
                        <th>Started</th>
                        <th>Finished</th>
                        <th>Artifact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsState.reportRuns.map((run) => (
                        <tr key={run.runId}>
                          <td>{run.runId}</td>
                          <td><span className={statusClass(run.status)}>{run.status}</span></td>
                          <td>{formatDateTime(run.startedAt)}</td>
                          <td>{formatDateTime(run.finishedAt)}</td>
                          <td>{run.artifactPath || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="small">No report runs yet.</p>
                )}
              </section>
            </article>
          </FeatureGuard>
        ) : null}

        {activeTab === 'exports' ? (
          <FeatureGuard canAccess={hasAccess('exports')} tabId="exports">
            <article className="card" key={`exports-${sessionNonce}`}>
              <h2>Exports & Reconciliation</h2>

              <section className="route-block">
                <h3>Step 1) Request Export</h3>
                <div className="row wrap">
                  <input value={exportForm.resource} onChange={(e) => updateExportForm('resource', e.target.value)} placeholder="resource" />
                  <select value={exportForm.format} onChange={(e) => updateExportForm('format', e.target.value)}>
                    <option value="CSV">CSV</option>
                    <option value="JSON">JSON</option>
                  </select>
                  <input value={exportForm.fieldsText} onChange={(e) => updateExportForm('fieldsText', e.target.value)} placeholder="fields csv" />
                  <button onClick={requestExport} disabled={pending.exports}>{pending.exports ? 'Submitting...' : 'Request Export (Step-Up)'}</button>
                </div>
                <p className="small">Export job id: {exportState.exportJobId || 'none'}</p>
              </section>

              <section className="route-block">
                <h3>Step 2) Track Job and Artifacts</h3>
                <div className="row wrap">
                  <button onClick={refreshExportStatus} disabled={pending.exports || !exportState.exportJobId}>{pending.exports ? 'Refreshing...' : 'Refresh Job Status'}</button>
                  <button onClick={loadReconciliationArtifacts} disabled={pending.exports}>{pending.exports ? 'Loading...' : 'Load Reconciliation Artifacts'}</button>
                </div>

                {exportState.exportResult ? (
                  <div className="summary-grid">
                    <div className="summary-card"><p className="small">Status</p><p><span className={statusClass(exportState.exportResult.status)}>{exportState.exportResult.status}</span></p></div>
                    <div className="summary-card"><p className="small">Artifact</p><p>{exportState.exportResult.artifactPath || '-'}</p></div>
                    <div className="summary-card"><p className="small">Checksum</p><p>{exportState.exportResult.checksumSha256 || '-'}</p></div>
                  </div>
                ) : (
                  <p className="small">No export job status loaded yet.</p>
                )}

                {(exportState.exportResult?.maskingPreview || []).length > 0 ? (
                  <table className="segment-table">
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Rule</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exportState.exportResult.maskingPreview.map((item, index) => (
                        <tr key={`${item.field}-${index}`}>
                          <td>{item.field}</td>
                          <td>{item.rule}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}

                {exportState.artifacts.length > 0 ? (
                  <table className="segment-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>ID</th>
                        <th>Status</th>
                        <th>Artifact</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exportState.artifacts.map((artifact) => (
                        <tr key={`${artifact.type}-${artifact.id}`}>
                          <td>{artifact.type}</td>
                          <td>{artifact.id}</td>
                          <td><span className={statusClass(artifact.status)}>{artifact.status}</span></td>
                          <td>{artifact.artifactPath || '-'}</td>
                          <td>{formatDateTime(artifact.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="small">No reconciliation artifacts loaded yet.</p>
                )}
              </section>
            </article>
          </FeatureGuard>
        ) : null}

        {activeTab === 'inbox' ? (
          <FeatureGuard canAccess={hasAccess('inbox')} tabId="inbox">
            <article className="card" key={`inbox-${sessionNonce}`}>
              <h2>Inbox Notifications</h2>
              <div className="row wrap">
                <select value={inboxFilters.unread} onChange={(e) => updateInboxFilters('unread', e.target.value)}>
                  <option value="false">read messages</option>
                  <option value="true">unread messages</option>
                </select>
                <input value={inboxFilters.type} onChange={(e) => updateInboxFilters('type', e.target.value)} placeholder="type filter" />
                <button onClick={loadInbox} disabled={pending.inbox}>{pending.inbox ? 'Loading...' : 'Load Inbox'}</button>
                <input value={inboxState.selectedMessageId} onChange={(e) => setInboxState((prev) => ({ ...prev, selectedMessageId: e.target.value }))} placeholder="message id" />
                <button onClick={readAndPrintMessage} disabled={pending.inbox || !inboxState.selectedMessageId}>{pending.inbox ? 'Processing...' : 'Read + Print'}</button>
              </div>

              {(inboxState.messages || []).length > 0 ? (
                <table className="segment-table">
                  <thead>
                    <tr>
                      <th>Message</th>
                      <th>Type</th>
                      <th>Title</th>
                      <th>Created</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inboxState.messages.map((item) => (
                      <tr key={item.id}>
                        <td>{item.id}</td>
                        <td>{item.type}</td>
                        <td>{item.title}</td>
                        <td>{formatDateTime(item.createdAt)}</td>
                        <td>
                          <span className={statusClass(item.readAt ? 'READ' : 'UNREAD')}>
                            {item.readAt ? 'READ' : 'UNREAD'}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => setInboxState((prev) => ({ ...prev, selectedMessageId: item.id }))}
                            className="ghost"
                          >
                            Select
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="small">No inbox messages for current filter.</p>
              )}

              {inboxState.printable?.printable ? (
                <table className="segment-table">
                  <thead>
                    <tr>
                      <th colSpan="2">Printable Payload ({inboxState.printable.messageId})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(inboxState.printable.printable).map(([key, value]) => (
                      <tr key={key}>
                        <td>{key}</td>
                        <td>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </article>
          </FeatureGuard>
        ) : null}

        {activeTab === 'audit' ? (
          <FeatureGuard canAccess={hasAccess('audit')} tabId="audit">
            <article className="card" key={`audit-${sessionNonce}`}>
              <h2>Audit View</h2>
              <div className="row wrap">
                <input value={auditFilters.action} onChange={(e) => updateAuditFilters('action', e.target.value)} placeholder="action" />
                <input value={auditFilters.actorId} onChange={(e) => updateAuditFilters('actorId', e.target.value)} placeholder="actor id" />
                <input value={auditFilters.entityType} onChange={(e) => updateAuditFilters('entityType', e.target.value)} placeholder="entity type" />
                <input value={auditFilters.from} onChange={(e) => updateAuditFilters('from', e.target.value)} placeholder="from ISO date" />
                <input value={auditFilters.to} onChange={(e) => updateAuditFilters('to', e.target.value)} placeholder="to ISO date" />
                <input value={auditFilters.page} onChange={(e) => updateAuditFilters('page', e.target.value)} placeholder="page" />
                <input value={auditFilters.pageSize} onChange={(e) => updateAuditFilters('pageSize', e.target.value)} placeholder="page size" />
                <select value={auditFilters.sort} onChange={(e) => updateAuditFilters('sort', e.target.value)}>
                  <option value="newest">newest first</option>
                  <option value="oldest">oldest first</option>
                </select>
                <button onClick={loadAudit} disabled={pending.audit}>{pending.audit ? 'Loading...' : 'Load Audit Events'}</button>
              </div>
              <p className="small">
                Events: {auditState.events?.length || 0}
                {auditState.pagination
                  ? ` | page ${auditState.pagination.page} of ${auditState.pagination.totalPages}`
                  : ''}
              </p>
              {(auditState.events || []).length > 0 ? (
                <table className="segment-table">
                  <thead>
                    <tr>
                      <th>Created</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Entity</th>
                      <th>Metadata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditState.events.map((event) => (
                      <tr key={event.id}>
                        <td>{formatDateTime(event.createdAt)}</td>
                        <td>{event.actorId}</td>
                        <td>{event.action}</td>
                        <td>{event.entityType} / {event.entityId}</td>
                        <td>{summarizeMetadata(event.metadata)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="small">No audit events found for this filter set.</p>
              )}
            </article>
          </FeatureGuard>
        ) : null}
      </section>

      <footer className="footer">Allowed tabs: {allowedTabs.map((tab) => tab.label).join(' | ') || 'none'}</footer>
    </main>
  );
}

export default App;
