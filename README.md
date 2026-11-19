# Telegram Web Clone

A simplified, real-time web messenger inspired by **Telegram Web**, built with **Node.js**, **Express**, **native WebSockets (`ws`)**, **MongoDB (`mongoose`)**, and **pure Vanilla HTML/CSS/JavaScript (ES Modules)**.

---

## 1. Purpose & Goals of This Project

### Why This Project Exists
This project demonstrates how to build a real-time, full-stack chat application using **Clean Architecture** and enterprise backend/frontend design patterns **without** heavy frameworks, bundlers, or abstraction bloat:
- **Zero frontend frameworks or build tools:** Pure HTML5 (`<template>`, `<dialog>`), CSS3, and native browser ES Modules (`type="module"`).
- **Zero Socket.IO overhead:** Direct, lightweight bi-directional messaging built on the `ws` library (backend) and native browser `WebSocket` API (frontend).
- **Strict separation of concerns:** Business logic lives inside an isolated Domain and Application core, decoupled from Express, Mongoose, and WebSockets via interfaces and manual Dependency Injection.

### Core Functionality
1. **Authentication & Stateless Sessions:**
   - User registration (`POST /api/auth/register`), login (`POST /api/auth/login`), and session restoration (`GET /api/auth/me`).
   - Passwords hashed with `bcrypt` (10 salt rounds) and authenticated via signed **JWT** (`Bearer` header for REST API, `?token=` query parameter for WebSocket upgrade).
2. **Global User Search:**
   - Top sidebar search bar with a **300ms client-side debounce** querying users by username prefix (minimum 2 characters).
3. **1-on-1 Direct Chats:**
   - Clicking a user in search results opens an existing direct chat or creates a new one (`POST /api/chats/direct`), resolving each participant's display title to the peer's `displayName` and notifying the recipient in real time (`chat:created`).
   - Either participant (creator or recipient) can delete a 1-on-1 chat (`DELETE /api/chats/:chatId`), permanently removing the chat and its message history for both users in real time (`chat:deleted`).
4. **Multi-User Group Chats:**
   - Native `<dialog>` modal allowing users to set a group title, search and select multiple members, and create a group (`POST /api/chats/group`) with the creator assigned as `owner`.
   - Group owners can permanently delete the group and all its messages (`DELETE /api/chats/:chatId`), removing it from all members' sidebars in real time (`chat:deleted`).
5. **Real-Time Messaging, Deletion, Read Receipts & Live Presence:**
   - Atomic message creation (`message:send` → `message:new`) and message deletion (`DELETE /api/chats/:chatId/messages/:messageId` or WS `message:delete` → `message:deleted`) with `chat.lastMessage` recalculation via the **Unit of Work** pattern.
   - Instant `message:new` delivery across multiple open browser tabs per user, live sidebar `lastMessage` preview and chat reordering, and throttled `"user is typing..."` (`chat:typing`) indicators.
   - **Read Receipts (`message:read`):** Tracks `readBy` user IDs per message, automatically marks unread incoming messages as viewed when an active chat tab is visible, and updates sender message checkmarks live (`✓` unviewed, `✓✓` viewed).

---

## 2. Requirements & Versions

### Runtime & Software Versions
| Requirement | Minimum / Recommended | Verified in Workspace | Notes |
| :--- | :--- | :--- | :--- |
| **Node.js** | `>= 18.0.0` LTS (Recommended: `20+` or `24+`) | `v24.22.0` | Required for native `fetch`, `URL`, `mongoose@8`, and `ws@8`. |
| **npm** | `>= 9.0.0` | `11.19.1` | Bundled with Node.js. |
| **MongoDB** | `>= 6.0` (Local Community Server or MongoDB Atlas) | `8.2.12` | Replica Set recommended for `UnitOfWork` transactions; standalone local instances are also supported via built-in fallback. |
| **Web Browser** | Modern Chromium, Firefox, or Safari | — | Must support ES Modules (`<script type="module">`), `WebSocket`, `fetch`, and `<dialog>`. |

### Package Dependencies (Local to Project)
Defined in `package.json`:
- **Production:** `express` (`^4.21.0`), `ws` (`^8.18.0`), `mongoose` (`^8.7.0`), `dotenv` (`^16.4.5`), `bcrypt` (`^5.1.1`), `jsonwebtoken` (`^9.0.2`)
- **Development:** `nodemon` (`^3.1.7`)

