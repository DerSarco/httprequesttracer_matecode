import React from "react";
import ReactDOM from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRender = vi.fn();
const mockCreateRoot = vi.fn(() => ({ render: mockRender }));

vi.mock("react-dom/client", () => ({
  default: {
    createRoot: mockCreateRoot,
  },
}));

vi.mock("./App", () => ({
  default: () => <div>App</div>,
}));

describe("main bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it("creates root using #root and renders app in StrictMode", async () => {
    await import("./main");

    const rootElement = document.getElementById("root");
    expect(mockCreateRoot).toHaveBeenCalledWith(rootElement);
    expect(mockRender).toHaveBeenCalledTimes(1);

    const renderTree = mockRender.mock.calls[0]?.[0] as React.ReactElement;
    expect(renderTree.type).toBe(React.StrictMode);
  });
});
