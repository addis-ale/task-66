const { randomUUID } = require('crypto');
const express = require('express');
const MetricDefinition = require('../models/metric-definition');
const DimensionDefinition = require('../models/dimension-definition');
const DashboardDefinition = require('../models/dashboard-definition');
const AnomalyRule = require('../models/anomaly-rule');
const AnomalyDispatch = require('../models/anomaly-dispatch');
const ReportDefinition = require('../models/report-definition');
const ReportRun = require('../models/report-run');
const User = require('../models/user');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { sendError } = require('../lib/http');
const { countWeeklyBookings, evaluateWowDropRule } = require('../services/analytics');
const { runReportDefinition } = require('../services/reports');
const { createInboxMessage } = require('../services/inbox');
const config = require('../config');

const router = express.Router();

const validReportFormats = ['CSV', 'JSON'];

const dispatchAnomalyInbox = async ({ dashboard, rule, metricResult, evaluation }) => {
  if (evaluation.status !== 'TRIGGERED') {
    return;
  }

  const periodKey = metricResult?.period?.currentWeekStart || new Date().toISOString().slice(0, 10);
  const recipients = new Set([String(dashboard.created_by)]);

  const privileged = await User.find({ roles: { $in: ['Administrator', 'Auditor'] }, status: 'ACTIVE' }, { _id: 1 }).lean();
  for (const user of privileged) {
    recipients.add(String(user._id));
  }

  for (const recipientId of recipients) {
    const dedupeKey = `${dashboard.dashboard_id}:${rule.rule_key}:${periodKey}:${recipientId}`;

    try {
      await AnomalyDispatch.create({
        dedupe_key: dedupeKey,
        dashboard_id: dashboard.dashboard_id,
        rule_key: rule.rule_key,
        period_key: String(periodKey),
        recipient_id: recipientId,
        message_id: null
      });

      const message = await createInboxMessage({
        recipientId,
        type: 'ANOMALY',
        title: `Anomaly triggered: ${rule.rule_key}`,
        body: evaluation.message,
        payload: {
          dashboardId: dashboard.dashboard_id,
          rule: rule.rule_key,
          metricKey: rule.metric_key,
          periodKey,
          printable: {
            noticeType: 'ANOMALY_ALERT',
            rule: rule.rule_key,
            message: evaluation.message,
            periodKey
          }
        }
      });

      await AnomalyDispatch.updateOne({ dedupe_key: dedupeKey }, {
        $set: {
        message_id: message._id
        }
      });
    } catch (error) {
      if (error.code !== 11000) {
        throw error;
      }
    }
  }
};

router.use(requireAuth);

router.post('/metrics', requirePermission('ANALYTICS_METRIC_MANAGE'), async (req, res) => {
  const { key, name, description, dataset, aggregation } = req.body || {};
  if (!key || !name || !dataset || !aggregation) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'key/name/dataset/aggregation', issue: 'required fields missing' }
    ]);
  }

  const metric = await MetricDefinition.create({
    key,
    name,
    description: description || '',
    dataset,
    aggregation,
    filter_template: req.body.filterTemplate || {},
    active: true
  });

  return res.status(201).json({
    data: {
      id: String(metric._id),
      key: metric.key,
      name: metric.name
    }
  });
});

router.post('/dimensions', requirePermission('ANALYTICS_DIMENSION_MANAGE'), async (req, res) => {
  const { key, name, dataset, field, dataType } = req.body || {};
  if (!key || !name || !dataset || !field || !dataType) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'key/name/dataset/field/dataType', issue: 'required fields missing' }
    ]);
  }

  const dimension = await DimensionDefinition.create({
    key,
    name,
    dataset,
    field,
    data_type: dataType,
    active: true
  });

  return res.status(201).json({
    data: {
      id: String(dimension._id),
      key: dimension.key,
      name: dimension.name
    }
  });
});

router.post('/anomaly-rules', requirePermission('ANALYTICS_METRIC_MANAGE'), async (req, res) => {
  const { ruleKey, metricKey, thresholdPercent, minBaselineCount } = req.body || {};
  if (!ruleKey || !metricKey) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'ruleKey/metricKey', issue: 'required fields missing' }
    ]);
  }

  const rule = await AnomalyRule.create({
    rule_key: ruleKey,
    metric_key: metricKey,
    threshold_percent: Number(thresholdPercent || 30),
    min_baseline_count: Number(minBaselineCount || 20),
    enabled: true
  });

  return res.status(201).json({
    data: {
      id: String(rule._id),
      ruleKey: rule.rule_key
    }
  });
});

