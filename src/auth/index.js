import { SERVERS } from "../global/Constants.js";

// Persistent in-memory storage for the server process
const tokenStore = {};

const getData = (key) => tokenStore[key];

const setData = (key, value) => {
  tokenStore[key] = value;
};

const key = (type, server) => `${type}_${server}`;

function saveData(server, data) {
  setData(key("access_token", server), data.access);
  setData(key("access_expiration", server), Date.parse(data.access_expiration));

  if (data.refresh) {
    setData(key("refresh_token", server), data.refresh);
    setData(
      key("refresh_expiration", server),
      Date.parse(data.refresh_expiration)
    );
  }
}

// Login and store tokens
async function login(server) {
  const url = `${SERVERS[server].BASE_URL}/login/`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: SERVERS[server].USERNAME,
        password: SERVERS[server].PASSWORD,
      }),
    });

    if (!response.ok) throw new Error(`Login failed: ${response.statusText}`);

    const data = await response.json();
    saveData(server, data);
  } catch (e) {
    console.error(`Error logging in: ${e}`);
  }
}

// Use refresh token to get new access token
async function apiCallForAccessToken(server) {
  try {
    const refreshToken = getData(key("refresh_token", server));
    const url = `${SERVERS[server].BASE_URL}/token/refresh/`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: refreshToken }),
    });

    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    saveData(server, data);
    return data.access;
  } catch (error) {
    console.error(`Failed to refresh token: ${error}`);
  }
}

// Check if token is still valid (over 3 minutes left)
function isTokenValid(tokenName) {
  const expirationTimestamp = Number(getData(tokenName));

  if (!expirationTimestamp || isNaN(expirationTimestamp)) {
    return false;
  }

  return expirationTimestamp - Date.now() > 180_000; // 3 min buffer
}

// Main access token getter
export async function getAccessToken(server) {
  const accessTokenKey = key("access_token", server);
  const accessExpKey = key("access_expiration", server);
  const refreshExpKey = key("refresh_expiration", server);

  // 1. Access token is valid
  if (isTokenValid(accessExpKey)) {
    return getData(accessTokenKey);
  }

  // 2. Access token is expired but refresh key is valid
  if (isTokenValid(refreshExpKey)) {
    const newAccess = await apiCallForAccessToken(server);
    if (newAccess) return newAccess;
  }

  // 3. Everything expired or missing, perform full login
  await login(server);
  return getData(accessTokenKey);
}
