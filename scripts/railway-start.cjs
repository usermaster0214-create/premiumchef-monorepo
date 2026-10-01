const { spawn } = require('node:child_process');

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

const child = spawn('corepack', ['pnpm', ...command], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});