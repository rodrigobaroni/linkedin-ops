import { describe, expect, it } from "vitest";
import { CV_POLL, CV_UPLOAD_LIMITS, checkCvFile, cvPollDelayMs } from "./career-cv";

function file(size: number, name = "cv.pdf", type = "application/pdf"): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("checkCvFile", () => {
  it("accepts a PDF up to 5 MB, by type or (type unknown) by extension", () => {
    expect(checkCvFile(file(1024))).toBeNull();
    expect(checkCvFile(file(CV_UPLOAD_LIMITS.maxBytes))).toBeNull();
    expect(checkCvFile(file(10, "CV.PDF", ""))).toBeNull();
  });

  it("refuses empty, oversized and non-PDF files", () => {
    expect(checkCvFile(file(0))).toBe("empty");
    expect(checkCvFile(file(CV_UPLOAD_LIMITS.maxBytes + 1))).toBe("tooLarge");
    expect(checkCvFile(file(10, "cv.docx", "application/msword"))).toBe("notPdf");
    // A declared non-PDF type wins over a .pdf name.
    expect(checkCvFile(file(10, "cv.pdf", "image/png"))).toBe("notPdf");
  });
});

describe("cvPollDelayMs", () => {
  it("starts at 2 s and backs off ×1.5 up to 10 s", () => {
    expect(cvPollDelayMs(0)).toBe(2_000);
    expect(cvPollDelayMs(1)).toBe(3_000);
    expect(cvPollDelayMs(2)).toBe(4_500);
    expect(cvPollDelayMs(4)).toBe(CV_POLL.maxMs);
    expect(cvPollDelayMs(50)).toBe(CV_POLL.maxMs);
  });
});
