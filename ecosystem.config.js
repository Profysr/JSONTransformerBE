module.exports = {
  apps: [
    {
      name: "transfomer", // Friendly name for your process
      script: "src/app.js", // Entry point of your app
      instances: 1, // Run just one instance
      watch: false, // Set to true if you want auto-restart on file changes
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        PORT: 5000,
        NODE_ENV: 'production',
        SHARY_USERNAME: 'automation_server@kynoby.com',
        SHARY_PASSWORD: 'a78678600',
        SHARY_API_URL: 'https://sharybeautomation-9qrox.kinsta.app'
      },
    },
  ],
};
