/** PM2: Next.js deste CRM. Redis/worker/Postgres ficam nos Compose, não aqui. */
module.exports = {
  apps: [
    {
      name: 'crm',
      cwd: __dirname,
      script: 'node_modules/next/dist/bin/next',
      args: 'start --hostname 127.0.0.1 --port 3001',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
      },
    },
  ],
};