router.post('/dashboards', requirePermission('ANALYTICS_DASHBOARD_MANAGE'), async (req, res) => {
  const { name, tiles, anomalyRules } = req.body || {};
  if (!name) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'name', issue: 'is required' }
    ]);
  }

  const dashboardId = `dash_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const dashboard = await DashboardDefinition.create({
    dashboard_id: dashboardId,
    name,
    tiles: Array.isArray(tiles) ? tiles : [],
    anomaly_rules: Array.isArray(anomalyRules) ? anomalyRules : [],
    created_by: req.auth.userId,
    active: true
  });

  return res.status(201).json({
    data: {
      dashboardId: dashboard.dashboard_id,
      name: dashboard.name
    }
  });
});

router.get('/dashboards/:dashboardId', requirePermission('ANALYTICS_DASHBOARD_READ'), async (req, res) => {
  const dashboard = await DashboardDefinition.findOne({ dashboard_id: req.params.dashboardId }).lean();
  if (!dashboard) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Dashboard not found');
  }

  const metricResults = {};
  const metricsToCompute = new Set((dashboard.tiles || []).map((tile) => tile.metric).filter(Boolean));

  if (metricsToCompute.has('weekly_bookings')) {
    metricResults.weekly_bookings = await countWeeklyBookings();
  }

  const tiles = (dashboard.tiles || []).map((tile) => {
    if (tile.metric === 'weekly_bookings') {
      return { metric: 'weekly_bookings', value: metricResults.weekly_bookings.current };
    }
    return { metric: tile.metric, value: null };
  });

  const rules = await AnomalyRule.find({ rule_key: { $in: dashboard.anomaly_rules }, enabled: true }).lean();
  const anomalies = [];

  for (const rule of rules) {
    if (rule.metric_key === 'weekly_bookings') {
      const result = metricResults.weekly_bookings || (await countWeeklyBookings());
      const evaluation = evaluateWowDropRule({
        current: result.current,
        previous: result.previous,
        thresholdPercent: rule.threshold_percent,
        minBaselineCount: rule.min_baseline_count
      });

      anomalies.push({
        rule: rule.rule_key,
        status: evaluation.status,
        message: evaluation.message
      });

      await dispatchAnomalyInbox({
        dashboard,
        rule,
        metricResult: result,
        evaluation
      });
    }
  }

  return res.status(200).json({
    data: {
      dashboardId: dashboard.dashboard_id,
      tiles,
      anomalies
    }
  });
});

router.post('/reports', requirePermission('ANALYTICS_REPORT_MANAGE'), async (req, res) => {
  const { name, dataset, format, schedule } = req.body || {};
  if (!name || !dataset || !validReportFormats.includes(format)) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'name/dataset/format', issue: 'invalid report definition' }
    ]);
  }

  const reportId = `rep_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const definition = await ReportDefinition.create({
    report_id: reportId,
    name,
    dataset,
    format,
    schedule: {
      time: schedule?.time || config.reporting.scheduleTime,
      timezone: schedule?.timezone || config.reporting.scheduleTimezone
    },
    created_by: req.auth.userId,
    active: true
  });

  return res.status(201).json({
    data: {
      reportId: definition.report_id,
      name: definition.name,
      dataset: definition.dataset,
      format: definition.format,
      schedule: definition.schedule
    }
  });
});

router.post('/reports/:reportId/run', requirePermission('ANALYTICS_REPORT_MANAGE'), async (req, res) => {
  const definition = await ReportDefinition.findOne({ report_id: req.params.reportId });
  if (!definition) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Report definition not found');
  }

  try {
    const run = await runReportDefinition(definition, 'MANUAL', 1);
    return res.status(200).json({
      data: {
        runId: run.run_id,
        status: run.status,
        artifactPath: run.artifact_path,
        checksumSha256: run.checksum_sha256,
        startedAt: run.started_at,
        finishedAt: run.finished_at
      }
    });
  } catch (error) {
    return sendError(res, req, 500, 'REPORT_RUN_FAILED', error.message);
  }
});

router.get('/reports/:reportId/runs', requirePermission('ANALYTICS_REPORT_READ'), async (req, res) => {
  const definition = await ReportDefinition.findOne({ report_id: req.params.reportId }).lean();
  if (!definition) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Report definition not found');
  }

  const runs = await ReportRun.find({ report_id: definition.report_id }).sort({ started_at: -1 }).lean();
  return res.status(200).json({
    data: runs.map((run) => ({
      runId: run.run_id,
      status: run.status,
      artifactPath: run.artifact_path,
      checksumSha256: run.checksum_sha256,
      startedAt: run.started_at,
      finishedAt: run.finished_at
    }))
  });
});

module.exports = router;
