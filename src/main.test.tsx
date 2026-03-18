import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const renderMock = vi.fn();
const createRootMock = vi.fn(() => ({ render: renderMock }));

vi.mock("react-dom/client", () => ({
  default: { createRoot: createRootMock },
  createRoot: createRootMock,
}));

vi.mock("./App", () => ({
  default: () => null,
}));

describe("main bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    renderMock.mockReset();
    createRootMock.mockClear();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it("mounts the app in StrictMode using #root", async () => {
    await import("./main");

    const rootElement = document.getElementById("root");
    expect(createRootMock).toHaveBeenCalledWith(rootElement);
    expect(renderMock).toHaveBeenCalledTimes(1);

    const renderedTree = renderMock.mock.calls[0]?.[0] as React.ReactElement;
    expect(renderedTree.type).toBe(React.StrictMode);
  });
});
