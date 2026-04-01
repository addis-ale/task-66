const config = require('../config');
const { connectWithRetry, mongoose } = require('../db');
const User = require('../models/user');
const ParticipantProfile = require('../models/participant-profile');
const { hashPassword } = require('../lib/password');

const seedUsers = [
  {
    username: 'admin.dev',
    password: 'AdminSecure!2026',
    roles: ['Administrator']
  },
  {
    username: 'curator.dev',
    password: 'CuratorSecure!2026',
    roles: ['Curator']
  },
  {
    username: 'reviewer.dev',
    password: 'ReviewerSecure!2026',
    roles: ['Reviewer']
  },
  {
    username: 'coordinator.dev',
    password: 'CoordinatorSecure!2026',
    roles: ['Program Coordinator']
  },
  {
    username: 'employer.dev',
    password: 'EmployerSecure!2026',
    roles: ['Employer']
  },
  {
    username: 'auditor.dev',
    password: 'AuditorSecure!2026',
    roles: ['Auditor']
  }
];

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

  console.log('Development users seeded.');
  await mongoose.connection.close();
};

run().catch(async (error) => {
  console.error('Failed to seed users:', error);
  await mongoose.connection.close();
  process.exit(1);
});
