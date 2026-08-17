const fs = require('fs');
const path = require('path');

const workerPath = path.join(__dirname, '..', '.open-next', 'worker.js');
let content = fs.readFileSync(workerPath, 'utf8');

// 1. Inject StageRoom export if missing
if (!content.includes('export { StageRoom }')) {
  content += '\nexport { StageRoom } from "../workers/stage-room.ts";\n';
}

// 2. Inject WebSocket-ONLY interceptor with D1 room validation.
//
// IMPORTANT: Only WebSocket upgrade requests are intercepted here and routed
// directly to the Durable Object (bypassing Next.js, because Next.js does not
// support WebSocket upgrades).
//
// HTTP GET requests for /api/ws are NOT intercepted — they go through Next.js
// normally, which performs D1 room validation and passes the correct hostUserId
// and title query params to the Durable Object.
//
// For WebSocket requests, we perform an inline D1 lookup to:
//   a) Validate the room code exists (return 404 if not found)
//   b) Resolve the correct hostUserId so the DO can properly determine
//      whether a connecting device is a host or a guest.
const target = 'const url = new URL(request.url);';
const interceptor = `const url = new URL(request.url);
            if (url.pathname === "/api/ws" && env.STAGE_ROOM && request.headers.get("Upgrade") === "websocket") {
                const roomCode = (url.searchParams.get("roomCode") || "DEFAULT").toUpperCase();
                let hostUserId = "host-user";
                let roomTitle = "Stage Room";
                try {
                    if (env.DB) {
                        const row = await env.DB.prepare(
                            "SELECT host_user_id, name FROM rooms WHERE room_code = ? AND status = 'ACTIVE' LIMIT 1"
                        ).bind(roomCode).first();
                        if (!row) {
                            return new Response(JSON.stringify({ error: "ROOM_NOT_FOUND" }), {
                                status: 404,
                                headers: { "Content-Type": "application/json" }
                            });
                        }
                        hostUserId = String(row.host_user_id);
                        roomTitle = String(row.name);
                    }
                } catch (_e) {
                    // If D1 is unavailable, continue with defaults so existing sessions survive
                }
                const wsUrl = new URL(request.url);
                wsUrl.searchParams.set("hostUserId", hostUserId);
                wsUrl.searchParams.set("title", roomTitle);
                const doId = env.STAGE_ROOM.idFromName(roomCode);
                const stub = env.STAGE_ROOM.get(doId);
                return stub.fetch(new Request(wsUrl.toString(), request));
            }`;

if (content.includes(target) && !content.includes('url.pathname === "/api/ws"')) {
  content = content.replace(target, interceptor);
  console.log('⚡ WebSocket-only StageRoom interceptor with D1 validation injected into worker.js');
}

fs.writeFileSync(workerPath, content, 'utf8');
console.log('✅ StageRoom injection complete.');
