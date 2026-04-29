import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import next from "next";

function parseArgs(argv) {
  const options = {
    hostname: "0.0.0.0",
    port: 3000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--hostname" && argv[index + 1]) {
      options.hostname = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--port" && argv[index + 1]) {
      options.port = Number.parseInt(argv[index + 1], 10);
      index += 1;
    }
  }

  return options;
}

const { hostname, port } = parseArgs(process.argv.slice(2));
const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = next({
  dev: true,
  dir: projectDir,
  hostname,
  port,
});
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((request, response) => handle(request, response)).listen(port, hostname, () => {
    process.stdout.write(`Ready on http://${hostname}:${port}\n`);
  });
}).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
