import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { loadClusterConfig } from "../src/config/cluster-config.js";
import { collectStatus } from "./cluster-status.js";

const configPath = process.argv[2] ?? "cluster.json";
const cluster = loadClusterConfig(configPath);
const processes = new Map<string, ChildProcess>();

function startNode(id: string): void {
  if (processes.has(id)) {
    console.log(`${id} is already running`);
    return;
  }
  const child = spawn(process.execPath, ["--import", "tsx", "src/main.ts", "--config", configPath, "--id", id], {
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
