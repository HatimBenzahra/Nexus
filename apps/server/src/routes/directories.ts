import { Router } from "express";
import { readdir, stat } from "fs/promises";
import { join, resolve, normalize } from "path";
import { homedir } from "os";

export const directoryRoutes = Router();

directoryRoutes.get("/", async (req, res) => {
  const home = homedir();
  const requestedPath = resolve((req.query.path as string) || home);

  if (!normalize(requestedPath).startsWith(normalize(home) + "/") && normalize(requestedPath) !== normalize(home)) {
    res.status(403).json({ error: "Access denied: path is outside home directory" });
    return;
  }

  try {
    const entries = await readdir(requestedPath);
    const dirs: { name: string; path: string }[] = [];

    for (const entry of entries) {
      if (entry.startsWith(".")) continue;
      try {
        const fullPath = join(requestedPath, entry);
        const info = await stat(fullPath);
        if (info.isDirectory()) {
          dirs.push({ name: entry, path: fullPath });
        }
      } catch {
        // skip inaccessible entries
      }
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      current: requestedPath,
      parent: join(requestedPath, ".."),
      directories: dirs,
    });
  } catch {
    res.status(400).json({ error: `Cannot read directory: ${requestedPath}` });
  }
});
