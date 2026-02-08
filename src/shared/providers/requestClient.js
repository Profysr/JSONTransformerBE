export const makeRequest = async (url, token, method = "GET", data = null) => {
  if (!url || !token) {
    return {
      success: false,
      error: "Missing URL or token.",
      data: null,
    };
  }

  try {
    const headers = new Headers();
    headers.append("Authorization", `Bearer ${token}`);
    headers.append("Content-Type", "application/json");

    const requestOptions = {
      method,
      headers,
    };

    if (data && method !== "GET") {
      requestOptions.body = JSON.stringify(data);
    }

    const response = await fetch(url, requestOptions);

    const responseData = await response.json().catch(() => null); // Safely parse JSON

    if (response.ok) {
      return {
        success: true,
        data: responseData,
        error: null,
      };
    } else {
      return {
        success: false,
        data: null,
        error:
          responseData?.message ||
          `Request failed with status ${response.status}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error.message || "Unexpected error",
    };
  }
};

/**
 * Makes an HTTP request with automatic retry logic
 */
export const makeRequestWithRetry = async (
  getTokenFn,
  url,
  method = "POST",
  payload = null,
  options = {}
) => {
  const {
    maxAttempts = 3,
    retryDelay = 3000,
    logPrefix = "Request"
  } = options;

  let success = false;
  let lastError = null;
  let result = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const accessToken = await getTokenFn();

    result = await makeRequest(url, accessToken, method, payload);

    if (result.success) {
      success = true;
      break;
    }

    /** if result is not fine for whatever reasons */
    lastError = new Error(result.error || "Unknown error");

    // Log failed attempt and retry if not at max attempts
    if (attempt < maxAttempts) {
      console.warn(
        `${logPrefix}: Attempt ${attempt} failed (${lastError.message}). Retrying in ${retryDelay / 1000} seconds...`
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  if (!success) {
    console.error(
      `${logPrefix}: All ${maxAttempts} attempts failed. Final error: ${lastError?.message || "Unknown error"}`
    );
    throw lastError || new Error(`${logPrefix} failed after ${maxAttempts} attempts`);
  }

  return result;
};