### Global Setup Needed Before Starting
You do **not** need to install any global npm packages (such as `nodemon`, `webpack`, or `typescript`). Globally on your machine, you only need:
1. **Node.js & npm** installed and available in `PATH`.
2. **A running MongoDB server** (either a local MongoDB service on `mongodb://127.0.0.1:27017` or a MongoDB Atlas connection string).
3. **An `.env` file** in the project root (copied from `.env.example`) configuring `PORT`, `MONGO_URI`, `JWT_SECRET`, and `JWT_EXPIRES_IN`.

---

## 3. Architecture Overview

The backend follows a **5-layer Clean Architecture** where dependencies point strictly inward toward `domain/`, wired together at startup in `backend/container.js`.

```text
  [ Presentation ]   ──▶  HTTP (Express Controllers, Middlewares) & WebSocket Gateway
         │
         ▼
  [ Application ]    ──▶  Use-Case Services (Auth, User, Chat, Message)
         │
         ▼
  [ Domain Core ]    ◀──  Entities, Exceptions, Repository & Notifier Interfaces (0 external deps)
         ▲
         │  (implements)
  [ Persistence & Infrastructure ] ──▶ Mongoose Repos, UnitOfWork, JWT, Bcrypt, Logger, WS Manager
```

### Layer Breakdown
1. **Domain Layer (`backend/domain/`):**
   - Zero external dependencies (`express`, `mongoose`, `ws`, `bcrypt`, `jsonwebtoken` are forbidden here).
   - **Models:** `User` (with `toPublicProfile()`), `Chat` (with `hasMember(userId)`, `isGroup()`, `isOwner(userId)`), `Message` (with normalized `readBy` tracking).
   - **Exceptions:** `DomainException` base class extended into `ValidationException` (`400`), `UnauthorizedException` (`401`), `ForbiddenException` (`403`), `NotFoundException` (`404`), and `ConflictException` (`409`).
   - **Interfaces:** `IUnitOfWork`, `IUserRepository`, `IChatRepository`, `IMessageRepository`, `IConnectionManager`, `IRealtimeNotifier`.
2. **Application Layer (`backend/application/`):**
   - `AuthService`, `UserService`, `ChatService`, `MessageService`, and `PresenceService` receive all dependencies via **Constructor Dependency Injection** and depend exclusively on `domain/`, alongside `dtos/` and `mappers/` (`ChatDtoMapper`, `MessageDtoMapper`).
3. **Persistence Layer (`backend/persistence/`):**
   - `MongoDbContext`: manages `mongoose.connect()` / `disconnect()` and lifecycle logging.
   - `UnitOfWork`: wraps multi-document writes (`MessageRepository.create`/`deleteById` + `ChatRepository.updateLastMessage`, and `MessageRepository.deleteByChatId` + `ChatRepository.deleteById`) in a Mongoose transaction via `AsyncLocalStorage`, with a graceful fallback if running against a standalone local MongoDB without a replica set.
   - `schemas/` & `repositories/`: Mongoose schemas with compound indexes (`{ 'members.userId': 1, updatedAt: -1 }`, `{ chatId: 1, createdAt: -1 }`) and repositories that map documents back into clean Domain entities.
4. **Infrastructure Layer (`backend/infrastructure/`):**
   - `Logger` (structured JSON with ISO timestamps), `PasswordHasher` (`bcrypt`), `JwtProvider` (`jsonwebtoken`), `ConnectionManager` (`Map<userId, Set<WebSocket>>` supporting multiple open tabs per user), and `WsRealtimeNotifier` (implements `IRealtimeNotifier`).
5. **Presentation Layer (`backend/presentation/`) & Composition Root:**
   - **HTTP:** `asyncHandler`, `authMiddleware`, `rateLimitMiddleware`, `securityHeadersMiddleware`, `globalExceptionMiddleware`, controllers (`AuthController`, `UserController`, `ChatController`), `/api` router, and static serving of `frontend/`.
   - **WebSockets:** `WsGatewayController` attached to `/ws` on the shared HTTP server.
   - **Composition Root (`backend/container.js`) & Entry Point (`backend/server.js`):** Instantiates and wires every layer, connects MongoDB, and starts the shared HTTP + WebSocket server.
6. **Frontend (`frontend/`):**
   - **Core (`frontend/js/core/`):** `Store.js` (Observer pattern), `HttpClient.js` (`fetch` wrapper + JWT + `auth:unauthorized` event), `SocketClient.js` (native `WebSocket` with exponential-backoff reconnect and store sync), `UserSearchController.js`, `formatters.js`.
   - **Models & DTOs (`frontend/js/models/`):** `AuthDto.js`, `UserModel.js`, `ChatModel.js`, `MessageModel.js`, `TypingIndicatorDto.js`.
   - **Views (`frontend/js/views/`):** `AuthView.js`, `SidebarView.js`, `ChatView.js`, `GroupModalView.js` using `<template>` cloning and `.textContent` for XSS-safe rendering.

