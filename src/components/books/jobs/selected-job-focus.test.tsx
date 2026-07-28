import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelectedJobFocus } from "@/components/books/jobs/selected-job-focus";

describe("SelectedJobFocus", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("scrolls and focuses the selected job row when present", () => {
    vi.useFakeTimers();
    const scrollSpy = vi.fn();
    const focusSpy = vi.fn();

    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollSpy,
    });

    Object.defineProperty(HTMLElement.prototype, "focus", {
      configurable: true,
      value: focusSpy,
    });

    render(
      <>
        <div data-job-id="job-42" tabIndex={-1}>Job Row</div>
        <SelectedJobFocus jobId="job-42" />
      </>,
    );

    act(() => {
      vi.advanceTimersByTime(60);
    });

    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });
});
