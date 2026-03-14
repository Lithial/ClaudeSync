import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SyncClient } from "../client.js";
import { MessageTypes, createMessage } from "@claude-sync/protocol";

const DEFAULT_SENSITIVE_PATTERNS = [
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
  "*.jks",
  "*.keystore",
  ".mcp.json",
  "credentials.json",
  "service-account*.json",
  "secrets.yml",
  "secrets.yaml",
  "**/secrets/**",
  ".npmrc",
  ".pypirc",
  ".docker/config.json",
  "id_rsa",
  "id_ed25519",
  "*.secret",
];

function loadGitignorePatterns(): string[] {
  try {
    const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf-8",
    }).trim();
    const gitignorePath = resolve(gitRoot, ".gitignore");
    if (existsSync(gitignorePath)) {
      return readFileSync(gitignorePath, "utf-8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"));
    }
  } catch {
    // ignore
  }
  return [];
}

function getSensitiveFiles(): string[] {
  // Ask git what would be staged by `git add -A`
  const wouldStage = execFileSync(
    "git",
    ["add", "--dry-run", "-A"],
    { encoding: "utf-8" },
  )
    .split("\n")
    .map((line) => line.replace(/^add '(.+)'$/, "$1").trim())
    .filter(Boolean);

  const gitignored = new Set(loadGitignorePatterns());

  return wouldStage.filter((file) => {
    const basename = file.split("/").pop() ?? "";
    return DEFAULT_SENSITIVE_PATTERNS.some((pattern) => {
      // Exact match
      if (pattern === basename || pattern === file) return true;
      // Glob-style: *.ext
      if (pattern.startsWith("*.") && basename.endsWith(pattern.slice(1))) return true;
      // Prefix match: .env.*
      if (pattern.endsWith(".*") && basename.startsWith(pattern.slice(0, -2))) return true;
      // Directory glob: **/secrets/**
      if (pattern.includes("**/") && file.includes(pattern.replace(/\*\*\//g, ""))) return true;
      // service-account*.json
      if (pattern.includes("*")) {
        const re = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
        if (re.test(basename)) return true;
      }
      return false;
    }) && !gitignored.has(basename) && !gitignored.has(file);
  });
}

export interface GitSyncArgs {
  message: string;
  branch?: string;
  notify?: boolean;
  notifyPeers?: string[];
}

export function gitSync(
  client: SyncClient | null,
  peerName: string,
  args: GitSyncArgs,
): { success: boolean; output: string } {
  try {
    const outputs: string[] = [];

    // Check for sensitive files before staging
    const sensitiveFiles = getSensitiveFiles();
    if (sensitiveFiles.length > 0) {
      return {
        success: false,
        output: `Refusing to stage potentially sensitive files:\n${sensitiveFiles.map((f) => `  - ${f}`).join("\n")}\n\nAdd them to .gitignore or remove them, then retry.`,
      };
    }

    // Stage all changes
    outputs.push(execFileSync("git", ["add", "-A"], { encoding: "utf-8" }));

    // Commit
    outputs.push(
      execFileSync("git", ["commit", "-m", args.message], { encoding: "utf-8" }),
    );

    // Push
    const branch =
      args.branch ??
      execFileSync("git", ["branch", "--show-current"], { encoding: "utf-8" }).trim();
    outputs.push(
      execFileSync("git", ["push", "origin", branch], { encoding: "utf-8" }),
    );

    const output = outputs.filter(Boolean).join("\n");

    // Notify peers if requested
    if (args.notify && client?.connected) {
      const taskId = crypto.randomUUID();

      if (args.notifyPeers?.length) {
        for (const peer of args.notifyPeers) {
          client.send(
            createMessage(MessageTypes.TASK_STATUS, peerName, peer, {
              taskId,
              status: "received",
              message: `Git sync: ${args.message} (branch: ${branch})`,
            }),
          );
        }
      } else {
        client.send(
          createMessage(MessageTypes.TASK_STATUS, peerName, null, {
            taskId,
            status: "received",
            message: `Git sync: ${args.message} (branch: ${branch})`,
          }),
        );
      }
    }

    return { success: true, output };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: message };
  }
}
