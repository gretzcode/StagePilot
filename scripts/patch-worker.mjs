import fs from "fs";
import path from "path";

const workerPath = path.resolve(process.cwd(), ".open-next/worker.js");

if (fs.existsSync(workerPath)) {
  let content = fs.readFileSync(workerPath, "utf-8");
  if (!content.includes("export { StageRoom }")) {
    content += `\n// StagePilot Durable Object Export\nexport { StageRoom } from "../workers/stage-room.ts";\n`;
    fs.writeFileSync(workerPath, content, "utf-8");
    console.log("Successfully re-exported StageRoom Durable Object in .open-next/worker.js 🚀");
  }
} else {
  console.warn(".open-next/worker.js not found for patching");
}
