import { readdir, stat } from "fs/promises";
import { join, basename } from "path";
import type { WorkspaceFile } from "@nexus/shared";

const IGNORED = new Set([".git", "node_modules", ".nexus-worktrees", ".DS_Store"]);

class FileExplorer {
  async listFiles(dirPath: string, depth = 3): Promise<WorkspaceFile[]> {
    if (depth <= 0) return [];

    try {
      const entries = await readdir(dirPath);
      const files: WorkspaceFile[] = [];

      for (const entry of entries) {
        if (IGNORED.has(entry)) continue;

        const fullPath = join(dirPath, entry);
        const info = await stat(fullPath);
        const file: WorkspaceFile = {
          name: entry,
          path: fullPath,
          isDirectory: info.isDirectory(),
        };

        if (info.isDirectory()) {
          file.children = await this.listFiles(fullPath, depth - 1);
        }

        files.push(file);
      }

      return files.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    } catch {
      return [];
    }
  }
}

export const fileExplorer = new FileExplorer();
