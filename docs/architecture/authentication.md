# Host Authentication Architecture

Host authentication is decoupled from physical browser sessions and device IDs.

## Host Account Ownership
- **Account-Based Ownership**: A Room is owned by `hostUserId`.
- **JWT Session Tokens**: Signed via HMAC-SHA256 (`jose`) on the Edge.
- **Host Reconnect**: When a Host logs in on a new device or reconnects, the system authenticates the user ID and associates the new `hostDeviceId` with the existing room.
- **Zero Account Guest Flow**: Guests connect via human-friendly Room Codes (e.g. `A7K9P2`) and wait for Host approval without requiring an account.
