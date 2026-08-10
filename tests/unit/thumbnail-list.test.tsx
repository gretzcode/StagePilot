import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThumbnailList } from "@/features/material/components/ThumbnailList";

describe("ThumbnailList", () => {
  it("renders thumbnails without throwing when loading state is present", () => {
    const material = {
      id: "material-1",
      type: "url",
      name: "Google Slides Deck",
      externalUrl: "https://docs.google.com/presentation/d/test-presentation/edit",
      slides: [{ index: 1, title: "Slide 1" }],
      totalPages: 1,
    } as any;

    expect(() =>
      renderToStaticMarkup(
        <ThumbnailList material={material} currentPage={1} onSelectSlide={() => undefined} />
      )
    ).not.toThrow();
  });
});
