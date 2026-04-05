const config = require('../config');
const { connectWithRetry, mongoose } = require('../db');
const User = require('../models/user');
const ParticipantProfile = require('../models/participant-profile');
const { hashPassword } = require('../lib/password');

const passwordOverride = process.env.DEV_USER_PASSWORD_OVERRIDE || '';

const buildPassword = (role) => {
  if (passwordOverride) return passwordOverride;
  const prefix = role.replace(/\s+/g, '');
  return `${prefix}Secure!${new Date().getFullYear()}`;
};

const seedUsers = [
  { username: 'admin.dev', roles: ['Administrator'] },
  { username: 'curator.dev', roles: ['Curator'] },
  { username: 'reviewer.dev', roles: ['Reviewer'] },
  { username: 'coordinator.dev', roles: ['Program Coordinator'] },
  { username: 'employer.dev', roles: ['Employer'] },
  { username: 'auditor.dev', roles: ['Auditor'] }
].map((entry) => ({
  ...entry,
  password: buildPassword(entry.roles[0])
}));

const run = async () => {
  if (!config.development.enableDevSeed) {
    console.error('Dev seed is disabled. Set ENABLE_DEV_SEED=true and use non-production NODE_ENV.');
    process.exit(1);
  }

  await connectWithRetry(config.mongoUri);

  for (const seedUser of seedUsers) {
    const password_hash = await hashPassword(seedUser.password);
    await User.updateOne(
      { username: seedUser.username },
      {
        $set: {
          username: seedUser.username,
          password_hash,
          roles: seedUser.roles,
          status: 'ACTIVE',
          failed_login_count: 0,
          failed_login_window_started_at: null,
          lockout_until: null
        }
      },
      { upsert: true }
    );
  }

  await ParticipantProfile.updateOne(
    { participant_id: 'usr_900' },
    {
      $set: {
        participant_id: 'usr_900',
        name: 'Pat Riley',
        phone: '555-101-1234',
        email: 'pat.riley@example.local',
        notes: 'Needs accessibility support'
      }
    },
    { upsert: true }
  );

  await ParticipantProfile.updateOne(
    { participant_id: 'usr_901' },
    {
      $set: {
        participant_id: 'usr_901',
        name: 'Dana Kim',
        phone: '555-202-5678',
        email: 'dana.kim@example.local',
        notes: 'Prefers morning sessions'
      }
    },
    { upsert: true }
  );

  console.log('Development users seeded:');
  for (const entry of seedUsers) {
    console.log(`  ${entry.username} / password: ${entry.password} (roles: ${entry.roles.join(', ')})`);
  }
  await mongoose.connection.close();
};

run().catch(async (error) => {
  console.error('Failed to seed users:', error);
  await mongoose.connection.close();
  process.exit(1);
});
