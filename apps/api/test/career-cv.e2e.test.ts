/**
 * CV base HTTP edge without a database (career PR 2): the N4 multipart exception of `POST /career/cv`,
 * the upload checks that run before anything is stored (size, PDF signature, text layer) and the auth
 * levels of the four routes, and the parsing isolation (worker thread, deadline, concurrency cap; Sentinela
 * S-1). The stored flow is covered by `career-cv.integration.test.ts`.
 */
import { CV_UPLOAD_LIMITS, ProblemDetailsSchema } from "@linkedin-ops/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildPdf,
  fictitiousCvPdf,
  fictitiousCvPdfOfSize,
  xObjectBombPdf,
} from "./fixtures/pdf.js";
import {
  APP_BASE_URL,
  cookieHeader,
  createTestApp,
  mutationHeaders,
  TEST_USER,
  type TestApp,
} from "./helpers.js";
import {
  CV_PDF_EXTRACTOR,
  CvPdfExtractor,
  DEFAULT_CV_PDF_EXTRACTOR_LIMITS,
} from "../src/career/cv-pdf.extractor.js";
import { CV_EXTRACT_QUEUE, type CvExtractQueue } from "../src/career/career.queue.js";
import { REQUESTED_WITH_VALUE } from "../src/common/route-access.guard.js";

const UPLOAD = "/api/v1/career/cv";
/**
 * Test deadlines. Every parse starts a cold thread (in tests through the tsx loader), which can take
 * seconds on a CI runner: legitimate PDFs get a deadline no runner reaches; only the hostile-PDF app uses
 * a short one, and its assertions are lower bounds (a timer never fires early), never tight ceilings.
 * Production limits stay DEFAULT_CV_PDF_EXTRACTOR_LIMITS (10 s, 128 MiB, 2 at once).
 */
const LEGIT_PARSE_TIMEOUT_MS = 60_000;
const HOSTILE_PARSE_TIMEOUT_MS = 3_000;

/** A ready producer, so a stored-path failure comes from the (stub) database, not from the queue. */
const readyQueue: CvExtractQueue = {
  ensureReady: () => Promise.resolve(),
  enqueue: () => Promise.reject(new Error("not reached: the draft insert fails first")),
};

