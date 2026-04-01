const { randomUUID } = require('crypto');
const { DateTime } = require('luxon');
const ReportDefinition = require('../models/report-definition');
const ReportRun = require('../models/report-run');
const Registration = require('../models/registration');
const ProgramSession = require('../models/program-session');
const Job = require('../models/job');
const config = require('../config');
const { isDbReady } = require('../db');
const { toCsv, writeArtifactAtomic } = require('./reconciliation');
const { createInboxMessage } = require('./inbox');
const { logAuditEvent } = require('./events');

let schedulerIntervalHandle = null;

const retryBackoffMs = (attempt) => (attempt === 1 ? 60 * 1000 : 5 * 60 * 1000);

const buildReportRows = async (definition) => {
  if (definition.dataset === 'program_registrations') {
    const rows = await Registration.find({})
      .sort({ created_at: 1, _id: 1 })
      .lean();
    return rows.map((row) => ({
      registrationId: String(row._id),
      sessionId: String(row.session_id),
      participantId: row.participant_id,
      status: row.status,
      createdAt: row.created_at.toISOString()
    }));
  }

  if (definition.dataset === 'sessions') {
    const rows = await ProgramSession.find({})
      .sort({ start_at_utc: 1, _id: 1 })
      .lean();
    return rows.map((row) => ({
      sessionId: String(row._id),
      programId: String(row.program_id),
      coachId: String(row.coach_id),
      startAtUtc: row.start_at_utc.toISOString(),
      status: row.status,
      capacity: row.capacity
    }));
  }

  if (definition.dataset === 'staffing_jobs') {
    const rows = await Job.find({})
      .sort({ created_at: 1, _id: 1 })
      .lean();
    return rows.map((row) => ({
      jobId: String(row._id),
      title: row.title,
      department: row.department,
      state: row.current_state,
      createdAt: row.created_at.toISOString()
    }));
  }

  throw new Error(`Unsupported dataset: ${definition.dataset}`);
};

const buildReportContent = (rows, format) => {
  if (format === 'CSV') {
    return toCsv(rows);
  }
  return JSON.stringify({ data: rows }, null, 2);
};

const runReportDefinition = async (definition, triggerType, attempt = 1) => {
  if (!isDbReady()) {
    throw new Error('Database not ready for report execution');
  }

  const runId = `rr_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
  const startedAt = new Date();

  const run = await ReportRun.create({
    run_id: runId,
    report_id: definition.report_id,
    trigger_type: triggerType,
    status: 'RUNNING',
    started_at: startedAt,
    attempt
  });

  try {
    const rows = await buildReportRows(definition);
    const content = buildReportContent(rows, definition.format);
    const suffix = definition.format.toLowerCase();
    const fileName = `${definition.report_id}_${DateTime.utc().toFormat('yyyyLLdd_HHmmss')}.${suffix}`;
    const artifact = await writeArtifactAtomic({
      subdir: 'reports',
      fileName,
      content
    });

    run.status = 'SUCCESS';
    run.artifact_path = artifact.artifactPath;
    run.checksum_sha256 = artifact.checksumSha256;
    run.finished_at = new Date();
    await run.save();

    if (triggerType !== 'MANUAL') {
      definition.last_scheduled_run_date = DateTime.now()
        .setZone(definition.schedule.timezone)
        .toFormat('yyyy-LL-dd');
      await definition.save();
    }

    return run;
  } catch (error) {
    run.status = 'FAILED';
    run.error_message = error.message;
    run.finished_at = new Date();
    await run.save();

    await createInboxMessage({
      recipientId: definition.created_by,
      type: 'ANOMALY',
      title: 'Scheduled report failed',
      body: `${definition.name} failed: ${error.message}`,
      payload: {
        reportId: definition.report_id,
        runId,
        attempt,
        printable: {
          noticeType: 'REPORT_FAILURE',
          message: `${definition.name} failed at attempt ${attempt}.`,
          error: error.message
        }
      }
    });

    await logAuditEvent({
      actorId: definition.created_by,
      action: 'REPORT_RUN_FAILED',
      entityType: 'report_definition',
      entityId: definition.report_id,
      metadata: { runId, attempt, error: error.message }
    });

    if (attempt < 3) {
      const delayMs = retryBackoffMs(attempt);
      setTimeout(() => {
        runReportDefinition(definition, 'RETRY', attempt + 1).catch((err) => {
          console.error('Retry report run failed:', err);
        });
      }, delayMs);
    }

    throw error;
  }
};

const shouldRunNow = (definition, nowUtc) => {
  if (!definition.active) {
    return false;
  }

  const [hour, minute] = String(definition.schedule.time || config.reporting.scheduleTime)
    .split(':')
    .map((value) => Number(value));

  const nowLocal = nowUtc.setZone(definition.schedule.timezone || config.reporting.scheduleTimezone);
  const todayLocal = nowLocal.toFormat('yyyy-LL-dd');

  if (definition.last_scheduled_run_date === todayLocal) {
    return false;
  }

  return nowLocal.hour === hour && nowLocal.minute === minute;
};

const tickScheduler = async () => {
  if (!isDbReady()) {
    return;
  }

  const definitions = await ReportDefinition.find({ active: true });
  const nowUtc = DateTime.utc();

  for (const definition of definitions) {
    if (shouldRunNow(definition, nowUtc)) {
      runReportDefinition(definition, 'SCHEDULED').catch((error) => {
        console.error('Scheduled report execution failed:', error);
      });
    }
  }
};

const startReportScheduler = async () => {
  if (schedulerIntervalHandle) {
    return;
  }

  schedulerIntervalHandle = setInterval(() => {
    tickScheduler().catch((error) => {
      console.error('Report scheduler tick failed:', error);
    });
  }, 60 * 1000);

  await tickScheduler().catch((error) => {
    console.error('Initial report scheduler tick failed:', error);
  });
  console.log('Report scheduler started');
};

module.exports = {
  runReportDefinition,
  startReportScheduler,
  shouldRunNow,
  retryBackoffMs
};
