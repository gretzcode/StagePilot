const fs = require('fs');
const path = require('path');

const workerPath = path.join(__dirname, '..', '.open-next', 'worker.js');
let content = fs.readFileSync(workerPath, 'utf8');

// 1. Inject StageRoom export if missing
if (!content.includes('export { StageRoom }')) {
  content += '\nexport { StageRoom } from "../workers/stage-room.ts";\n';
}

// 2. Inject Direct WebSocket & DO Interceptor into worker fetch handler
const target = 'const url = new URL(request.url);';
const interceptor = `const url = new URL(request.url);
            if (url.pathname === "/api/ws" && env.STAGE_ROOM) {
                const roomCode = (url.searchParams.get("roomCode") || "DEFAULT").toUpperCase();
                const doId = env.STAGE_ROOM.idFromName(roomCode);
                const stub = env.STAGE_ROOM.get(doId);
                return stub.fetch(request);
            }`;

if (content.includes(target) && !content.includes('url.pathname === "/api/ws"')) {
  content = content.replace(target, interceptor);
  console.log('⚡ Direct StageRoom WebSocket & DO Interceptor injected into worker.js');
}

fs.writeFileSync(workerPath, content, 'utf8');
console.log('✅ StageRoom injection complete.');
