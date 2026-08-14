import { describe, it, expect } from "vitest";
import { validateUploadedFile, validateExternalUrl } from "@/features/material/validator";

describe("Material validation cleanup", () => {
  it("supports pdf and image uploads only", () => {
    expect(validateUploadedFile("deck.pdf", "application/pdf", 5 * 1024 * 1024)).toMatchObject({
      valid: true,
      materialType: "pdf",
    });

    expect(validateUploadedFile("cover.png", "image/png", 2 * 1024 * 1024)).toMatchObject({
      valid: true,
      materialType: "image",
    });

    expect(validateUploadedFile("presentation.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", 10 * 1024 * 1024)).toMatchObject({
      valid: false,
    });
  });

  it("supports external URL types without pptx conversion", () => {
    expect(validateExternalUrl("https://drive.google.com/file/d/abc123/view")).toMatchObject({
      valid: true,
      materialType: "pdf",
    });

    expect(validateExternalUrl("https://www.youtube.com/watch?v=abc123")).toMatchObject({
      valid: true,
      materialType: "video",
    });
  });
});
