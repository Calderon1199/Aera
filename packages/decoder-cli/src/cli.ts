#!/usr/bin/env node
/**
 * Reads decode requests on stdin, writes replies on stdout, one JSON object per
 * line each way.
 *
 * This file is the only part of the decoding path that touches a platform API,
 * which is why it is here and not in packages/protocol. All of the judgement
 * lives in translate.ts, where it can be tested without a process.
 */

import { createInterface } from 'node:readline';

import { translate } from './translate.ts';

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of lines) {
  const reply = translate(line);
  if (reply !== undefined) process.stdout.write(`${reply}\n`);
}
