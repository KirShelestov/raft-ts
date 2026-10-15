export interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
};
