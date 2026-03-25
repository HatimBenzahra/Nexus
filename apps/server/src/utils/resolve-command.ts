import { execSync } from "child_process";

export function resolveCommand(cmd: string): string {
  try {
    return execSync(`zsh -lc 'which ${cmd}'`, { encoding: "utf-8" }).trim();
  } catch {
    return cmd;
  }
}
