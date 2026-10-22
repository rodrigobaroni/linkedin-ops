import { API_V1_BASE_PATH, REQUESTED_WITH_HEADER } from "@linkedin-ops/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { resetMockAuth } from "./auth-handlers";
import { mockActiveCv, resetMockCareer } from "./career-handlers";
import { mockJob, mockJobsState } from "./career-jobs-handlers";

const base = `http://localhost:3000${API_V1_BASE_PATH}`;

function post(path: string, body: unknown, withHeader: boolean) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(withHeader ? { [REQUESTED_WITH_HEADER.name]: REQUESTED_WITH_HEADER.value } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("career jobs mock: the API's request rules", () => {
  beforeEach(() => {
    resetMockAuth({ loggedIn: true });
    resetMockCareer({ active: mockActiveCv() });
  });

  it("every mutation needs X-Requested-With (N4), like career-handlers", async () => {
    const job = mockJob("https://empresa.com/vaga", "FAILED");
    const batch = await post("/career/batches", { urls: ["https://empresa.com/v"] }, false);
    expect(batch.status).toBe(403);
    expect((await post(`/career/jobs/${job.id}/retry`, {}, false)).status).toBe(403);
    expect(
      (await post(`/career/jobs/${job.id}/text`, { text: "x".repeat(300) }, false)).status,
    ).toBe(403);
    const remove = await fetch(`${base}/career/jobs/${job.id}`, { method: "DELETE" });
    expect(remove.status).toBe(403);
    expect(mockJobsState().jobs).toHaveLength(1);
    expect((await post("/career/batches", { urls: ["https://empresa.com/v"] }, true)).status).toBe(
      202,
    );
  });

  it("an {id} that is not a UUID → 400 VALIDATION_FAILED", async () => {
    const response = await fetch(`${base}/career/jobs/nao-e-uuid`);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION_FAILED" });
  });
});
