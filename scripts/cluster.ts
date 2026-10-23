import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { parseClusterCliOptions } from "../src/config/cli.js";
import { loadClusterConfig } from "../src/config/cluster-config.js";
import { collectStatus } from "./cluster-status.js";

const options = parseClusterCliOptions(process.argv.slice(2));
const cluster = loadClusterConfig(options.configPath);
const processes = new Map<string, ChildProcess>();

function startNode(id: string): void {
  if (processes.has(id)) {
    console.log(`${id} is already running`);
    return;
  }
  const args = [
    "--import", "tsx", "src/main.ts", "--config", options.configPath, "--id", id,
    "--storage", options.storage, "--data-dir", options.dataDir,
  ];
  if (options.host !== undefined) {
    args.push("--host", options.host);
  }
  const child = spawn(process.execPath, args, {
    stdio: ["ignore", "inherit", "inherit"],
  });
  child.once("exit", () => processes.delete(id));
  processes.set(id, child);
}

function stopNode(id: string): void {
  const child = processes.get(id);
  if (child === undefined) {
    console.log(`${id} is not running`);
    return;
  }
  child.kill("SIGTERM");
}

function shutdown(): void {
  for (const child of processes.values()) {
    child.kill("SIGTERM");
  }
  process.exit(0);
}

const commands: Record<string, (id?: string) => void | Promise<void>> = {
  status: async () => console.table(await collectStatus(cluster.nodes)),
  stop: (id) => (id ? stopNode(id) : console.log("usage: stop <id>")),
  start: (id) => (id ? startNode(id) : console.log("usage: start <id>")),
  exit: shutdown,
  help: () => console.log("commands: status | stop <id> | start <id> | exit"),
};

for (const member of cluster.nodes) {
  startNode(member.id);
}
console.log(`started ${cluster.nodes.length} nodes; type "help" for commands`);

const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  const [name = "", id] = line.trim().split(/\s+/);
  const command = commands[name];
  if (command === undefined) {
    if (name !== "") {
      console.log(`unknown command "${name}"; type "help"`);
    }
    return;
  }
  void command(id);
});
input.on("close", shutdown);
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
