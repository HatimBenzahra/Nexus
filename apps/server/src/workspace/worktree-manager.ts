import simpleGit from "simple-git";

class WorktreeManager {
  async createWorktree(repoPath: string, agentId: string): Promise<{ path: string; branch: string }> {
    const git = simpleGit(repoPath);
    const branch = `nexus/${agentId}`;
    const worktreePath = `${repoPath}/.nexus-worktrees/${agentId}`;

    await git.raw(["worktree", "add", "-b", branch, worktreePath]);

    return { path: worktreePath, branch };
  }

  async removeWorktree(repoPath: string, agentId: string): Promise<void> {
    const git = simpleGit(repoPath);
    const worktreePath = `${repoPath}/.nexus-worktrees/${agentId}`;

    try {
      await git.raw(["worktree", "remove", worktreePath, "--force"]);
    } catch {
      // Worktree may already be removed
    }

    try {
      const branch = `nexus/${agentId}`;
      await git.raw(["branch", "-D", branch]);
    } catch {
      // Branch may already be deleted
    }
  }

  async listWorktrees(repoPath: string): Promise<string[]> {
    const git = simpleGit(repoPath);
    const result = await git.raw(["worktree", "list", "--porcelain"]);
    return result
      .split("\n")
      .filter((line) => line.startsWith("worktree "))
      .map((line) => line.replace("worktree ", ""));
  }
}

export const worktreeManager = new WorktreeManager();
