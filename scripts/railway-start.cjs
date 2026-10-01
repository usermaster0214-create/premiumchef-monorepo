const { spawn, spawnSync } = require('node:child_process');

const service = process.env.RAILWAY_SERVICE_NAME;
const command = service === 'API'
  ? ['--filter', '@premiumchef/api', 'start']
  : service === 'Web'
    ? ['--filter', '@premiumchef/web', 'start']
    : null;

if (!command) {
  console.error(`Unsupported RAILWAY_SERVICE_NAME: ${service || '(missing)'}`);
  process.exit(1);
}

if (service === 'API') {
  const migration = spawnSync('corepack', ['pnpm', '--filter', '@premiumchef/database', 'db:migrate:deploy'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (migration.status !== 0) process.exit(migration.status ?? 1);
}

const child = spawn('corepack', ['pnpm', ...command], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});