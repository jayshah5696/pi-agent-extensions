# ask_user Test Cases

**Purpose:** Define comprehensive test coverage before implementation
**Status:** Draft - Awaiting approval

---

## Test Categories

### 1. Schema Validation
### 2. Interactive Mode (TUI)
### 3. Non-Interactive Mode (Print)
### 4. RPC Mode
### 5. Session Persistence
### 6. Edge Cases
### 7. Integration

---

## 1. Schema Validation Tests

### 1.1 Valid Parameters
- ✓ Single text question (no options)
- ✓ Single question with options
- ✓ Single question with options + descriptions
- ✓ Single question with header
- ✓ Multiple questions
- ✓ Question with multiSelect: true
- ✓ Question with metadata

### 1.2 Invalid Parameters
- ✗ Empty questions array
- ✗ Question with empty string
- ✗ Option with empty label
- ✗ Invalid multiSelect value (not boolean)
- ✗ Malformed option (missing required fields)

**Test File:** `tests/ask-user/schema.test.ts`

---

## 2. Interactive Mode (TUI) Tests

### 2.1 Single Text Question
**Setup:** Question with no options
**Expected:**
- Shows text input replacing editor
- Header displayed if provided
- User types answer
- Enter submits → returns `{ answered: true, answers: [{answer: "typed text", wasCustom: true}] }`
- Esc cancels → returns `{ answered: false, cancelled: true }`

### 2.2 Single Select Question
**Setup:** Question with 3 options
**Expected:**
- Shows numbered options (1, 2, 3, 4. Other)
- Up/Down navigation works
- Number keys (1-3) select directly
- Enter on option returns selected
- "Other" option allows text input
- Descriptions shown below labels

### 2.3 Multi-Select Question
**Setup:** Question with `multiSelect: true`
**Expected:**
- Shows checkboxes `[ ]` and `[x]`
- Space toggles selection
- Multiple selections allowed
- Enter submits all selected
- Returns `answer` as string array

### 2.4 Multiple Questions (Tabbed)
**Setup:** 3 questions in array
**Expected:**
- Shows tab bar with question indicators (□ = unanswered, ■ = answered)
- Tab/Arrow keys navigate between questions
- Each question shows correctly
- Submit tab appears after all questions
- Can only submit when all answered
- Esc shows confirmation if any answered

### 2.5 Long Options List
**Setup:** Question with 15 options
**Expected:**
- Scrollable list with "↓ N more..." indicator
- Number keys 1-9 work for first 9 options
- Scrolling reveals all options
- "Other" is always last (accessible via 0 or scroll)

### 2.6 Answer Length Warning
**Setup:** User types 2500 character answer
**Expected:**
- Warning shows: "Answer is long (2,500 chars). Continue? [Y/n]"
- Y allows submission
- N returns to editing

### 2.7 Cancellation Behavior
**Setup:** Multi-question, user answers 2 of 3, presses Esc
**Expected:**
- Confirmation dialog: "Discard 2 answers? [Y/n]"
- Y cancels all, returns `{ answered: false, cancelled: true }`
- N returns to questions

**Test File:** `tests/ask-user/interactive.test.ts` (requires TUI mocking)

---

## 3. Non-Interactive Mode (Print) Tests

### 3.1 Pending File Creation
**Setup:** Call ask_user in print mode (`pi -p`)
**Expected:**
- Creates `.pi/pending-questions.json`
- Returns message with instructions
- File contains: sessionId, timestamp, questions with answer: null
- Tool result has `{ answered: false, pendingFile: ".pi/pending-questions.json" }`

### 3.2 Natural Language Answer Parsing
**Setup:** Pending file exists, run `pi -p @.pi/pending-questions.json "postgres and call it api-service"`
**Expected:**
- LLM parses natural language
- Fills in answers correctly
- Deletes pending file
- Returns `{ answered: true, answers: [...] }`

### 3.3 JSON Direct Edit
**Setup:** User edits pending JSON, adds answers, runs `pi -c`
**Expected:**
- Reads answers from JSON
- Validates format
- Returns answers to LLM
- Deletes pending file

### 3.4 Inline Answers Flag
**Setup:** `pi -p --answers '["PostgreSQL", "api-service"]'`
**Expected:**
- Parses JSON array
- Matches to questions in order
- Returns answers
- No pending file created

