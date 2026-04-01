import { useMemo, useState } from 'react';

const defaultJobForm = {
  department: 'Events',
  title: 'Weekend Exhibit Assistant',
  description: 'Support visitors and maintain exhibit floor readiness',
  shiftInfo: 'Sat-Sun 10:00-16:00'
};

function StaffingTab({ apiRequest, csrfToken, roles, acquireStepUpTokenFor, setMessage, setError }) {
  const [jobForm, setJobForm] = useState(defaultJobForm);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [appealId, setAppealId] = useState('');
  const [decision, setDecision] = useState('APPROVE');
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState('');
  const [state, setState] = useState({
    jobs: [],
    history: null
  });

  const canEdit = roles.includes('Administrator') || roles.includes('Employer');
  const canApprove = roles.includes('Administrator') || roles.includes('Reviewer');
  const canRead =
    roles.includes('Administrator') ||
    roles.includes('Employer') ||
    roles.includes('Reviewer') ||
    roles.includes('Auditor');

  const selectedJob = useMemo(
    () => state.jobs.find((item) => item.jobId === selectedJobId),
    [state.jobs, selectedJobId]
  );

  const run = async (key, fn) => {
    if (pending) {
      return;
    }
    setPending(key);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (err) {
      setError(err.message || 'Staffing action failed');
    } finally {
      setPending('');
    }
  };

  const createDraft = () =>
    run('create-draft', async () => {
      const response = await apiRequest({ path: '/jobs', method: 'POST', csrfToken, body: jobForm });
      setState((prev) => ({
        ...prev,
        jobs: [...prev.jobs, { jobId: response.data.jobId, state: response.data.state }]
      }));
      setSelectedJobId(response.data.jobId);
      setMessage(`Job draft created: ${response.data.jobId}`);
    });

  const updateDraft = () =>
    run('update-draft', async () => {
      if (!selectedJobId) {
        throw new Error('Select a job first');
      }
      const response = await apiRequest({
        path: `/jobs/${selectedJobId}`,
        method: 'PATCH',
        csrfToken,
        body: jobForm
      });
      setState((prev) => ({
        ...prev,
        jobs: prev.jobs.map((job) => (job.jobId === selectedJobId ? { ...job, state: response.data.state } : job))
      }));
      setMessage('Draft updated');
    });

  const submitForApproval = () =>
    run('submit-job', async () => {
      if (!selectedJobId) {
        throw new Error('Select a job first');
      }
      const response = await apiRequest({ path: `/jobs/${selectedJobId}/submit`, method: 'POST', csrfToken });
      setState((prev) => ({
        ...prev,
        jobs: prev.jobs.map((job) => (job.jobId === selectedJobId ? { ...job, state: response.data.state } : job))
      }));
      setMessage('Job submitted for approval');
    });

  const approveJob = () =>
    run('approve-job', async () => {
      if (!selectedJobId) {
        throw new Error('Select a job first');
      }
      const stepUp = await acquireStepUpTokenFor('JOB_APPROVE');
      const response = await apiRequest({
        path: `/jobs/${selectedJobId}/approve`,
        method: 'POST',
        csrfToken,
        stepUpToken: stepUp.stepUpToken,
        allowQueue: false,
        body: { comment: comment || 'Approved in staffing console' }
      });
      setState((prev) => ({
        ...prev,
        jobs: prev.jobs.map((job) => (job.jobId === selectedJobId ? { ...job, state: response.data.state } : job))
      }));
      setMessage('Job approved and published');
    });

  const rejectJob = () =>
    run('reject-job', async () => {
      if (!selectedJobId) {
        throw new Error('Select a job first');
      }
      const response = await apiRequest({
        path: `/jobs/${selectedJobId}/reject`,
        method: 'POST',
        csrfToken,
        body: { comment: comment || 'Rejected for revisions' }
      });
      setState((prev) => ({
        ...prev,
        jobs: prev.jobs.map((job) => (job.jobId === selectedJobId ? { ...job, state: response.data.state } : job))
      }));
      setMessage('Job returned to draft');
    });

  const takedownJob = () =>
    run('takedown', async () => {
      if (!selectedJobId) {
        throw new Error('Select a job first');
      }
      const response = await apiRequest({
        path: `/jobs/${selectedJobId}/takedown`,
        method: 'POST',
        csrfToken,
        body: { policyCode: 'POL-17', reason: comment || 'Policy takedown' }
      });
      setState((prev) => ({
        ...prev,
        jobs: prev.jobs.map((job) => (job.jobId === selectedJobId ? { ...job, state: response.data.state } : job))
      }));
      setMessage('Job takedown applied');
    });

  const createAppeal = () =>
    run('appeal', async () => {
      if (!selectedJobId) {
        throw new Error('Select a job first');
      }
      const response = await apiRequest({
        path: `/jobs/${selectedJobId}/appeals`,
        method: 'POST',
        csrfToken,
        body: { comment: comment || 'Appeal requested' }
      });
      setAppealId(response.data.appealId);
      setState((prev) => ({
        ...prev,
        jobs: prev.jobs.map((job) => (job.jobId === selectedJobId ? { ...job, state: response.data.state } : job))
      }));
      setMessage(`Appeal submitted: ${response.data.appealId}`);
    });

  const decideAppeal = () =>
    run('appeal-decision', async () => {
      if (!selectedJobId || !appealId) {
        throw new Error('Select both job and appeal id first');
      }
      const stepUp = await acquireStepUpTokenFor('JOB_APPEAL_DECIDE');
      const response = await apiRequest({
        path: `/jobs/${selectedJobId}/appeals/${appealId}/decide`,
        method: 'POST',
        csrfToken,
        stepUpToken: stepUp.stepUpToken,
        allowQueue: false,
        body: {
          decision,
          comment: comment || 'Appeal decision from staffing console'
        }
      });
      setState((prev) => ({
        ...prev,
        jobs: prev.jobs.map((job) => (job.jobId === selectedJobId ? { ...job, state: response.data.state } : job))
      }));
      setMessage(`Appeal decision recorded: ${response.data.state}`);
    });

  const loadHistory = () =>
    run('history', async () => {
      if (!selectedJobId) {
        throw new Error('Select a job first');
      }
      const response = await apiRequest({ path: `/jobs/${selectedJobId}/history`, method: 'GET', allowQueue: false });
      setState((prev) => ({ ...prev, history: response.data }));
      setMessage(`Loaded history for ${selectedJobId}`);
    });

  return (
    <article className="card">
      <h2>Staffing Governance Lifecycle</h2>
      <p className="small">Manage draft to submit to approve/reject to takedown to appeal to decision workflows with role-based action visibility.</p>

      <section className="route-block">
        <h3>Draft Authoring</h3>
        {canEdit ? (
          <div className="row wrap">
            <input value={jobForm.department} onChange={(e) => setJobForm((prev) => ({ ...prev, department: e.target.value }))} placeholder="department" />
            <input value={jobForm.title} onChange={(e) => setJobForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="title" />
            <input value={jobForm.description} onChange={(e) => setJobForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="description" />
            <input value={jobForm.shiftInfo} onChange={(e) => setJobForm((prev) => ({ ...prev, shiftInfo: e.target.value }))} placeholder="shift details" />
            <button onClick={createDraft} disabled={pending !== ''}>{pending === 'create-draft' ? 'Saving...' : 'Create Draft'}</button>
            <button onClick={updateDraft} disabled={!selectedJobId || pending !== ''}>{pending === 'update-draft' ? 'Saving...' : 'Update Draft'}</button>
            <button onClick={submitForApproval} disabled={!selectedJobId || pending !== ''}>{pending === 'submit-job' ? 'Submitting...' : 'Submit'}</button>
          </div>
        ) : (
          <p className="small">Current role cannot create or edit job drafts.</p>
        )}
      </section>

      <section className="route-block">
        <h3>Workflow Actions</h3>
        <div className="row wrap">
          <select value={selectedJobId} onChange={(e) => setSelectedJobId(e.target.value)}>
            <option value="">Select job</option>
            {state.jobs.map((job) => (
              <option key={job.jobId} value={job.jobId}>{job.jobId} ({job.state})</option>
            ))}
          </select>
          <input value={appealId} onChange={(e) => setAppealId(e.target.value)} placeholder="appeal id" />
          <select value={decision} onChange={(e) => setDecision(e.target.value)}>
            <option value="APPROVE">APPROVE</option>
            <option value="REJECT">REJECT</option>
          </select>
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="comment" />
        </div>

        <div className="row wrap">
          {canApprove ? <button onClick={approveJob} disabled={!selectedJobId || pending !== ''}>{pending === 'approve-job' ? 'Approving...' : 'Approve (Step-Up)'}</button> : null}
          {canApprove ? <button onClick={rejectJob} disabled={!selectedJobId || pending !== ''}>{pending === 'reject-job' ? 'Submitting...' : 'Reject'}</button> : null}
          {canApprove ? <button onClick={takedownJob} disabled={!selectedJobId || pending !== ''}>{pending === 'takedown' ? 'Applying...' : 'Takedown'}</button> : null}
          {canEdit ? <button onClick={createAppeal} disabled={!selectedJobId || pending !== ''}>{pending === 'appeal' ? 'Submitting...' : 'Create Appeal'}</button> : null}
          {canApprove ? <button onClick={decideAppeal} disabled={!selectedJobId || !appealId || pending !== ''}>{pending === 'appeal-decision' ? 'Deciding...' : 'Decide Appeal (Step-Up)'}</button> : null}
          {canRead ? <button onClick={loadHistory} disabled={!selectedJobId || pending !== ''}>{pending === 'history' ? 'Loading...' : 'Load History'}</button> : null}
        </div>
      </section>

      <section className="route-block">
        <h3>Current State</h3>
        <p className="small">Selected job state: {selectedJob?.state || 'none'}</p>
        {state.jobs.length === 0 ? <p className="small">No jobs created in this session.</p> : (
          <table className="segment-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {state.jobs.map((job) => (
                <tr key={job.jobId}>
                  <td>{job.jobId}</td>
                  <td>{job.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {state.history ? (
        <section className="route-block">
          <h3>Workflow History</h3>
          <p className="small">Versions: {state.history.versions?.length || 0} | Events: {state.history.workflowEvents?.length || 0}</p>
          <details>
            <summary>Open detailed history payload</summary>
            <pre>{JSON.stringify(state.history, null, 2)}</pre>
          </details>
        </section>
      ) : null}
    </article>
  );
}

export default StaffingTab;
