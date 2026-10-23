import { parseArgs } from "node:util";

export interface CliOptions {
  readonly id: string;
  readonly configPath: string;
  readonly dataDir: string;
  readonly storage: "file" | "memory";
  readonly host: string | undefined;
}

export function parseCliOptions(argv: readonly string[]): CliOptions {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      id: { type: "string" },
      config: { type: "string", default: "cluster.json" },
      "data-dir": { type: "string", default: "data" },
      storage: { type: "string", default: "file" },
      host: { type: "string" },
    },
  });
  if (values.id === undefined) {
    throw new Error("Missing required option --id");
  }
  if (values.storage !== "file" && values.storage !== "memory") {
    throw new Error("Option --storage must be file or memory");
  }
  return {
    id: values.id,
    configPath: values.config,
    dataDir: values["data-dir"],
    storage: values.storage,
    host: values.host,
  };
}
