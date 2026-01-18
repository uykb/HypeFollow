# HypeFollow Agent Guidelines

This document provides instructions and guidelines for AI agents working on the HypeFollow repository.

## 1. Build, Lint, and Test Commands

### Running the Application
*   **Start Backend**: `npm start` (Runs `src/index.js`)
*   **Development Mode**: `npm run dev` (Uses `nodemon` for auto-restart)
*   **Start Monitoring Server**: `npm run monitor` (Runs `src/monitoring/api-server.js`)

### Testing
There is no centralized test runner like Jest configured in `package.json`. Tests are standalone Node.js scripts located in the `tests/` directory.

*   **Run a specific test**:
    ```bash
    node tests/test-calculation.js
    node tests/test-api-security.js
    node tests/test-order-validation.js
    ```
*   **Creating new tests**: Create a new `.js` file in `tests/`, require necessary modules (mocking dependencies where needed), and use the built-in `assert` module.

### Dashboard (Frontend)
The `dashboard/` directory contains a React application (likely Vite-based).
*   **Build Dashboard**: `cd dashboard && npm run build`
*   **Dev Dashboard**: `cd dashboard && npm run dev`
*   **Lint Dashboard**: Check `dashboard/package.json` for lint commands (usually `npm run lint`).

## 2. Code Style and Conventions

### Environment & Modules
*   **Runtime**: Node.js
*   **Module System**: **CommonJS** (`require` / `module.exports`). Do not use ES Modules (`import`/`export`) in backend code (`src/`).
*   **Configuration**: Uses the `config` module. Do not hardcode secrets or environment-dependent values; use `config/default.js` or environment variables.

### Formatting
*   **Indentation**: **2 spaces**.
*   **Semicolons**: **Yes**, always use semicolons.
*   **Quotes**: Use **single quotes** (`'`) for strings, unless interpolating (`backticks`).
*   **Braces**: K&R style (open brace on the same line).
*   **Trailing Commas**: Avoid trailing commas in function argument lists if supporting older Node versions, but generally acceptable in arrays/objects.

### Naming Conventions
*   **Variables/Functions**: `camelCase` (e.g., `calculateQuantity`, `orderMapper`).
*   **Classes**: `PascalCase` (e.g., `HyperliquidWS`, `BinanceClient`).
*   **Constants**: `UPPER_CASE` for file-level constants (e.g., `MOCK_HL_EQUITY`, `DEFAULT_TIMEOUT`).
*   **Files**: `kebab-case` (e.g., `order-validator.js`, `api-client.js`).
*   **Private Methods**: Prefix with underscore `_` if intended to be private (e.g., `_connectWebSocket`), though JS doesn't enforce this.

### Type Safety
*   This is a JavaScript project (no TypeScript).
*   Use JSDoc comments for complex functions to document parameters and return types.
    ```javascript
    /**
     * Calculate quantity based on ratio
     * @param {string} coin - The coin symbol (e.g., 'BTC')
     * @param {number} masterSize - The size of the master order
     * @returns {Promise<number>} - The calculated follower size
     */
    ```

### Error Handling
*   **Logging**: Use the custom logger (`src/utils/logger.js`) instead of `console.log`.
    *   `logger.info('message')`
    *   `logger.warn('message', { context })`
    *   `logger.error('message', error)`
*   **Try-Catch**: Use `try-catch` blocks for async operations, especially external API calls (Binance, Hyperliquid) and Redis operations.
*   **Process Exit**: Only use `process.exit(1)` in critical startup failures (e.g., API security validation in `index.js`).
*   **Async/Await**: Prefer `async/await` over raw Promises or callbacks for cleaner readability.

## 3. Architecture & Key Patterns

### Directory Structure
*   `src/core/`: Business logic (Order execution, Position tracking, Consistency engine).
*   `src/binance/`: Binance API integration.
*   `src/hyperliquid/`: Hyperliquid WebSocket client.
*   `src/utils/`: Utilities (Logger, Redis, Validators).
*   `src/monitoring/`: Express server for status monitoring.

### Critical Components
*   **Redis**: Used heavily for state management (Order mappings, Position deltas).
    *   **Keys**:
        *   `map:h2b:<hyper_oid>`: Maps Hyperliquid Order ID to Binance Order ID.
        *   `map:b2h:<binance_oid>`: Reverse mapping.
        *   `orderHistory:<oid>`: Tracks processed orders to prevent duplicates.
        *   `pos:delta:<coin>`: Tracks pending position delta (lag).
    *   **TTL**: Most keys have expiration (e.g., 7 days) to prevent memory leaks.
*   **Order Mapper**: Maintains the link between Hyperliquid OIDs and Binance OrderIDs.
*   **Consistency Engine**: Ensures state integrity between the two exchanges.
*   **One-Way Mode**: The system strictly enforces One-Way Mode on Binance Futures.

### Deployment
*   Docker is supported (`Dockerfile`, `docker-compose.yml`).
*   Environment variables are loaded via `.env` (using `dotenv`).
*   **Production**: Ensure `NODE_ENV=production` is set.

## 4. Workflow Rules
1.  **Mocking**: When writing tests, mock external dependencies (Redis, Binance API) to avoid side effects. See `tests/test-calculation.js` for examples of mocking.
2.  **Safety**: Never commit API keys or secrets. Check `.gitignore` to ensure `.env` and `config/local.js` are excluded.
3.  **Logs**: Ensure error logs include stack traces or context objects for easier debugging.
4.  **Dependencies**: Check `package.json` before adding new dependencies. Prefer existing libraries (e.g., `axios`, `date-fns` if available).
