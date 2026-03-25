import simpleGit from "simple-git";
import type { DiffEntry } from "@nexus/shared";

class DiffService {
  async getDiff(workDir: string): Promise<DiffEntry[]> {
    try {
      const git = simpleGit(workDir);
      const diff = await git.diff(["--stat", "--patch"]);

      if (!diff.trim()) return [];

      return this.parseDiff(diff);
    } catch {
      return [];
    }
  }

  private parseDiff(raw: string): DiffEntry[] {
    const entries: DiffEntry[] = [];
    const fileSections = raw.split(/^diff --git /m).filter(Boolean);

    for (const section of fileSections) {
      const fileMatch = section.match(/a\/(.+?) b\//);
      if (!fileMatch) continue;

      const filePath = fileMatch[1];
      const additions = (section.match(/^\+[^+]/gm) || []).length;
      const deletions = (section.match(/^-[^-]/gm) || []).length;

      entries.push({
        filePath,
        additions,
        deletions,
        patch: section.slice(0, 2000),
      });
    }

    return entries;
  }
}

export const diffService = new DiffService();
