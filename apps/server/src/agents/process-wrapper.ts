import { EventEmitter } from "events";
import * as pty from "node-pty";
import { resolveCommand } from "../utils/resolve-command.js";

export class ProcessWrapper extends EventEmitter {
  private process: pty.IPty | null = null;
  private _pid: number | undefined;
  private resolvedCommand: string;

  constructor(
    command: string,
    private args: string[],
    private cwd: string,
  ) {
    super();
    this.resolvedCommand = resolveCommand(command);
  }

  get pid(): number | undefined {
    return this._pid;
  }

  start() {
    this.process = pty.spawn(this.resolvedCommand, this.args, {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd: this.cwd,
      env: { ...process.env, TERM: "xterm-256color" } as Record<string, string>,
    });

    this._pid = this.process.pid;

    // Auto-handle trust prompt: Claude Code shows a trust prompt on first run.
    // We accumulate output and detect the prompt, then send Enter to confirm.
    let trustHandled = false;
    let accumulatedOutput = "";

    this.process.onData((data: string) => {
      this.emit("output", data);

      if (!trustHandled) {
        accumulatedOutput += data;
        // Detect ink selection prompt: need Space (select) then Enter (confirm)
        if (
          accumulatedOutput.includes("trust") &&
          accumulatedOutput.includes("Enter to confirm")
        ) {
          trustHandled = true;
          // Space to select option 1, then Enter to confirm
          setTimeout(() => {
            this.process?.write(" ");
            setTimeout(() => {
              this.process?.write("\r");
            }, 300);
          }, 500);
        }
        // Stop accumulating after 30KB
        if (accumulatedOutput.length > 30_000) {
          trustHandled = true;
        }
      }
    });

    this.process.onExit(({ exitCode }) => {
      this.emit("exit", exitCode);
      this.process = null;
    });
  }

  write(data: string) {
    this.process?.write(data);
  }

  resize(cols: number, rows: number) {
    this.process?.resize(cols, rows);
  }

  stop() {
    if (this.process) {
      this.process.kill();
      setTimeout(() => {
        if (this.process) {
          this.process.kill("SIGKILL");
        }
      }, 5000);
    }
  }
}
