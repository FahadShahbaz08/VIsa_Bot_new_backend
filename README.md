# Visa Bot backend

## Setup

Run these commands from this backend's own directory using Node.js 22.12+ and npm:

```powershell
npm.cmd ci
Copy-Item .env.example .env
```

Edit `.env` locally with your actual `MONGO_URI`, a strong `JWT_SECRET`, and `PORT=4000`. Never commit `.env`. The other backend needs its own environment configuration. A secret can be generated with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

```powershell
npm.cmd start
```

The server connects to MongoDB before listening. Missing/invalid database configuration exits with a sanitized error. Logs only report whether the URI is configured; they never print it or the driver's raw connection error. `GET /` is a public liveness response (`status: ok`), not an ongoing database readiness probe.

The separate frontend lives at `D:\Github Projects\Websites\Visa-Bot-Frontend`. Configure its public `VITE_API_BASE_URL` to point here; the user list loads automatically. To run both backends simultaneously, assign distinct ports. No frontend files belong in this repository.

## Admin API

Admin endpoints intentionally require no key or authentication. Anyone who can reach the backend URL can list, create, reset, and delete users. Admin responses use `Cache-Control: no-store`.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/admin/users` | `{ users: [{ id, username, email, allowedDevicesCount, status, createdAt, lastLoginAt, devices }] }`; no password hashes |
| POST | `/admin/users` | Create with `{ username, email, password, allowedDevicesCount: 1, status: "active" }`; returns 201 and `userId` |
| POST | `/admin/users/:id/reset-devices` | Clear registrations; `cleared` is the number of devices removed |
| DELETE | `/admin/users/:id` | Delete account, device records, and payment records |

`/admin/create-user` remains an alias; `/admin/add-device` and `/admin/update-payment` also require no key. Invalid IDs or create input return 400, unknown users return 404, and duplicate username/email returns 409 (including concurrent unique-index conflicts). Username is trimmed; email is trimmed/lowercased. Usernames remain case-sensitive. Passwords need 8+ characters and at most 72 UTF-8 bytes; device limits must be JSON integers from 1 to 100; status is active/inactive.

User creation is a single database write. Login/add-device creates a device document when needed. Reset is atomic for the existing device document and does not create an unnecessary empty document. Reset does not revoke previously issued JWTs.

Deletion removes related data before the account, so cleanup failures leave an account that can be retried. This works on standalone MongoDB as well as Atlas. It is not a multi-document transaction: concurrent login/admin writes during deletion are not serialized, and a failed cleanup can partially clear related data. Avoid concurrent changes to an account being deleted. Retry deletion on failure.

## Tests

```powershell
npm.cmd test
```

Tests use `mongodb-memory-server` to start a real temporary MongoDB process. They do not load `.env` or access your configured database. The first run needs internet access to download a MongoDB binary; later runs reuse its cache. Tests cover public health, CORS, key-free admin access, creation/validation, password hashing, duplicate races, response field safety, device-limit/login/reset behavior, deletion cleanup and retry, malformed JSON, and sanitized DB configuration logging.

`app.js` exports Express without opening a database or port, enabling integration tests. `server.js` remains the production entry point. Existing user login behavior is otherwise preserved.
