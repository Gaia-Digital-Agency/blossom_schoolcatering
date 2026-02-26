module.exports = {
  apps: [
    {
      name: 'schoolcatering-api',
      script: 'npm',
      args: '--prefix /var/www/schoolcatering/apps/api run start:prod',
      cwd: '/var/www/schoolcatering',
      env: {
        PORT: 3006,
        NODE_ENV: 'production',
      },
      max_restarts: 10,
      restart_delay: 3000,
      exp_backoff_restart_delay: 1000,
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'schoolcatering-web',
      script: 'npm',
      args: '--prefix /var/www/schoolcatering/apps/web run start',
      cwd: '/var/www/schoolcatering',
      env: {
        PORT: 4173,
        NODE_ENV: 'production',
        HOSTNAME: '127.0.0.1',
      },
      max_restarts: 10,
      restart_delay: 3000,
      exp_backoff_restart_delay: 1000,
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
