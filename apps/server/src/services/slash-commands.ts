export interface SlashCommand {
  command: string;       // "task", "tasks"
  action: string | null; // "create", "status", null
  args: Record<string, string>;  // --assign, --priority
  positional: string;    // the title text
}

export function parseSlashCommand(input: string): SlashCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  // Remove leading slash and split into tokens
  const withoutSlash = trimmed.slice(1);
  const tokens = tokenize(withoutSlash);
  if (tokens.length === 0) return null;

  const command = tokens[0].toLowerCase();
  if (command !== "task" && command !== "tasks") return null;

  let action: string | null = null;
  let positional = "";
  const args: Record<string, string> = {};

  // Determine action: second token if not a flag and not a quoted string
  let startIdx = 1;
  if (tokens[1] && !tokens[1].startsWith("--")) {
    const knownActions = ["create", "status"];
    if (knownActions.includes(tokens[1].toLowerCase())) {
      action = tokens[1].toLowerCase();
      startIdx = 2;
    }
  }

  // Parse remaining tokens
  const positionalParts: string[] = [];
  let i = startIdx;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = tokens[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i += 2;
      } else {
        args[key] = "true";
        i += 1;
      }
    } else {
      positionalParts.push(token);
      i += 1;
    }
  }

  positional = positionalParts.join(" ");

  return { command, action, args, positional };
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < input.length) {
    // Skip whitespace
    while (i < input.length && input[i] === " ") i++;
    if (i >= input.length) break;

    if (input[i] === '"' || input[i] === "'") {
      const quote = input[i];
      i++;
      let token = "";
      while (i < input.length && input[i] !== quote) {
        token += input[i];
        i++;
      }
      i++; // closing quote
      if (token) tokens.push(token);
    } else {
      let token = "";
      while (i < input.length && input[i] !== " ") {
        token += input[i];
        i++;
      }
      if (token) tokens.push(token);
    }
  }
  return tokens;
}
