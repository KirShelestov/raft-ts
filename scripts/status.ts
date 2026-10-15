import { loadClusterConfig } from "../src/config/cluster-config.js";
import { collectStatus } from "./cluster-status.js";

const configPath = process.argv[2] ?? "cluster.json";
console.table(await collectStatus(loadClusterConfig(configPath).nodes));
