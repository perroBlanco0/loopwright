import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function makeTools(workspaceDir) {
  function safePath(p) {
    const target = resolve(workspaceDir, p);
    const rel = relative(workspaceDir, target);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`Path escapes workspace: ${p}`);
    }
    return target;
  }

  const definitions = [
    {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read a UTF-8 text file from the workspace',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'write_file',
        description: 'Write (or overwrite) a UTF-8 text file in the workspace, creating parent dirs',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['path', 'content'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'run_command',
        description:
          'Run a shell command inside the workspace (e.g. "npm test", "npm run build"). ' +
          'Returns stdout, stderr, and exit code.',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string' },
            timeoutMs: { type: 'number', description: 'default 60000' },
          },
          required: ['command'],
        },
      },
    },
  ];

  async function call(name, args) {
    if (name === 'read_file') {
      const content = await readFile(safePath(args.path), 'utf8');
      return { content };
    }
    if (name === 'write_file') {
      const target = safePath(args.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, args.content, 'utf8');
      return { ok: true, bytes: Buffer.byteLength(args.content, 'utf8') };
    }
    if (name === 'run_command') {
      try {
        const { stdout, stderr } = await execFileAsync('bash', ['-lc', args.command], {
          cwd: workspaceDir,
          timeout: args.timeoutMs || 60_000,
          maxBuffer: 10 * 1024 * 1024,
        });
        return { exitCode: 0, stdout, stderr };
      } catch (err) {
        return {
          exitCode: err.code ?? 1,
          stdout: err.stdout || '',
          stderr: err.stderr || String(err.message || err),
        };
      }
    }
    throw new Error(`Unknown tool: ${name}`);
  }

  return { definitions, call };
}