describe("career CV base routes (no database)", () => {
  let app: TestApp;
  let cookie: string;

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [
        [CV_EXTRACT_QUEUE, readyQueue],
        [
          CV_PDF_EXTRACTOR,
          new CvPdfExtractor({
            ...DEFAULT_CV_PDF_EXTRACTOR_LIMITS,
            timeoutMs: LEGIT_PARSE_TIMEOUT_MS,
          }),
        ],
      ],
    });
    cookie = cookieHeader(app.sessions.issueForTest(TEST_USER).cookieValue);
  });
  afterAll(() => app.close());

  /** Browser upload headers: Origin + X-Requested-With + session; supertest sets the multipart type. */
  function uploadHeaders(overrides: Record<string, string> = {}): Record<string, string> {
    return {
      origin: APP_BASE_URL,
      "x-requested-with": REQUESTED_WITH_VALUE,
      cookie,
      ...overrides,
    };
  }

  function upload(
    file: Buffer,
    headers = uploadHeaders(),
    field: string = CV_UPLOAD_LIMITS.fieldName,
    target: TestApp = app,
  ) {
    return target.request
      .post(UPLOAD)
      .set(headers)
      .attach(field, file, { filename: "cv.pdf", contentType: "application/pdf" });
  }

  function expectProblem(res: { body: unknown; headers: Record<string, string> }, code: string) {
    expect(ProblemDetailsSchema.safeParse(res.body).success).toBe(true);
    expect((res.body as { code: string }).code).toBe(code);
    expect(res.headers["cache-control"]).toBe("no-store");
  }

  describe("N4: multipart only where the registry declares it", () => {
    it("the upload route answers 415 to a JSON body (type differs from the declared one)", async () => {
      const res = await app.request
        .post(UPLOAD)
        .set(mutationHeaders({ cookie }))
        .send({})
        .expect(415);
      expectProblem(res, "UNSUPPORTED_MEDIA_TYPE");
      expect(res.body.detail).toBe("Content-Type deve ser multipart/form-data");
    });

    it("the upload route still requires X-Requested-With and the exact Origin (403)", async () => {
      const { "x-requested-with": _omitted, ...withoutHeader } = uploadHeaders();
      expectProblem(await upload(fictitiousCvPdf(), withoutHeader).expect(403), "CSRF_REJECTED");
      expectProblem(
        await upload(fictitiousCvPdf(), uploadHeaders({ origin: "https://evil.example" })).expect(
          403,
        ),
        "CSRF_REJECTED",
      );
      expectProblem(
        await upload(fictitiousCvPdf(), uploadHeaders({ "sec-fetch-site": "cross-site" })).expect(
          403,
        ),
        "CSRF_REJECTED",
      );
    });

    it("a wrong type without X-Requested-With is CSRF (403), not 415", async () => {
      const res = await app.request
        .post(UPLOAD)
        .set({ origin: APP_BASE_URL, cookie, "content-type": "text/plain" })
        .send("x")
        .expect(403);
      expectProblem(res, "CSRF_REJECTED");
    });

    it("the upload route requires a session (401)", async () => {
      const { cookie: _omitted, ...anonymous } = uploadHeaders();
      expectProblem(await upload(fictitiousCvPdf(), anonymous).expect(401), "AUTH_REQUIRED");
    });

    it("a JSON route still answers 403 to multipart (confirm)", async () => {
      const res = await app.request
        .post("/api/v1/career/cv/confirm")
        .set(uploadHeaders())
        .attach("file", fictitiousCvPdf(), { filename: "cv.pdf", contentType: "application/pdf" })
        .expect(403);
      expectProblem(res, "CSRF_REJECTED");
    });
  });

  describe("upload checks before anything is stored", () => {
    it("rejects a valid PDF of exactly 5 MiB + 1 byte with 413 (5 MiB itself is accepted: integration)", async () => {
      const file = fictitiousCvPdfOfSize(CV_UPLOAD_LIMITS.maxBytes + 1);
      expectProblem(await upload(file).expect(413), "PAYLOAD_TOO_LARGE");
    });

    it("rejects a non-PDF by its signature with 415, whatever its name and declared type", async () => {
      const res = await upload(Buffer.from("PK\u0003\u0004fake-docx")).expect(415);
      expectProblem(res, "UNSUPPORTED_MEDIA_TYPE");
      expect(res.body.detail).toBe("Envie o CV em PDF");
    });

    it("rejects a scanned PDF (no text layer) with 422 CV_PDF_UNREADABLE", async () => {
      const res = await upload(buildPdf({ pages: [[]] })).expect(422);
      expectProblem(res, "CV_PDF_UNREADABLE");
      expect(res.body.detail).toMatch(/texto selecionável/);
    });

    it("rejects an encrypted PDF with 422 CV_PDF_UNREADABLE", async () => {
      const res = await upload(buildPdf({ pages: [["Ana"]], encrypted: true })).expect(422);
      expectProblem(res, "CV_PDF_UNREADABLE");
      expect(res.body.detail).toMatch(/protegido por senha/);
    });

    it("rejects a missing file part with 400", async () => {
      const res = await upload(fictitiousCvPdf(), uploadHeaders(), "document").expect(400);
      expectProblem(res, "VALIDATION_FAILED");
      expect(res.body.errors).toEqual([{ path: ["file"], message: "Arquivo obrigatório" }]);
    });

    it("rejects a second part (one file, no other field) with 413", async () => {
      const res = await app.request
        .post(UPLOAD)
        .set(uploadHeaders())
        .field("note", "x")
        .attach("file", fictitiousCvPdf(), { filename: "cv.pdf", contentType: "application/pdf" })
        .expect(413);
      expectProblem(res, "PAYLOAD_TOO_LARGE");
    });
  });

  describe("auth levels", () => {
    it("GET requires a session", async () => {
      expectProblem(await app.request.get(UPLOAD).expect(401), "AUTH_REQUIRED");
    });

    it("DELETE requires X-CSRF-Token and a recent re-authentication", async () => {
      const plain = app.sessions.issueForTest(TEST_USER);
      const headers = mutationHeaders({ cookie: cookieHeader(plain.cookieValue) });
      // The web sends `{}` on every mutation so the JSON Content-Type check is meaningful.
      expectProblem(
        await app.request.delete(UPLOAD).set(headers).send({}).expect(403),
        "CSRF_REJECTED",
      );
      const res = await app.request
        .delete(UPLOAD)
        .set({ ...headers, "x-csrf-token": plain.session.csrfToken })
        .send({})
        .expect(401);
      expectProblem(res, "AUTH_REAUTH_REQUIRED");
    });
  });

  describe("parsing isolation (Sentinela S-1)", () => {
    let isolated: TestApp;
    let isolatedHeaders: Record<string, string>;

    beforeAll(async () => {
      isolated = await createTestApp({
        overrides: [
          [
            CV_PDF_EXTRACTOR,
            new CvPdfExtractor({
              ...DEFAULT_CV_PDF_EXTRACTOR_LIMITS,
              timeoutMs: HOSTILE_PARSE_TIMEOUT_MS,
              maxConcurrent: 1,
              retryAfterSeconds: 3,
            }),
          ],
        ],
      });
      isolatedHeaders = uploadHeaders({
        cookie: cookieHeader(isolated.sessions.issueForTest(TEST_USER).cookieValue),
      });
    });
    afterAll(() => isolated.close());

    it(
      "terminates a hostile PDF at the deadline (422) while the API keeps answering, and caps concurrency (503)",
      async () => {
        const started = Date.now();
        const hostile = upload(xObjectBombPdf(), isolatedHeaders, "file", isolated).then(
          (res) => res,
        );

        // While that thread runs, the API answers other requests at once (its event loop is free).
        await new Promise((resolve) => setTimeout(resolve, 300));
        const healthStarted = Date.now();
        await isolated.request.get("/api/v1/health").expect(200);
        expect(Date.now() - healthStarted).toBeLessThan(1_000);

        // The only parsing slot is taken: another upload is told to come back.
        const busy = await upload(fictitiousCvPdf(), isolatedHeaders, "file", isolated).expect(503);
        expectProblem(busy, "SERVICE_NOT_READY");
        expect(busy.headers["retry-after"]).toBe("3");

        const res = await hostile;
        expect(res.status).toBe(422);
        expectProblem(res, "CV_PDF_UNREADABLE");
        expect(res.body.detail).toMatch(/complexo demais/);
        // Ended by the deadline (never earlier); the API was not blocked meanwhile (above).
        expect(Date.now() - started).toBeGreaterThanOrEqual(HOSTILE_PARSE_TIMEOUT_MS - 50);
      },
      HOSTILE_PARSE_TIMEOUT_MS + 30_000,
    );
  });

  it("never logs CV text, even when the request fails after extraction", async () => {
    const marker = "CANARIO-E2E-7f3a9c";
    // The stub database rejects the draft insert: 500 after the PDF text was extracted.
    const res = await upload(fictitiousCvPdf(marker)).expect(500);
    expectProblem(res, "INTERNAL");
    expect(JSON.stringify(res.body)).not.toContain(marker);
    expect(app.logs.text).not.toContain(marker);
    expect(app.logs.text).not.toContain("Ana Exemplo");
  });
});
