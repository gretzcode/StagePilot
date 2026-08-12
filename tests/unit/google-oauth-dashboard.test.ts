import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Google OAuth dashboard entrypoint", () => {
  it("uses a plain anchor for side-effecting OAuth connect navigation", () => {
    const dashboard = readFileSync(join(process.cwd(), "src/app/dashboard/page.tsx"), "utf8");
    expect(dashboard).toContain('<a\n            href="/api/google-drive/connect"');
    expect(dashboard).not.toContain('<Link\n            href="/api/google-drive/connect"');
  });
});
