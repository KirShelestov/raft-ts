import { parseArgs } from "node:util";

export interface CliOptions {
  readonly id: string;
  readonly configPath: string;
  readonly dataDir: string;
  readonly host: string | undefined;
}

export function parseCliOptions(argv: readonly string[]): CliOptions {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      id: { type: "string" },
      config: { type: "string", default: "cluster.json" },
      "data-dir": { type: "string", default: "data" },
      host: { type: "string" },
    },
  });
  if (values.id === undefined) {
    throw new Error("Missing required option --id");
  }
  return {
    id: values.id,
    configPath: values.config,
    dataDir: values["data-dir"],
    host: values.host,
  };
}
