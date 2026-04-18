module.exports = {
  apps: [
    {
      name: 'whatsapp-server',
      script: 'whatsapp-server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        WHATSAPP_SERVER_PORT: 3001,
        NEXTJS_URL: 'http://localhost:3000'
      },
      error_file: './logs/whatsapp-err.log',
      out_file: './logs/whatsapp-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      listen_timeout: 30000,
      kill_timeout: 5000
    },
    {
      name: 'homeopms',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '0.0.0.0',
        NEXT_PUBLIC_DATA_MODE: 'server',
        DATABASE_URL: 'postgresql://homeopms:homeopms123@localhost:5432/homeopms',
        SERVER_DB_DIR: '/home/ubuntu/apps/homeopms/.data',
        WHATSAPP_SESSION_PATH: '/home/ubuntu/whatsapp-sessions',
        WHATSAPP_SERVER_PORT: '3001',
        NEXTJS_URL: 'http://140.245.201.21:3000'
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      ignore_watch: ['node_modules', '.next', 'logs'],
      listen_timeout: 10000,
      kill_timeout: 5000
    }
  ],
  deploy: {
    production: {
      user: 'node',
      host: 'localhost',
      ref: 'origin/main',
      repo: 'git@github.com:repo.git',
      path: '/var/www/homeopms',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production'
    }
  }
};
