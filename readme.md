# Transformation Module Backend

This application is designed to process and transform JSON data based on configurable rules. Think of it as a **Smart Sorting Hat** for data: it takes raw information (like a letter), reads a rulebook, and decides exactly how that information should look in the end.

---

## 🚀 How It Works (Simplified)

Imagine a very strict teacher grading a student's exam paper.
1.  **The Student's Paper (Input)**: The teacher reads the answers but **never writes on the original paper**. The original paper stays clean.
2.  **The Grade Sheet (Output)**: The teacher writes the final grades on a brand new sheet.
3.  **The Rulebook (Configuration)**: The teacher follows a specific set of rules to decide the grades.

### Key Features

#### 1. "Don't Touch the Original!" (Immutable Input)
The system **never changes the original input**. It treats the input as "Read-Only". If a rule says "change `color` to `red`", it doesn't cross out the old color on the input; it just writes "Color: Red" on the new output sheet. This prevents mistakes where one rule accidentally messes up data for another rule.

#### 2. "First Rule Wins" (Priority)
Sometimes, multiple rules might try to set the same field.
*   **Rule 1 says**: "If the letter is urgent, set `priority` to `High`."
*   **Rule 5 says**: "If the patient is under 18, set `priority` to `Medium`."

What happens if both are true?
The system collects **all** possible answers ("High" and "Medium"). Then, it picks the **First One** that matched. So, if Rule 1 matched first, the priority is `High`. This ensures a clear order of operations.

#### 3. "The Kill Switch" (Deep Kill)
Some rules are so important that if they fail (or match a specific condition), the whole process should **stop immediately**.
*   **Example**: "If the letter has no patient ID, STOP EVERYTHING (Kill)."
*   If this happens, the system stops instantly and returns a special "Killed" report, explaining exactly why it stopped. No further rules are checked.

#### 4. "Two Birds, One Stone" (Multiple Assignments)
A single rule can set multiple things at once.
*   **Rule**: "If `condition` is `Critical`..."
*   **Outcome**: Set `priority = "High"` **AND** set `flag_color = "Red"`.
The system handles both of these assignments seamlessly from one check.

---

## 📚 Example by Analogy

**Scenario**: We are processing a **Referral Letter**.

**Input Data (The Letter):**
```json
{
  "type": "Urgent Referral",
  "patient_age": 12,
  "has_id": true
}
```

**The Rules:**
1.  **Check ID**: If `has_id` is FALSE -> **KILL** (Stop processing).
2.  **Set Status**: If `type` is "Urgent Referral" -> Set `status` = "Urgent".
3.  **Set Priority (Child)**: If `patient_age` < 18 -> Set `status` = "Pediatric Priority".

**The Process:**

1.  **Check ID**: It has an ID (`true`). Safe to continue.
2.  **Set Status**: Match! It adds Candidate #1 for `status`: **"Urgent"**.
3.  **Set Priority**: Match! It adds Candidate #2 for `status`: **"Pediatric Priority"**.

**The Final Result:**
The system looks at the `status` field. It sees two candidates ("Urgent", "Pediatric Priority").
It applies the **"First Rule Wins"** logic.
**Final Output**: `status` = **"Urgent"**.

---

## Technical Architecture

The project follows a modular architecture mainly consisting of:

-   **Entry Point (`app.js`)**: Configures the Express server.
-   **Routing (`routes/`)**: Defines API endpoints.
-   **Controllers (`controllers/`)**: Logic for handling requests.
-   **Transformation Engine (`src/transformation/`)**:
    -   `TransformationContext.js`: The "brain" that collects all candidates and handles the final decision.
    -   `generalProcessor.js`, `metricsHandler.js`, `readCodesHandler.js`: Specialized workers that process different parts of the rules.
    -   `ApplyRule.js` & `EvaluateRule.js`: The "judges" that check if a rule matches.
-   **Logging (`lib/logger.js`)**: Records every step. In production, it buffers logs and sends them to a central server.

---

## Installation & Running

### Prerequisites
- Node.js (v20+ recommended)
- npm

### Setup
1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Set up environment variables in `.env`.

### Running
-   **Development**: `npm run dev`
-   **Production**: `npm start`

---

## API Endpoints

### 1. Transform Data
**URL**: `/api/v1/transform/:inst_id/:letter_type`
**Method**: `POST`

**Request**:
```json
{
  "letter_type": "Discharge",
  "patient_name": "John Doe",
  ...
}
```

**Response (Success)**:
```json
{
  "status": "success",
  "output": {
    "status": "Urgent",
    "RecipientNotes": "Processed successfully."
  }
}
```
