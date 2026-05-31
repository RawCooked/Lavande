/**
 * Builtin tool roster.
 *
 * Adding a tool: create a new file in this folder, import it here, and add it
 * to `builtinTools`. The registry picks it up automatically and the agent
 * exposes it to the LLM. No other code needs to change.
 */
import type { Tool } from '../types.js';
import { clipboardTool } from './clipboard.js';
import { dateTimeTool } from './dateTime.js';
import { listDirTool } from './listDir.js';
import { openAppTool } from './openApp.js';
import { openUrlTool } from './openUrl.js';
import { readFileTool } from './readFile.js';
import { runCommandTool } from './runCommand.js';
import { screenshotTool } from './screenshot.js';
import { writeFileTool } from './writeFile.js';

export const builtinTools: Tool[] = [
  readFileTool,
  writeFileTool,
  listDirTool,
  openAppTool,
  openUrlTool,
  runCommandTool,
  screenshotTool,
  dateTimeTool,
  clipboardTool,
];
