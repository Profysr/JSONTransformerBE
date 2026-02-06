export const CONFIG = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || "development",
  shary: {
    apiUrl: process.env.SHARY_API_URL,
    username: process.env.SHARY_USERNAME,
    password: process.env.SHARY_PASSWORD,
  },
};
