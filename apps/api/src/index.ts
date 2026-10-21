// @linkedin-ops/api — entry point of the placeholder listener (see server.ts). TODO(T-008): NestJS bootstrap.
import { createApiServer } from "./server.js";

const port = Number(process.env["PORT"] ?? "3001");
const server = createApiServer();

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(
    `${JSON.stringify({ level: "info", msg: "api placeholder listening", port })}\n`,
  );
});

// Compose runs the process under `init: true`, so SIGTERM from `docker stop` reaches it directly.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    server.close();
    server.closeAllConnections();
  });
}
