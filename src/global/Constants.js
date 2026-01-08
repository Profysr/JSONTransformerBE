import { config } from "./AppConfig.js";

export const SERVERS = {
  shary_prod: {
    BASE_URL: config.shary.apiUrl,
    USERNAME: config.shary.username,
    PASSWORD: config.shary.password,
  },
};
