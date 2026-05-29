import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { z } from 'zod';
import { cacheDir } from '../../config/paths.js';
import type { Tool } from '../types.js';

const schema = z.object({
  region: z
    .enum(['full', 'window', 'selection'])
    .optional()
    .describe(
      'What to capture. "full" = entire screen (default), "window" = active/clicked window, "selection" = user-drawn region.',
    ),
});

type Region = 'full' | 'window' | 'selection';

/**
 * Capture the screen to a PNG file and hand the image back to the model.
 *
 * The returned `meta.images` carries the saved file path; the provider layer
 * (e.g. Gemini) inlines that image into the next request so the model can
 * actually *see* and describe the screenshot — not just learn its path.
 */
export const screenshotTool: Tool<typeof schema> = {
  name: 'screenshot',
  description:
    "Capture a screenshot of the user's screen and let the assistant see it. Use this when the user asks what is on their screen, to describe/explain what they're looking at, or to read on-screen content. Region: 'full' (whole screen, default), 'window' (active window), or 'selection' (user draws a region).",
  schema,
  async execute({ region }, ctx) {
    const reg: Region = region ?? 'full';
    const outPath = path.join(cacheDir, `screenshot-${Date.now()}.png`);

    try {
      await mkdir(cacheDir, { recursive: true });

      const platform = process.platform;
      if (platform === 'win32') {
        await captureWindows(outPath, reg, ctx.signal);
      } else if (platform === 'darwin') {
        await captureMac(outPath, reg, ctx.signal);
      } else {
        await captureLinux(outPath, reg, ctx.signal);
      }

      return {
        ok: true,
        output: `Screenshot captured (${reg}) and saved to ${outPath}. The image is attached for review.`,
        meta: {
          path: outPath,
          region: reg,
          images: [{ mimeType: 'image/png', path: outPath }],
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        output: `Could not capture the screenshot: ${msg}`,
        meta: { region: reg },
      };
    }
  },
};

/* ───────────────────── platform capture ───────────────────── */

/**
 * Windows: capture via .NET (System.Drawing) in a PowerShell one-liner.
 * "full" grabs the entire virtual desktop (all monitors). "window" grabs the
 * foreground window's bounds via Win32 GetForegroundWindow/GetWindowRect.
 * "selection" isn't natively scriptable, so it falls back to the full screen.
 */
async function captureWindows(outPath: string, region: Region, signal: AbortSignal): Promise<void> {
  const target = outPath.replace(/'/g, "''");
  const useWindow = region === 'window';

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
${
  useWindow
    ? `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Rr, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
}
"@
$r = New-Object W+R
[void][W]::GetWindowRect([W]::GetForegroundWindow(), [ref]$r)
$x = $r.L; $y = $r.T; $w = $r.Rr - $r.L; $h = $r.B - $r.T
if ($w -le 0 -or $h -le 0) {
  $vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $x = $vs.X; $y = $vs.Y; $w = $vs.Width; $h = $vs.Height
}
`
    : `
$vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
$x = $vs.X; $y = $vs.Y; $w = $vs.Width; $h = $vs.Height
`
}
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($x, $y, 0, 0, (New-Object System.Drawing.Size($w, $h)))
$bmp.Save('${target}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
`.trim();

  await execa('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    cancelSignal: signal,
  });
}

/** macOS: `screencapture`. -x silences the shutter sound. */
async function captureMac(outPath: string, region: Region, signal: AbortSignal): Promise<void> {
  const flags =
    region === 'selection'
      ? ['-x', '-i'] // interactive selection
      : region === 'window'
        ? ['-x', '-W'] // interactive window pick
        : ['-x']; // full screen
  await execa('screencapture', [...flags, outPath], { cancelSignal: signal });
}

/**
 * Linux: try the common tools in order. Wayland favors `grim`, X11 has
 * `gnome-screenshot`, `scrot`, or ImageMagick's `import`.
 */
async function captureLinux(outPath: string, region: Region, signal: AbortSignal): Promise<void> {
  const attempts: Array<{ cmd: string; args: string[] }> = [];

  if (region === 'selection') {
    attempts.push({ cmd: 'gnome-screenshot', args: ['-a', '-f', outPath] });
    attempts.push({ cmd: 'scrot', args: ['-s', outPath] });
  } else if (region === 'window') {
    attempts.push({ cmd: 'gnome-screenshot', args: ['-w', '-f', outPath] });
    attempts.push({ cmd: 'scrot', args: ['-u', outPath] });
    attempts.push({ cmd: 'import', args: ['-window', 'root', outPath] });
  } else {
    attempts.push({ cmd: 'gnome-screenshot', args: ['-f', outPath] });
    attempts.push({ cmd: 'grim', args: [outPath] });
    attempts.push({ cmd: 'scrot', args: [outPath] });
    attempts.push({ cmd: 'import', args: ['-window', 'root', outPath] });
  }

  let lastErr: unknown;
  for (const { cmd, args } of attempts) {
    try {
      await execa(cmd, args, { cancelSignal: signal });
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `No screenshot tool succeeded. Install one of: gnome-screenshot, grim, scrot, imagemagick. (${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    })`,
  );
}
