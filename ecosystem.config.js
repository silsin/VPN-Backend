module.exports = {
  apps: [
    {
      name: 'flyvpn-backend',
      script: './dist/main.js',
      instances: 'max',
      exec_mode: 'cluster',
      
      // Environment
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },

      // Logging
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Restart & monitoring
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      
      // Performance
      node_args: '--max-old-space-size=1024 --enable-source-maps',

      // Graceful shutdown
      kill_timeout: 30000,
      wait_ready: true,
      listen_timeout: 10000,

      // Restart limits
      max_restarts: 10,
      min_uptime: '10s',

      // Development only
      ignore_watch: ['node_modules', 'logs', 'dist'],
    }
  ],

  // Monitoring
  monitor_delay: 5000,
  
  // Deployment
  deploy: {
    production: {
      user: 'root',
      host: 'your-server-ip',
      key: '/home/user/.ssh/id_rsa',
      ref: 'origin/main',
      repo: 'git@github.com:your-org/flyvpn-backend.git',
      path: '/opt/apps/flyvpn-backend',
      'post-deploy': 'npm ci && npm run build && npm run typeorm migration:run && pm2 reload ecosystem.config.js --env production'
    }
  }
};
