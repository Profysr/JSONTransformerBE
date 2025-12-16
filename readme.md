# Transformation Module Backend

This application is designed to process and transform JSON data based on configurable rules.

## Technical Architecture

The project follows a modular architecture mainly consisting of:

-   **Entry Point (`app.js`)**: Configures the Express server, middleware (JSON parsing, request logging), and global error handlers (uncaught exceptions, unhandled rejections).
-   **Routing (`routes/`)**: Defines the API endpoints. The main router is mounted at `/api/v1`.
-   **Controllers (`controllers/`)**: Contains the business logic for handling requests. The `transformationController` manages input validation, fetches configuration rules, and invokes the transformation service.
-   **Services (`services/`)**: The core logic resides here. `mapperService` (implied) is responsible for applying the transformation rules to the input data.
-   **Logging (`lib/logger.js`)**: A robust custom `BatchLogger` implementation for handling logs.
    -   **Development**: Logs human-readable output to the console.
    -   **Production**: Buffers logs and sends them to a external endpoint (`configRules` or dedicated logging service). It handles retries and ensures logs are sent even on process crashes where possible.
-   **Authentication (`auth/`)**: Handles access token generation for secure communication with downstream services.

## Installation & Running

### Prerequisites
- Node.js (v20+ recommended particularly for `--env-file` support or ensure compatibility)
- npm

### Setup
1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Set up environment variables in `.env` (ensure `PORT` and `NODE_ENV` are set).

### Running the Application

-   **Development Mode** (with watch mode):
    ```bash
    npm run dev
    ```
-   **Start Server**:
    ```bash
    npm start
    ```

## API Endpoints

The API is versioned at `/api/v1`.

### 1. Health Check
Checks if the server is running.
-   **URL**: `/`
-   **Method**: `GET`
-   **Response**:
    ```json
    {
      "message": "Transformation Module Backend is running",
      "docs": "/api/v1"
    }
    ```

### 2. Transform Data
The core endpoint to transform input data based on instance ID and letter type.

-   **URL**: `/api/v1/transform/:inst_id/:letter_type`
-   **Method**: `POST`
-   **Parameters**:
    -   `inst_id` (Path): The instance ID (Client ID). Case-insensitive.
    -   `letter_type` (Path): The type of letter/document to transform. Case-insensitive.

-   **Request Body (Payload)**:
    A JSON object containing the raw data to be transformed. The payload *must* be an object.
    
    *Required Fields for Logging (Must be present in provided body):*
    -   `nhs_id`: (Optional but recommended) NHS Number for context logging.
    -   `letter_id`: (Optional but recommended) Letter ID for tracking.


-   **Response (Success - 200)**:
    ```json
    {
      "status": "success",
      "ok": true,
      "message": "Data successfully transformed according to client-specific rules.",
      "output": {
        "transformed_field": "Transformed Value",
        ...
      }
    }
    ```

-   **Response (Killed - 200)**:
    If a rule terminates the transformation (e.g., specific exclusion criteria).
    ```json
    {
      "status": "killed",
      "ok": false,
      "message": "Transformation terminated by rule applied to [Field]. The resulting value is retained.",
      "output": {
        "killStatus": { ... },
        ...
      }
    }
    ```

-   **Response (Error - 500)**:
    ```json
    {
      "status": "error",
      "ok": false,
      "message": "Internal server error during transformation.",
      "error": "Error details..."
    }
    ```

## Logging Mechanism

The application uses an advanced logging strategy:
-   **Contextual**: Logs include `inst_id`, `letter_type`, `nhs_id`, and `letter_id` to trace requests easily.
-   **Buffering (Production)**: Logs are not just printed; they are collected and sent in batches to the configured logging endpoint (`/automation_config/transformation_logs/:inst_id`).
-   **Reliability**: The system attempts to send logs up to 3 times on failure and attempts a final send on application crash.