---

## 4. Folder Structure

```text
telegram-web-clone/
├── package.json
├── .env.example
├── .env
├── README.md
├── backend/
│   ├── server.js
│   ├── container.js
│   ├── config/env.js
│   ├── domain/
│   │   ├── exceptions/
│   │   ├── interfaces/
│   │   └── models/
│   ├── application/
│   │   ├── dtos/
│   │   ├── mappers/
│   │   └── services/
│   ├── persistence/
│   │   ├── MongoDbContext.js
│   │   ├── UnitOfWork.js
│   │   ├── schemas/
│   │   └── repositories/
│   ├── infrastructure/
│   │   ├── logging/
│   │   ├── realtime/
│   │   └── security/
│   └── presentation/
│       ├── http/
│       └── ws/
├── frontend/
│   ├── index.html
│   ├── css/main.css
│   └── js/
│       ├── main.js
│       ├── core/
│       ├── models/
│       └── views/
└── tests/
    ├── setup/
    ├── unit/
    ├── integration/
    └── ws/
```

---

## 5. API & WebSocket Reference

### REST API (`/api`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Register a new user and receive `{ token, user }` |
| `POST` | `/api/auth/login` | Public | Authenticate user and receive `{ token, user }` |
| `GET` | `/api/auth/me` | Bearer JWT | Get the currently authenticated user's profile |
| `GET` | `/api/users/search?q=` | Bearer JWT | Prefix search users by username (min 2 chars) |
| `GET` | `/api/chats` | Bearer JWT | List user's chats sorted by recent activity |
| `POST` | `/api/chats/direct` | Bearer JWT | Get or create a 1-on-1 chat (`{ targetUserId }`) |
| `POST` | `/api/chats/group` | Bearer JWT | Create a group chat (`{ title, memberIds }`) |
| `DELETE` | `/api/chats/:chatId` | Bearer JWT | Delete a direct chat (either participant) or group chat (owner only) |
| `GET` | `/api/chats/:chatId/messages` | Bearer JWT | Fetch chronological message history for a chat |
| `DELETE` | `/api/chats/:chatId/messages/:messageId` | Bearer JWT | Delete your own message and recalculate `chat.lastMessage` |

### WebSocket Protocol (`/ws?token=<JWT>`)
- **Client → Server:**
  - `message:send` — `{ chatId, text }`
  - `message:delete` — `{ chatId, messageId }`
  - `message:read` — `{ chatId, upToMessageId? }`
  - `chat:typing` — `{ chatId }`
- **Server → Client:**
  - `message:new` — `{ id, chatId, senderId, senderName, text, readBy, createdAt }`
  - `message:deleted` — `{ chatId, messageId, lastMessage }`
  - `message:read` — `{ chatId, readerId, messageIds }`
  - `chat:created` — enriched chat DTO
  - `chat:deleted` — `{ chatId }`
  - `chat:typing` — `{ chatId, userId, username }`
  - `error` — `{ code, message }` (invalid handshakes close with code `4001`)

---

## 6. Getting Started

1. **Navigate to the project directory**
   *(On Windows PowerShell, use `-LiteralPath` if a parent directory name contains `[...]`)*:
   ```powershell
   Set-Location -LiteralPath "<You project path>"
   ```

2. **Install dependencies:**
   ```powershell
   npm install
   ```

3. **Configure environment variables:**
   Copy `.env.example` to `.env` and adjust values as needed:
   ```env
   PORT=3000
   MONGO_URI=mongodb://127.0.0.1:27017/telegram_clone
   JWT_SECRET=super_secret_jwt_key
   JWT_EXPIRES_IN=7d
   ```
   > **Tip:** Add `?replicaSet=rs0` to `MONGO_URI` if running against a local MongoDB replica set or use your MongoDB Atlas SRV URI to enable multi-document ACID transactions. For standalone local MongoDB, omit `?replicaSet=rs0`.

4. **Start the application (Backend + Frontend):**
   - Normal start:
     ```powershell
     npm start
     ```
   - Development mode with auto-reload (`nodemon`):
     ```powershell
     npm run dev
     ```

5. **Open in browser:**
   Visit **`http://localhost:3000`**. Register two accounts across two browser windows (or an incognito tab) to test user search, direct chats, group chats, typing indicators, live messaging, message read receipts (`✓` / `✓✓`), and message/chat deletion.

6. **Run automated tests:**
   ```powershell
   npm test              # Full suite (unit + integration + WebSocket E2E)
   npm run test:unit     # Unit tests only
   npm run test:integration
   npm run test:ws
   ```