**Test File:** `tests/ask-user/print-mode.test.ts`

---

## 4. RPC Mode Tests

### 4.1 Request Format
**Setup:** ask_user called in RPC mode
**Expected:**
- Returns structured JSON with type: "ask_user_request"
- Includes requestId, questions, metadata

### 4.2 Response Handling
**Setup:** RPC client sends ask_user_response
**Expected:**
- Validates response format
- Matches requestId
- Returns answers to LLM

### 4.3 Client Disconnection
**Setup:** Request sent, client disconnects before responding
**Expected:**
- Timeout after N seconds (configurable)
- Returns `{ answered: false, connectionLost: true }`

**Test File:** `tests/ask-user/rpc-mode.test.ts`

---

## 5. Session Persistence Tests

### 5.1 Tool Result Storage
**Setup:** User answers questions
**Expected:**
- Tool result stored in session with details:
  - questions array
  - answers array
  - answeredAt timestamp
  - mode: "interactive" | "print" | "rpc"
  - metadata (if provided)

### 5.2 Session Branching
**Setup:** Navigate to before ask_user, continue from there
**Expected:**
- ask_user replays (no answer yet)
- User can provide different answer
- New branch created with new answer

### 5.3 Session Resumption
**Setup:** `pi -c` after answering questions
**Expected:**
- Previous Q&A visible in session history
- Can reference answers later

**Test File:** `tests/ask-user/persistence.test.ts`

---

## 6. Edge Cases Tests

### 6.1 Session Interruption
**Setup:** Terminal closed mid-question
**Expected:**
- On `pi -c`, question replays from beginning
- No partial state saved

### 6.2 Empty Options Array
**Setup:** Question with `options: []`
**Expected:**
- Treated as text input question
- No "Other" option shown

### 6.3 Single Option
**Setup:** Question with 1 option
**Expected:**
- Shows option + "Other"
- User can still select option or type custom

### 6.4 Extremely Long Question Text
**Setup:** Question text is 500 characters
**Expected:**
- Text wraps properly
- UI remains usable

### 6.5 Unicode/Emoji in Options
**Setup:** Options contain emoji and Unicode
**Expected:**
- Renders correctly
- Selectable without issues

### 6.6 Duplicate Tool Call
**Setup:** LLM calls ask_user twice in same turn
**Expected:**
- Both questions shown (batched or sequential - TBD)
- OR second call returns warning about duplicate

### 6.7 No UI Available (ctx.hasUI = false)
**Setup:** Extension loaded in non-interactive environment
**Expected:**
- Returns error message
- Does not attempt to show UI

**Test File:** `tests/ask-user/edge-cases.test.ts`

---

## 7. Integration Tests

### 7.1 Compaction with Q&A
**Setup:** Session with ask_user calls, trigger compaction
**Expected:**
- Q&A included in summary
- Structured data preserved

### 7.2 Tool Rendering
**Setup:** View session with ask_user calls
**Expected:**
- Tool call renders with question text
- Tool result renders with answers
- Custom rendering works

### 7.3 With Other Tools
**Setup:** LLM calls ask_user, then bash, then edit
**Expected:**
- No interference between tools
- State isolated correctly

**Test File:** `tests/ask-user/integration.test.ts`

---

## Test Implementation Strategy

### Unit Tests (High Priority)
- Schema validation
- Answer parsing logic
- Session persistence logic
- Print mode file I/O

### Integration Tests (Medium Priority)
- Tool registration
- RPC protocol
- Compaction integration

### UI Tests (Low Priority / Manual)
- Interactive TUI flows
- Visual rendering
- Keyboard navigation

**Note:** TUI tests require mocking or headless testing framework. May start with manual testing for UI, automated for logic.

---

## Questions for Approval

1. **TUI Testing Approach:** Should we mock the TUI for automated tests, or do manual testing for UI?
2. **Duplicate ask_user calls:** Should we batch them or handle sequentially?
3. **RPC timeout:** What should the default timeout be? 30s? 60s? Configurable?
4. **Test coverage target:** Aim for 80%? 90%?

---

**Status:** Ready for review and approval before implementation begins.
