# API and Code File Map

This document provides a helicopter view of the main code files in the project, detailing their purpose, the components they contain, and the APIs they provide or interact with.

## `apps/api`

### `apps/api/src/main.ts`

*   **Location:** `apps/api/src/main.ts`
*   **Purpose:** The main entry point of the NestJS API application. It bootstraps the application, sets up middleware, configures CORS, and initializes Swagger for API documentation.
*   **Components:** None (it's a bootstrapping script).
*   **API:** None directly, but it configures and starts the entire API.

### `apps/api/src/app.module.ts`

*   **Location:** `apps/api/src/app.module.ts`
*   **Purpose:** The root module of the NestJS application. It imports and configures all other modules, controllers, and providers, including rate limiting, authentication, and core business logic.
*   **Components:** `AppModule` (NestJS Module).
*   **API:** None directly.

### `apps/api/src/app.controller.ts`

*   **Location:** `apps/api/src/app.controller.ts`
*   **Purpose:** The main controller of the application. It handles health checks, readiness probes, and some public-facing endpoints like site settings and page visit counters.
*   **Components:** `AppController` (NestJS Controller).
*   **API Endpoints:**
    *   `GET /api/v1/public/site-settings`: Retrieves public site settings.
    *   `GET /`: Returns a simple "Hello World!" message.
    *   `GET /health`: Health check endpoint.
    *   `GET /ready`: Readiness probe endpoint.
    *   `GET /api/v1/health`: Versioned health check.
    *   `GET /api/v1/ready`: Versioned readiness probe.
    *   `GET /api/v1/public/page-visits`: Retrieves the global page visit count.
    *   `POST /api/v1/public/page-visits/hit`: Increments the global page visit count.

### `apps/api/src/app.service.ts`

*   **Location:** `apps/api/src/app.service.ts`
*   **Purpose:** A sample service with a single method to return a "Hello World!" string.
*   **Components:** `AppService` (NestJS Service).
*   **API:** None.

### `apps/api/src/app.controller.spec.ts`

*   **Location:** `apps/api/src/app.controller.spec.ts`
*   **Purpose:** A test file for the `AppController`.
*   **Components:** None.
*   **API:** None.

### `apps/api/src/shared/correlation-id.middleware.ts`

*   **Location:** `apps/api/src/shared/correlation-id.middleware.ts`
*   **Purpose:** A NestJS middleware that ensures each incoming request has a unique correlation ID, which is useful for logging and tracing.
*   **Components:** `CorrelationIdMiddleware` (NestJS Middleware).
*   **API:** None.

### `apps/api/src/shared/csrf-origin.middleware.ts`

*   **Location:** `apps/api/src/shared/csrf-origin.middleware.ts`
*   **Purpose:** A NestJS middleware to protect against Cross-Site Request Forgery (CSRF) attacks by checking the request's origin against a list of allowed origins.
*   **Components:** `CsrfOriginMiddleware` (NestJS Middleware).
*   **API:** None.

### `apps/api/src/shared/json.logger.ts`

*   **Location:** `apps/api/src/shared/json.logger.ts`
*   **Purpose:** A custom logger that formats log messages as JSON, which is useful for structured logging and easier parsing by log management systems.
*   **Components:** `JsonLogger` (NestJS Logger).
*   **API:** None.

### `apps/api/src/shared/monitoring.ts`

*   **Location:** `apps/api/src/shared/monitoring.ts`
*   **Purpose:** This file contains functions for process monitoring, including logging startup information and potentially other metrics.
*   **Components:** None.
*   **API:** None.

### `apps/api/src/shared/request-logging.middleware.ts`

*   **Location:** `apps/api/src/shared/request-logging.middleware.ts`
*   **Purpose:** A NestJS middleware that logs incoming requests, providing visibility into the traffic the API is receiving.
*   **Components:** `RequestLoggingMiddleware` (NestJS Middleware).
*   **API:** None.

### `apps/api/src/shared/security-headers.middleware.ts`

*   **Location:** `apps/api/src/shared/security-headers.middleware.ts`
*   **Purpose:** A NestJS middleware that adds various security-related HTTP headers to the response, such as `X-Content-Type-Options`, `X-Frame-Options`, and `Content-Security-Policy`.
*   **Components:** `SecurityHeadersMiddleware` (NestJS Middleware).
*   **API:** None.

### `apps/api/src/shared/standard-http-exception.filter.ts`

*   **Location:** `apps/api/src/shared/standard-http-exception.filter.ts`
*   **Purpose:** A NestJS exception filter that catches `HttpException`s and formats the error response into a standardized JSON structure.
*   **Components:** `StandardHttpExceptionFilter` (NestJS Exception Filter).
*   **API:** None.

### `apps/api/src/auth/auth.controller.ts`

*   **Location:** `apps/api/src/auth/auth.controller.ts`
*   **Purpose:** This controller handles all authentication-related requests, including login, logout, password changes, and Google OAuth verification.
*   **Components:** `AuthController` (NestJS Controller).
*   **API Endpoints:**
    *   `POST /auth/login`: Authenticates a user with a username and password.
    *   `POST /auth/google/verify`: Verifies a Google ID token and authenticates the user.
    *   `POST /auth/logout`: Logs out the current user.
    *   `POST /auth/change-password`: Allows an authenticated user to change their password.
    *   `GET /auth/me`: Retrieves the profile of the currently authenticated user.

### `apps/api/src/auth/auth.module.ts`

*   **Location:** `apps/api/src/auth/auth.module.ts`
*   **Purpose:** The NestJS module for authentication. It bundles the `AuthController`, `AuthService`, and JWT strategy.
*   **Components:** `AuthModule` (NestJS Module).
*   **API:** None.

### `apps/api/src/auth/auth.service.ts`

*   **Location:** `apps/api/src/auth/auth.service.ts`
*   **Purpose:** The service responsible for the core authentication logic, such as validating users, generating JWTs, and interacting with the database for user data.
*   **Components:** `AuthService` (NestJS Service).
*   **API:** None.

### `apps/api/src/auth/auth.types.ts`

*   **Location:** `apps/api/src/auth/auth.types.ts`
*   **Purpose:** Contains TypeScript type definitions used throughout the authentication module, such as `JwtPayload` and `User`.
*   **Components:** None.
*   **API:** None.

### `apps/api/src/auth/db.util.ts`

*   **Location:** `apps/api/src/auth/db.util.ts`
*   **Purpose:** A utility file for database interactions, likely containing functions for connecting to the database and executing queries.
*   **Components:** None.
*   **API:** None.

### `apps/api/src/auth/jwt-auth.guard.ts`

*   **Location:** `apps/api/src/auth/jwt-auth.guard.ts`
*   **Purpose:** A NestJS guard that protects routes by verifying the JWT in the request's Authorization header.
*   **Components:** `JwtAuthGuard` (NestJS Guard).
*   **API:** None.

### `apps/api/src/auth/password-policy.spec.ts`

*   **Location:** `apps/api/src/auth/password-policy.spec.ts`
*   **Purpose:** A test file for the password policy logic.
*   **Components:** None.
*   **API:** None.

### `apps/api/src/auth/password-policy.ts`

*   **Location:** `apps/api/src/auth/password-policy.ts`
*   **Purpose:** Implements the application's password policy, including functions for hashing passwords and checking their strength.
*   **Components:** None.
*   **API:** None.

### `apps/api/src/auth/rbac-matrix.spec.ts`

*   **Location:** `apps/api/src/auth/rbac-matrix.spec.ts`
*   **Purpose:** A test file for the Role-Based Access Control (RBAC) matrix.
*   **Components:** None.
*   **API:** None.

### `apps/api/src/auth/roles.decorator.ts`

*   **Location:** `apps/api/src/auth/roles.decorator.ts`
*   **Purpose:** Defines a custom NestJS decorator (`@Roles`) to associate roles with specific routes, for use with the `RolesGuard`.
*   **Components:** None.
*   **API:** None.

### `apps/api/src/auth/roles.guard.ts`

*   **Location:** `apps/api/src/auth/roles.guard.ts`
*   **Purpose:** A NestJS guard that implements Role-Based Access Control (RBAC). It checks if the authenticated user has the required role to access a route.
*   **Components:** `RolesGuard` (NestJS Guard).
*   **API:** None.

## `apps/web`

### `apps/web/middleware.ts`

*   **Location:** `apps/web/middleware.ts`
*   **Purpose:** The main middleware for the Next.js application. It handles authentication and authorization for all incoming requests based on cookies and the requested path.
*   **Components:** `middleware` (Next.js Middleware).
*   **API:** None.

### `apps/web/app/layout.tsx`

*   **Location:** `apps/web/app/layout.tsx`
*   **Purpose:** The root layout for the entire application. This component wraps every page and includes global components like the network activity indicator and the back-to-top button.
*   **Components:** `RootLayout` (React Component).
*   **API:** None.

### `apps/web/app/page.tsx`

*   **Location:** `apps/web/app/page.tsx`
*   **Purpose:** The home page of the application. This component serves as the main landing page, displaying a hero section, login/register buttons, a chef message, and a footer with dynamic information.
*   **Components:** `HomePage` (React Component).
*   **API:**
    *   `GET /schoolcatering/api/v1/public/site-settings`: Fetches the chef message.
    *   `POST /schoolcatering/api/v1/public/page-visits/hit`: Increments the page visit counter.

### `apps/web/app/robots.ts`

*   **Location:** `apps/web/app/robots.ts`
*   **Purpose:** Generates the `robots.txt` file for the website, which instructs web crawlers on which pages to crawl or ignore.
*   **Components:** None.
*   **API:** None.

### `apps/web/app/sitemap.ts`

*   **Location:** `apps/web/app/sitemap.ts`
*   **Purpose:** Generates the `sitemap.xml` file for the website, which helps search engines understand the site's structure.
*   **Components:** None.
*   **API:** None.

### `apps/web/app/_components/back-to-top-global.tsx`

*   **Location:** `apps/web/app/_components/back-to-top-global.tsx`
*   **Purpose:** A global "Back to Top" button that appears when the user scrolls down the page.
*   **Components:** `BackToTopGlobal` (React Component).
*   **API:** None.

### `apps/web/app/_components/dev-page.tsx`

*   **Location:** `apps/web/app/_components/dev-page.tsx`
*   **Purpose:** A development page that includes links to various parts of the application and a form to change a user's password.
*   **Components:** `DevPage` (React Component).
*   **API:**
    *   `POST /auth/change-password`: Changes the user's password.

### `apps/web/app/_components/google-oauth-button.tsx`

*   **Location:** `apps/web/app/_components/google-oauth-button.tsx`
*   **Purpose:** Renders a Google OAuth "Sign In" button and handles the authentication flow.
*   **Components:** `GoogleOAuthButton` (React Component).
*   **API:**
    *   `POST /auth/google/verify`: Verifies the Google ID token.

### `apps/web/app/_components/logout-button.tsx`

*   **Location:** `apps/web/app/_components/logout-button.tsx`
*   **Purpose:** Provides a logout button and a "Record" button for certain roles.
*   **Components:** `LogoutButton` (React Component).
*   **API:**
    *   `POST /auth/logout`: Logs out the user.

### `apps/web/app/_components/network-activity-indicator.tsx`

*   **Location:** `apps/web/app/_components/network-activity-indicator.tsx`
*   **Purpose:** Displays a "Processing..." message when there is global network activity in the application.
*   **Components:** `NetworkActivityIndicator` (React Component).
*   **API:** None.

### `apps/web/app/_components/password-input.tsx`

*   **Location:** `apps/web/app/_components/password-input.tsx`
*   **Purpose:** A password input component with a "Show/Hide" button.
*   **Components:** `PasswordInput` (React Component).
*   **API:** None.

### `apps/web/app/_components/role-login-form.tsx`

*   **Location:** `apps/web/app/_components/role-login-form.tsx`
*   **Purpose:** A login form that is reused for different user roles.
*   **Components:** `RoleLoginForm` (React Component).
*   **API:**
    *   `POST /auth/login`: Authenticates the user.

### `apps/web/app/admin/page.tsx`

*   **Location:** `apps/web/app/admin/page.tsx`
*   **Purpose:** The admin dashboard page, which displays a lot of information and provides some administrative controls.
*   **Components:** `AdminPage` (React Component).
*   **API:** 
    *   `GET /admin/dashboard`: Fetches dashboard data.
    *   `GET /admin/site-settings`: Fetches site settings.
    *   `PATCH /admin/site-settings`: Updates site settings.

### `apps/web/app/admin/_components/admin-nav.tsx`

*   **Location:** `apps/web/app/admin/_components/admin-nav.tsx`
*   **Purpose:** Renders the navigation bar for the admin section.
*   **Components:** `AdminNav` (React Component).
*   **API:**
    *   `POST /auth/logout`: Logs out the admin user.

### `apps/web/app/admin/login/page.tsx`

*   **Location:** `apps/web/app/admin/login/page.tsx`
*   **Purpose:** Renders the login page for the Admin role.
*   **Components:** `AdminLoginPage` (React Component).
*   **API:** (Handled by `RoleLoginForm`)

### `apps/web/app/admin/billing/page.tsx`

*   **Location:** `apps/web/app/admin/billing/page.tsx`
*   **Purpose:** Provides an interface for managing billing, including viewing, verifying, and rejecting payments, and generating receipts.
*   **Components:** `AdminBillingPage` (React Component).
*   **API:**
    *   `GET /admin/billing`: Fetches billing data.
    *   `POST /admin/billing/{id}/verify`: Approves or rejects a payment.
    *   `GET /admin/billing/{id}/proof-image`: Fetches a payment proof image.
    *   `POST /admin/billing/{id}/receipt`: Generates a receipt.
    *   `DELETE /admin/billing/{id}`: Deletes a billing record.
    *   `GET /admin/billing/{id}/receipt-file`: Fetches a receipt PDF file.

### `apps/web/app/admin/blackout-dates/page.tsx`

*   **Location:** `apps/web/app/admin/blackout-dates/page.tsx`
*   **Purpose:** Allows admins to manage blackout dates for ordering and service.
*   **Components:** `AdminBlackoutDatesPage` (React Component).
*   **API:**
    *   `GET /blackout-days`: Fetches blackout dates.
    *   `POST /blackout-days`: Creates a new blackout date.
    *   `DELETE /blackout-days/{id}`: Deletes a blackout date.
