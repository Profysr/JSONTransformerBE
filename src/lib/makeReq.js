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

