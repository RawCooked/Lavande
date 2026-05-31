import { execa } from 'execa';
import { z } from 'zod';
import type { Tool } from '../types.js';

const schema = z.object({
  url: z
    .string()
    .url()
    .describe('Full URL including scheme, e.g. "https://youtube.com".'),
  browser: z
    .string()
    .optional()
    .describe(
      'Optional browser to open it in: "brave", "chrome", "firefox", "msedge". Omit to use the system default. If the browser is already running, most browsers (Brave/Chrome/Edge) reuse the existing window and open a new tab.',
    ),
});

export const openUrlTool: Tool<typeof schema> = {
  name: 'open_url',
  description:
    'Open a web URL in a browser. Use this instead of open_app for anything that starts with http:// or https://. Pass a browser name (e.g. "brave") to force a specific one, or omit it for the system default.',
  schema,
  async execute({ url, browser }) {
    const platform = process.platform;

    try {
      if (platform === 'win32') {
        if (browser) {
          // PowerShell quoting: single-quote the args and double any embedded
          // single-quotes. Same scheme as openApp.ts.
          const b = browser.replace(/'/g, "''");
          const u = url.replace(/'/g, "''");
          await execa('powershell', [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `Start-Process -FilePath '${b}' -ArgumentList '${u}'`,
          ]);
        } else {
          const u = url.replace(/'/g, "''");
          await execa('powershell', [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `Start-Process '${u}'`,
          ]);
        }
      } else if (platform === 'darwin') {
        if (browser) {
          await execa('open', ['-a', browser, url]);
        } else {
          await execa('open', [url]);
        }
      } else {
        if (browser) {
          await execa(browser, [url]);
        } else {
          await execa('xdg-open', [url]);
        }
      }

      return {
        ok: true,
        output: `Opened ${url}${browser ? ` in ${browser}` : ''}`,
        meta: { url, browser, platform },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, output: `Could not open ${url}: ${msg}` };
    }
  },
};
