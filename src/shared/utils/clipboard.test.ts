import { afterEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "./clipboard";

describe("clipboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function installExecCommand(result: boolean) {
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn().mockReturnValue(result),
    });
    return document.execCommand as unknown as ReturnType<typeof vi.fn>;
  }

  it("rejects empty content", async () => {
    await expect(copyToClipboard("")).rejects.toThrow("Empty content");
  });

  it("uses navigator.clipboard when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await copyToClipboard("hello");

    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to execCommand and cleans up the textarea", async () => {
    vi.stubGlobal("navigator", {});
    const execCommandSpy = installExecCommand(true);

    await copyToClipboard("fallback");

    expect(execCommandSpy).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("throws when the fallback copy command fails", async () => {
    vi.stubGlobal("navigator", {});
    installExecCommand(false);

    await expect(copyToClipboard("fallback")).rejects.toThrow("copy command failed");
  });
});
