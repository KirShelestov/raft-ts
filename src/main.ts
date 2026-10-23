import { once } from "node:events";
import { join } from "node:path";
import { createHttpServer } from "./api/http-server.js";
import { parseCliOptions } from "./config/cli.js";
import { loadClusterConfig } from "./config/cluster-config.js";
import { RaftNode } from "./core/raft-node.js";
import { ConsoleLogger } from "./logging/console-logger.js";
import { FileStateStorage } from "./storage/file-state-storage.js";
import { MemoryStateStorage } from "./storage/memory-state-storage.js";
import { HttpTransport } from "./transport/http-transport.js";

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const cluster = loadClusterConfig(options.configPath);
  const self = cluster.nodes.find((member) => member.id === options.id);
  if (self === undefined) {
    throw new Error(`Node ${options.id} is not listed in ${options.configPath}`);
  }
  const peers = cluster.nodes.filter((member) => member.id !== self.id);
  const logger = new ConsoleLogger(self.id);

  const node = new RaftNode({
    id: self.id,
    peers: peers.map((peer) => peer.id),
    storage: options.storage === "memory"
      ? new MemoryStateStorage()
      : new FileStateStorage(join(options.dataDir, `${self.id}.json`)),
    transport: new HttpTransport(new Map(peers.map((peer) => [peer.id, peer.url])), cluster.rpcTimeoutMs),
    timing: cluster.timing,
    logger,
  });

  const server = createHttpServer(node);
  const url = new URL(self.url);
  server.listen(Number(url.port), options.host ?? url.hostname);
  await once(server, "listening");
  logger.info(`listening on ${self.url}`);
  logger.info(
    `storage=${options.storage}, cluster size=${cluster.nodes.length}, quorum=${Math.floor(cluster.nodes.length / 2) + 1}`,
  );
  node.start();

  const shutdown = (): void => {
    node.stop();
    server.close();
    server.closeAllConnections();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
