import { parseArgs } from "node:util";

export interface LaunchOptions {
  readonly configPath: string;
  readonly dataDir: string;
  readonly storage: "file" | "memory";
  readonly host: string | undefined;
}

export interface CliOptions extends LaunchOptions {
  readonly id: string;
}

const launchOptions = {
  config: { type: "string" },
  "data-dir": { type: "string", default: "data" },
  storage: { type: "string", default: "file" },
  host: { type: "string" },
} as const;

export function parseCliOptions(argv: readonly string[]): CliOptions {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      ...launchOptions,
      id: { type: "string" },
    },
  });
  if (values.id === undefined) {
    throw new Error("Missing required option --id");
  }
  return {
    ...readLaunchOptions(values),
    id: values.id,
  };
}

export function parseClusterCliOptions(argv: readonly string[]): LaunchOptions {
  const { values, positionals } = parseArgs({
    args: [...argv],
    options: launchOptions,
    allowPositionals: true,
  });
  if (positionals.length > 1 || (positionals.length > 0 && values.config !== undefined)) {
    throw new Error("Specify one cluster config, either positionally or with --config");
  }
  return readLaunchOptions(values, positionals[0]);
}

function readLaunchOptions(
  values: { config?: string; "data-dir"?: string; storage?: string; host?: string },
  positionalConfig?: string,
): LaunchOptions {
  const storage = values.storage ?? "file";
  if (storage !== "file" && storage !== "memory") {
    throw new Error("Option --storage must be file or memory");
  }
  return {
    configPath: values.config ?? positionalConfig ?? "cluster.json",
    dataDir: values["data-dir"] ?? "data",
    storage,
    host: values.host,
  };
}
